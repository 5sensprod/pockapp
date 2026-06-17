// frontend/modules/stock/InventoryPageAppPos.tsx
// Page d'inventaire physique AppPOS
// Vues : accueil → création session → liste catégories → comptage → validation
//
// MODIFIÉ :
// - Le header interne est remplacé par ModulePageShell
// - Le bouton Historique passe en actions du shell
// - La page est autonome : fonctionne dans ou hors Layout global

import { ModulePageShell, StatusBadge } from '@/components/module-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { appPosApi } from '@/lib/apppos/apppos-api'
import { getAppPosImageUrl } from '@/lib/apppos/apppos-config'
import { useAppPosCategoriesWithCounts } from '@/lib/apppos/apppos-hooks'
import { appPosTransformers } from '@/lib/apppos/apppos-transformers'
import { createInventoryEntries } from '@/lib/inventory/inventory-pocketbase'
import { INVENTORY_ENTRIES_COLLECTION } from '@/lib/inventory/inventory-types'
import type {
	CategoryInventoryStatus,
	CategoryInventorySummary,
	InventoryEntry,
	InventorySession,
} from '@/lib/inventory/inventory-types'
import {
	useActiveSessions,
	useCreateInventorySession,
	useInventoryHistory,
	useInventorySession,
	useInventorySessionDetail,
	useSessionProgress,
} from '@/lib/inventory/useInventorySession'
import { useScanner } from '@/lib/pos/scanner'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	ClipboardList,
	Clock,
	History,
	Loader2,
	Lock,
	MinusCircle,
	PackagePlus,
	PlusCircle,
	RotateCcw,
	Search,
	Sparkles,
	X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

const inventoryManifest = {
	id: 'inventory',
	name: 'Inventaire',
	description: 'Inventaire physique AppPOS',
	icon: ClipboardList,
	route: '/inventory-apppos',
}

type PageView = 'home' | 'overview' | 'counting' | 'history'

function formatInventoryDateTime(value: string | Date) {
	const date = new Date(value)
	const now = new Date()
	const isSameDay =
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate()
	const time = date.toLocaleTimeString('fr-FR', {
		hour: '2-digit',
		minute: '2-digit',
	})
	if (isSameDay) return `Aujourd'hui · ${time}`
	return `${date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} · ${time}`
}

function getInventoryStatusLabel(status: InventorySession['status']) {
	return status === 'in_progress' ? 'En cours' : 'Brouillon'
}

function getPrimaryCategoryLabel(categoryNames: string[]) {
	if (categoryNames.length === 0) return 'Inventaire'
	if (categoryNames.length === 1) return categoryNames[0]
	return `${categoryNames[0]} +${categoryNames.length - 1}`
}

function getLastCountedAt(entries: InventoryEntry[]) {
	const timestamps = entries
		.map((entry) => entry.counted_at)
		.filter(Boolean)
		.map((value) => new Date(value as string).getTime())
		.filter((value) => !Number.isNaN(value))
	if (timestamps.length === 0) return null
	return new Date(Math.max(...timestamps)).toISOString()
}

function formatInventoryActivityLabel(
	startedAt: string | Date,
	lastCountedAt?: string | null,
) {
	return lastCountedAt
		? `Dernier comptage · ${formatInventoryDateTime(lastCountedAt)}`
		: `Créée · ${formatInventoryDateTime(startedAt)}`
}

async function getInventoriedProductIds(
	pb: ReturnType<typeof usePocketBase>,
): Promise<string[]> {
	const records = await pb
		.collection(INVENTORY_ENTRIES_COLLECTION)
		.getFullList<Pick<InventoryEntry, 'product_id'>>(500, {
			filter: 'status = "counted"',
			fields: 'product_id',
			$autoCancel: false,
		})

	return [
		...new Set(records.map((record) => record.product_id).filter(Boolean)),
	]
}

async function getInventoriedProductsWithDates(
	pb: ReturnType<typeof usePocketBase>,
): Promise<Map<string, string>> {
	const records = await pb
		.collection(INVENTORY_ENTRIES_COLLECTION)
		.getFullList<Pick<InventoryEntry, 'product_id' | 'counted_at'>>(500, {
			filter: 'status = "counted"',
			fields: 'product_id,counted_at',
			sort: '-counted_at',
			$autoCancel: false,
		})
	const map = new Map<string, string>()
	for (const r of records) {
		if (r.product_id && r.counted_at && !map.has(r.product_id)) {
			map.set(r.product_id, r.counted_at)
		}
	}
	return map
}

function GlobalInventoryCapitalStats() {
	const pb = usePocketBase()

	const { data: catalogProducts = [], isLoading: catalogLoading } = useQuery({
		queryKey: ['apppos', 'products', 'catalog'],
		queryFn: async () => {
			const products = await appPosApi.getProducts()
			return appPosTransformers.products(products)
		},
		staleTime: 0,
		gcTime: 60 * 60 * 1000,
		refetchOnMount: 'always',
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	})

	const { data: inventoriedProductIds = [], isLoading: inventoriedLoading } =
		useQuery({
			queryKey: ['inventory', 'inventoried-product-ids'],
			queryFn: () => getInventoriedProductIds(pb),
			staleTime: 0,
			gcTime: 10 * 60 * 1000,
			refetchOnMount: 'always',
			refetchOnWindowFocus: true,
			refetchOnReconnect: true,
		})

	const inventoriedProductIdSet = useMemo(
		() => new Set(inventoriedProductIds),
		[inventoriedProductIds],
	)

	const totalProducts = catalogProducts.length

	const countedProducts = useMemo(() => {
		return catalogProducts.filter((product: any) =>
			inventoriedProductIdSet.has(product.id),
		).length
	}, [catalogProducts, inventoriedProductIdSet])

	console.log(
		'Produits comptés:',
		catalogProducts
			.filter((product: any) => inventoriedProductIdSet.has(product.id))
			.map((p: any) => ({ id: p.id, name: p.name, categories: p.categories })),
	)

	console.log(
		'Entrées avec date:',
		catalogProducts
			.filter((p: any) => inventoriedProductIdSet.has(p.id))
			.slice(0, 3)
			.map((p: any) => ({ id: p.id, name: p.name })),
	)

	// ← ici
	const firstCounted = catalogProducts.find((p: any) =>
		inventoriedProductIdSet.has(p.id),
	) as any
	if (firstCounted) {
		const sameCat = firstCounted.categories?.[0]
		console.log(
			`Produits restants dans la catégorie "${sameCat}":`,
			catalogProducts
				.filter(
					(p: any) =>
						(p.categories as string[])?.includes(sameCat) &&
						!inventoriedProductIdSet.has(p.id),
				)
				.map((p: any) => ({ id: p.id, name: p.name })),
		)
	}

	const neverInventoriedCount = useMemo(() => {
		return catalogProducts.filter(
			(product: any) => !inventoriedProductIdSet.has(product.id),
		).length
	}, [catalogProducts, inventoriedProductIdSet])

	const isLoading = catalogLoading || inventoriedLoading

	const progress =
		totalProducts > 0 ? Math.round((countedProducts / totalProducts) * 100) : 0

	return (
		<div className='rounded-2xl border border-orange-200/80 bg-orange-50/60 p-4 shadow-sm dark:border-orange-900/50 dark:bg-orange-950/10'>
			<div className='mb-3 flex items-start justify-between gap-3'>
				<div>
					<p className='text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300'>
						Stock global
					</p>
					<h3 className='mt-1 text-lg font-bold text-foreground'>
						Avancement inventaire
					</h3>
				</div>
				<div className='rounded-full bg-orange-500 px-3 py-1 text-sm font-bold text-white'>
					{isLoading ? '…' : `${progress}%`}
				</div>
			</div>

			<div className='grid grid-cols-3 gap-2'>
				<div className='rounded-xl bg-background/85 px-3 py-2'>
					<div className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
						Total
					</div>
					<div className='mt-1 text-2xl font-black text-foreground'>
						{catalogLoading ? '…' : totalProducts}
					</div>
				</div>

				<div className='rounded-xl bg-background/85 px-3 py-2'>
					<div className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
						Déjà inventoriés
					</div>
					<div className='mt-1 text-2xl font-black text-green-700 dark:text-green-300'>
						{isLoading ? '…' : countedProducts}
					</div>
				</div>

				<div className='rounded-xl bg-background/85 px-3 py-2'>
					<div className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
						Jamais inventoriés
					</div>
					<div className='mt-1 text-2xl font-black text-amber-700 dark:text-amber-300'>
						{isLoading ? '…' : neverInventoriedCount}
					</div>
				</div>
			</div>

			<div className='mt-3'>
				<div className='mb-1 flex items-center justify-between text-xs text-muted-foreground'>
					<span>
						{isLoading ? '…' : countedProducts} /{' '}
						{catalogLoading ? '…' : totalProducts} produits déjà inventoriés
					</span>
					<span className='font-semibold text-foreground'>
						{isLoading ? '…' : neverInventoriedCount} jamais inventoriés
					</span>
				</div>
				<Progress value={isLoading ? 0 : progress} className='h-2' />
			</div>
		</div>
	)
}

function ProductImageById({
	productId,
	productName,
}: { productId: string; productName: string }) {
	const { data: catalog } = useQuery({
		queryKey: ['apppos', 'products', 'catalog'],
		queryFn: async () => {
			const products = await appPosApi.getProducts()
			return appPosTransformers.products(products)
		},
		staleTime: 10 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	})
	const [errored, setErrored] = useState(false)
	const src = useMemo(() => {
		const match = catalog?.find((p: any) => p.id === productId)
		const rawPath = (match as any)?.images || ''
		return getAppPosImageUrl(rawPath)
	}, [catalog, productId])
	if (src && !errored) {
		return (
			<img
				src={src}
				alt={productName}
				className='w-12 h-12 rounded object-cover shrink-0 border bg-muted'
				onError={() => setErrored(true)}
			/>
		)
	}
	return (
		<div className='w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0'>
			<ClipboardList className='h-5 w-5 text-muted-foreground/50' />
		</div>
	)
}

function CategoryStatusIcon({
	status,
}: { status: CategoryInventorySummary['status'] }) {
	if (status === 'validated')
		return <Lock className='h-4 w-4 text-muted-foreground' />
	if (status === 'counted')
		return <CheckCircle2 className='h-4 w-4 text-green-500' />
	if (status === 'in_progress')
		return <div className='h-4 w-4 rounded-full bg-blue-500 animate-pulse' />
	return (
		<div className='h-4 w-4 rounded-full border-2 border-muted-foreground/30' />
	)
}

function CategoryStatusBadge({
	status,
}: { status: CategoryInventorySummary['status'] }) {
	const map = {
		validated: { label: 'Validé', class: 'bg-muted text-muted-foreground' },
		counted: {
			label: 'Compté',
			class:
				'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
		},
		in_progress: {
			label: 'En cours',
			class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
		},
		todo: { label: 'À faire', class: 'bg-muted/50 text-muted-foreground' },
	}
	const { label, class: cls } = map[status]
	return (
		<span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', cls)}>
			{label}
		</span>
	)
}

function EcartBadge({ ecart }: { ecart: number }) {
	if (ecart === 0)
		return <span className='text-muted-foreground text-sm'>= 0</span>
	if (ecart > 0)
		return (
			<span className='flex items-center gap-0.5 text-sm font-semibold text-green-600'>
				<PlusCircle className='h-3.5 w-3.5' />
				{ecart}
			</span>
		)
	return (
		<span className='flex items-center gap-0.5 text-sm font-semibold text-red-500'>
			<MinusCircle className='h-3.5 w-3.5' />
			{Math.abs(ecart)}
		</span>
	)
}

// ============================================================================
// DIALOG CRÉATION SESSION
// ============================================================================
function CreateSessionDialog({
	open,
	onClose,
	onConfirm,
	isLoading,
	activeSessions,
	defaultOperator = '',
}: {
	open: boolean
	onClose: () => void
	onConfirm: (
		operator: string,
		scope: 'selection' | 'free',
		categoryIds: string[],
		label?: string,
		targetedProductIds?: string[],
	) => void
	isLoading: boolean
	activeSessions: InventorySession[]
	defaultOperator?: string
}) {
	const [operator, setOperator] = useState(defaultOperator)
	const [scopeMode, setScopeMode] = useState<'selection' | 'free' | 'targeted'>(
		'selection',
	)
	const [freeLabel, setFreeLabel] = useState('')
	const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
	const [search, setSearch] = useState('')
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
	const [expandedProductGroups, setExpandedProductGroups] = useState<
		Set<string>
	>(new Set())
	const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])

	const { data: categoriesRaw = [] } = useAppPosCategoriesWithCounts()
	const { data: history } = useInventoryHistory()

	const pb = usePocketBase()

	const { data: catalogProducts = [] } = useQuery({
		queryKey: ['apppos', 'products', 'catalog'],
		queryFn: async () => {
			const products = await appPosApi.getProducts()
			return appPosTransformers.products(products)
		},
		staleTime: 0,
		refetchOnMount: 'always',
	})

	const { data: inventoriedProductIds = [] } = useQuery({
		queryKey: ['inventory', 'inventoried-product-ids'],
		queryFn: () => getInventoriedProductIds(pb),
		staleTime: 0,
		refetchOnMount: 'always',
	})

	const { data: inventoriedWithDates = new Map<string, string>() } = useQuery({
		queryKey: ['inventory', 'inventoried-with-dates'],
		queryFn: () => getInventoriedProductsWithDates(pb),
		staleTime: 0,
		refetchOnMount: 'always',
	})

	const categories = useMemo(() => {
		const flatten = (cats: any[], parentId: string | null = null): any[] =>
			cats.flatMap((cat) => [
				{ ...cat, id: cat._id, parent: parentId },
				...flatten(cat.children || [], cat._id),
			])
		return flatten(categoriesRaw)
	}, [categoriesRaw])

	const countMap = useMemo(() => {
		const map = new Map<
			string,
			{ productCount: number; totalProductCount: number }
		>()
		const walk = (cats: any[]) => {
			for (const cat of cats) {
				map.set(cat._id, {
					productCount: cat.productCount ?? 0,
					totalProductCount: cat.totalProductCount ?? cat.productCount ?? 0,
				})
				if (cat.children?.length) walk(cat.children)
			}
		}
		walk(categoriesRaw)
		return map
	}, [categoriesRaw])

	const categoryProductIds = useMemo(() => {
		const map = new Map<string, Set<string>>()
		for (const product of catalogProducts) {
			for (const catId of (product.categories as string[]) ?? []) {
				if (!map.has(catId)) map.set(catId, new Set())
				map.get(catId)!.add(product.id)
			}
		}
		return map
	}, [catalogProducts])

	const inventoriedSet = useMemo(
		() => new Set(inventoriedProductIds),
		[inventoriedProductIds],
	)

	const selectedProductTotal = useMemo(
		() =>
			selectedCategoryIds.reduce(
				(total, categoryId) =>
					total + (countMap.get(categoryId)?.productCount ?? 0),
				0,
			),
		[selectedCategoryIds, countMap],
	)

	useEffect(() => {
		if (open) {
			setOperator(defaultOperator)
			setScopeMode('selection')
			setFreeLabel('')
			setSelectedCategoryIds([])
			setSearch('')
			setExpandedGroups(new Set())
			setExpandedProductGroups(new Set())
			setSelectedProductIds([])
		}
	}, [open, defaultOperator])

	type CategoryTag =
		| { type: 'active'; sessionOperator: string }
		| {
				type: 'done'
				date: string
				operator: string
				countedProducts: number | null
				totalProducts: number | null
		  }

	const categoryTags = useMemo(() => {
		const tags = new Map<string, CategoryTag>()
		for (const session of activeSessions) {
			for (const catId of session.scope_category_ids ?? []) {
				tags.set(catId, { type: 'active', sessionOperator: session.operator })
			}
		}
		for (const session of history?.items ?? []) {
			if (session.status !== 'completed') continue
			const dateStr = session.completed_at
				? new Date(session.completed_at).toLocaleDateString('fr-FR', {
						day: '2-digit',
						month: '2-digit',
						year: 'numeric',
					})
				: ''
			for (const catId of session.scope_category_ids ?? []) {
				if (!tags.has(catId)) {
					tags.set(catId, {
						type: 'done',
						date: dateStr,
						operator: session.operator,
						countedProducts: null,
						totalProducts: null,
					})
				}
			}
		}
		return tags
	}, [activeSessions, history])

	const grouped = useMemo(() => {
		const byId = new Map(categories.map((c) => [c.id, c]))
		const roots = categories
			.filter((c) => !c.parent)
			.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
		const groups: Array<{
			parent: (typeof categories)[0] | null
			children: typeof categories
		}> = []
		for (const root of roots) {
			const children = categories
				.filter((c) => c.parent === root.id)
				.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
			if (children.length > 0) groups.push({ parent: root, children })
			else groups.push({ parent: null, children: [root] })
		}
		const orphans = categories
			.filter((c) => c.parent && !byId.has(c.parent))
			.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
		if (orphans.length > 0) groups.push({ parent: null, children: orphans })
		return groups
	}, [categories])

	const searchLower = search.trim().toLowerCase()

	const filteredGrouped = useMemo(() => {
		if (!searchLower) return grouped
		return grouped
			.map((group) => ({
				...group,
				children: group.children.filter((c) =>
					c.name.toLowerCase().includes(searchLower),
				),
			}))
			.filter((g) => g.children.length > 0)
	}, [grouped, searchLower])

	const searchExpandedIds = useMemo(() => {
		if (!searchLower) return new Set<string>()
		return new Set(
			filteredGrouped
				.filter((g) => g.parent)
				.flatMap((g) => (g.parent ? [g.parent.id] : [])),
		)
	}, [filteredGrouped, searchLower])

	const isGroupExpanded = (groupId: string) =>
		searchLower ? searchExpandedIds.has(groupId) : expandedGroups.has(groupId)
	const getCategoryProductCount = (categoryId: string) =>
		countMap.get(categoryId)?.productCount ?? 0
	const isEmptyCategory = (categoryId: string) =>
		getCategoryProductCount(categoryId) === 0
	const isSelectableCategory = (categoryId: string) =>
		!isEmptyCategory(categoryId)

	const toggleExpand = (groupId: string) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev)
			next.has(groupId) ? next.delete(groupId) : next.add(groupId)
			return next
		})
	}
	const toggleCategory = (id: string) => {
		if (!isSelectableCategory(id)) return
		setSelectedCategoryIds((prev) =>
			prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
		)
	}
	const toggleGroup = (ids: string[]) => {
		const selectableIds = ids.filter(isSelectableCategory)
		if (selectableIds.length === 0) return
		const allSelected = selectableIds.every((id) =>
			selectedCategoryIds.includes(id),
		)
		setSelectedCategoryIds((prev) =>
			allSelected
				? prev.filter((id) => !selectableIds.includes(id))
				: [...prev, ...selectableIds.filter((id) => !prev.includes(id))],
		)
	}

	const getGroupStats = (childIds: string[]) => {
		const selectedCount = childIds.filter((id) =>
			selectedCategoryIds.includes(id),
		).length
		const activeCount = childIds.filter(
			(id) => categoryTags.get(id)?.type === 'active',
		).length
		const doneCount = childIds.filter(
			(id) => categoryTags.get(id)?.type === 'done',
		).length
		const groupProductIds = new Set<string>()
		for (const catId of childIds) {
			categoryProductIds.get(catId)?.forEach((id) => groupProductIds.add(id))
		}
		const totalProducts = groupProductIds.size
		const countedProducts = [...groupProductIds].filter((id) =>
			inventoriedSet.has(id),
		).length
		const progressPercent =
			totalProducts > 0
				? Math.round((countedProducts / totalProducts) * 100)
				: 0
		return {
			selectedCount,
			activeCount,
			doneCount,
			totalProducts,
			countedProducts,
			progressPercent,
		}
	}

	const renderStatusTag = (categoryId: string) => {
		const tag = categoryTags.get(categoryId)
		const productCount = getCategoryProductCount(categoryId)
		if (tag?.type === 'active')
			return (
				<span className='rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'>
					En cours
				</span>
			)
		if (tag?.type === 'done' && productCount > 0)
			return (
				<span className='rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300'>
					Fait le {tag.date}
				</span>
			)
		return null
	}

	const renderGroupProgress = (
		childIds: string[],
		stats: ReturnType<typeof getGroupStats>,
	) => {
		const hasProgress = stats.countedProducts > 0 || stats.activeCount > 0
		if (!hasProgress && stats.selectedCount === 0) return null
		return (
			<div className='hidden min-w-[220px] shrink-0 md:block'>
				<div className='mb-1 flex items-center justify-between gap-2 text-[11px]'>
					<span className='text-muted-foreground'>
						{stats.countedProducts > 0
							? `${stats.progressPercent}% réalisé`
							: stats.activeCount > 0
								? `${stats.activeCount} en cours`
								: `${stats.selectedCount}/${childIds.length} sélection.`}
					</span>
					{stats.countedProducts > 0 && (
						<span className='font-medium text-green-700 dark:text-green-300'>
							{stats.countedProducts}/{stats.totalProducts}
						</span>
					)}
				</div>
				<div className='h-1.5 overflow-hidden rounded-full bg-muted'>
					<div
						className={cn(
							'h-full rounded-full transition-all',
							stats.countedProducts > 0 ? 'bg-green-500' : 'bg-blue-500',
						)}
						style={{
							width: `${stats.countedProducts > 0 ? stats.progressPercent : 8}%`,
						}}
					/>
				</div>
			</div>
		)
	}

	const canConfirm =
		operator.trim().length > 0 &&
		(scopeMode === 'free'
			? freeLabel.trim().length > 0
			: scopeMode === 'targeted'
				? selectedProductIds.length > 0
				: selectedCategoryIds.length > 0)

	const handleConfirm = () => {
		if (!canConfirm) return
		if (scopeMode === 'free') {
			onConfirm(operator.trim(), 'free', [], freeLabel.trim())
		} else if (scopeMode === 'targeted') {
			const categoryNames = [
				...new Set(
					selectedProductIds.flatMap((pid) => {
						const product = catalogProducts.find(
							(p: any) => p.id === pid,
						) as any
						const catId = (product?.categories as string[])?.[0]
						const cat = categories.find((c) => c.id === catId)
						return cat?.name ? [cat.name] : []
					}),
				),
			]
				.slice(0, 3)
				.join(', ')
			onConfirm(
				operator.trim(),
				'free',
				[],
				`Ciblée · ${categoryNames}`,
				selectedProductIds,
			)
		} else {
			onConfirm(operator.trim(), 'selection', selectedCategoryIds)
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className='flex h-[min(92vh,820px)] w-[min(96vw,980px)] max-w-5xl flex-col overflow-hidden p-0'>
				<DialogHeader className='shrink-0 border-b px-8 py-5'>
					<DialogTitle className='flex items-center gap-2 text-xl'>
						<ClipboardList className='h-5 w-5 text-orange-500' />
						Nouvel inventaire
					</DialogTitle>
				</DialogHeader>

				<div className='min-h-0 flex-1 overflow-y-auto px-8 py-5'>
					<div className='mb-5 max-w-md space-y-1.5'>
						<Label>Opérateur</Label>
						<Input
							placeholder='Votre nom...'
							value={operator}
							onChange={(e) => setOperator(e.target.value)}
							autoFocus
						/>
					</div>

					{/* ── Type de session ───────────────────────────────────────── */}
					<div className='mb-5 max-w-md space-y-1.5'>
						<Label>Type de session</Label>
						<div className='grid grid-cols-3 gap-2'>
							<button
								type='button'
								onClick={() => setScopeMode('selection')}
								className={cn(
									'rounded-xl border px-4 py-3 text-left transition-colors',
									scopeMode === 'selection'
										? 'border-orange-400 bg-orange-50/60 dark:bg-orange-950/20'
										: 'border-border hover:bg-muted/50',
								)}
							>
								<p className='text-sm font-semibold'>Par catégorie</p>
								<p className='mt-0.5 text-xs text-muted-foreground'>
									Choisir les rayons du catalogue
								</p>
							</button>
							<button
								type='button'
								onClick={() => setScopeMode('free')}
								className={cn(
									'rounded-xl border px-4 py-3 text-left transition-colors',
									scopeMode === 'free'
										? 'border-orange-400 bg-orange-50/60 dark:bg-orange-950/20'
										: 'border-border hover:bg-muted/50',
								)}
							>
								<p className='text-sm font-semibold'>Session libre</p>
								<p className='mt-0.5 text-xs text-muted-foreground'>
									Nommer un espace physique
								</p>
							</button>
							<button
								type='button'
								onClick={() => setScopeMode('targeted')}
								className={cn(
									'rounded-xl border px-4 py-3 text-left transition-colors',
									scopeMode === 'targeted'
										? 'border-orange-400 bg-orange-50/60 dark:bg-orange-950/20'
										: 'border-border hover:bg-muted/50',
								)}
							>
								<p className='text-sm font-semibold'>Session ciblée</p>
								<p className='mt-0.5 text-xs text-muted-foreground'>
									Produits jamais inventoriés
								</p>
							</button>
						</div>
					</div>

					{/* ── Label session libre ───────────────────────────────────── */}
					{scopeMode === 'free' && (
						<div className='mb-5 max-w-md space-y-1.5'>
							<Label>Nom de la session</Label>
							<Input
								placeholder='Ex : Vitrine boutique, Rayon partitions…'
								value={freeLabel}
								onChange={(e) => setFreeLabel(e.target.value)}
							/>
							<p className='text-xs text-muted-foreground'>
								Les produits seront ajoutés manuellement via scan ou recherche.
							</p>
						</div>
					)}

					{scopeMode === 'targeted' && (
						<div className='mb-5 space-y-3'>
							<div className='flex items-center justify-between'>
								<Label>Produits jamais inventoriés</Label>
								{selectedProductIds.length > 0 && (
									<span className='rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'>
										{selectedProductIds.length} produit
										{selectedProductIds.length > 1 ? 's' : ''} sélectionné
										{selectedProductIds.length > 1 ? 's' : ''}
									</span>
								)}
							</div>

							<div className='h-[400px] overflow-y-auto rounded-xl border divide-y'>
								{filteredGrouped.map((group, gi) => {
									const groupKey = group.parent?.id ?? `orphan-${gi}`
									return (
										<div key={groupKey}>
											{group.parent && (
												<div className='bg-white bg-muted/50 px-3 py-2 text-xs font-bold uppercase tracking-wide  sticky top-0 opacity-100'>
													{group.parent.name}
												</div>
											)}
											{group.children.map((cat) => {
												const catProducts = (catalogProducts as any[]).filter(
													(p) => (p.categories as string[])?.includes(cat.id),
												)
												const neverInventoried = catProducts.filter(
													(p) => !inventoriedSet.has(p.id),
												)
												const alreadyInventoried = catProducts.filter((p) =>
													inventoriedSet.has(p.id),
												)
												if (catProducts.length === 0) return null

												const catExpanded = expandedProductGroups.has(cat.id)
												const allCatSelected =
													neverInventoried.length > 0 &&
													neverInventoried.every((p) =>
														selectedProductIds.includes(p.id),
													)

												return (
													<div key={cat.id}>
														<div className='flex items-center gap-2 border-b px-4 py-2.5 hover:bg-muted/30 transition-colors'>
															<button
																type='button'
																className='flex min-w-0 flex-1 items-center gap-2 text-left'
																onClick={() =>
																	setExpandedProductGroups((prev) => {
																		const next = new Set(prev)
																		next.has(cat.id)
																			? next.delete(cat.id)
																			: next.add(cat.id)
																		return next
																	})
																}
															>
																<ChevronDown
																	className={cn(
																		'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150',
																		!catExpanded && '-rotate-90',
																	)}
																/>
																<span className='truncate text-sm font-semibold'>
																	{cat.name}
																</span>
																<span className='shrink-0 text-xs text-muted-foreground'>
																	<span className='text-amber-600 font-medium'>
																		{neverInventoried.length} à faire
																	</span>
																	{alreadyInventoried.length > 0 && (
																		<span className='text-green-600 ml-1'>
																			· {alreadyInventoried.length} fait
																		</span>
																	)}
																</span>
															</button>
															{neverInventoried.length > 0 && (
																<button
																	type='button'
																	onClick={() => {
																		const ids = neverInventoried.map(
																			(p: any) => p.id,
																		)
																		setSelectedProductIds((prev) =>
																			allCatSelected
																				? prev.filter((id) => !ids.includes(id))
																				: [
																						...prev,
																						...ids.filter(
																							(id) => !prev.includes(id),
																						),
																					],
																		)
																	}}
																	className={cn(
																		'shrink-0 text-xs font-semibold px-2 py-1 rounded-lg transition-colors',
																		allCatSelected
																			? 'text-orange-600 bg-orange-50 dark:bg-orange-900/20'
																			: 'text-muted-foreground hover:text-foreground',
																	)}
																>
																	{allCatSelected ? 'Retirer' : 'Tout'}
																</button>
															)}
														</div>

														{catExpanded && (
															<div className='divide-y bg-background'>
																{neverInventoried.map((product: any) => (
																	<label
																		key={product.id}
																		className={cn(
																			'flex cursor-pointer items-center gap-3 px-6 py-2.5 transition-colors hover:bg-muted/30',
																			selectedProductIds.includes(product.id) &&
																				'bg-orange-50/50 dark:bg-orange-900/5',
																		)}
																	>
																		<input
																			type='checkbox'
																			checked={selectedProductIds.includes(
																				product.id,
																			)}
																			onChange={() =>
																				setSelectedProductIds((prev) =>
																					prev.includes(product.id)
																						? prev.filter(
																								(id) => id !== product.id,
																							)
																						: [...prev, product.id],
																				)
																			}
																			className='shrink-0 rounded accent-orange-500'
																		/>
																		<span className='min-w-0 flex-1 truncate text-sm'>
																			{product.name}
																		</span>
																		<span className='shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'>
																			Jamais inventorié
																		</span>
																	</label>
																))}

																{alreadyInventoried.map((product: any) => {
																	const countedAt = inventoriedWithDates.get(
																		product.id,
																	)
																	return (
																		<div
																			key={product.id}
																			className='flex items-center gap-3 px-6 py-2.5 opacity-40'
																		>
																			<input
																				type='checkbox'
																				checked
																				disabled
																				className='shrink-0 rounded accent-green-500'
																			/>
																			<span className='min-w-0 flex-1 truncate text-sm'>
																				{product.name}
																			</span>
																			<span className='shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300'>
																				{countedAt
																					? `Inventorié · ${formatInventoryDateTime(countedAt)}`
																					: 'Inventorié'}
																			</span>
																		</div>
																	)
																})}
															</div>
														)}
													</div>
												)
											})}
										</div>
									)
								})}
							</div>
						</div>
					)}

					<Separator className='mb-5' />

					{/* ── Liste catégories (sélection uniquement) ──────────────── */}
					{scopeMode === 'selection' && (
						<div className='flex min-h-0 flex-col space-y-3'>
							<div className='flex items-center justify-between gap-3'>
								<Label>Catégories à inventorier</Label>
								{selectedCategoryIds.length > 0 && (
									<span className='rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'>
										{selectedCategoryIds.length} rayon
										{selectedCategoryIds.length > 1 ? 's' : ''} ·{' '}
										{selectedProductTotal} produit
										{selectedProductTotal > 1 ? 's' : ''}
									</span>
								)}
							</div>

							<div className='relative'>
								<Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
								<Input
									placeholder='Rechercher une catégorie...'
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									className='h-10 pl-9 text-sm'
								/>
							</div>

							<div className='h-[460px] overflow-y-auto rounded-xl border'>
								{categories.length === 0 && (
									<div className='px-3 py-8 text-center text-sm text-muted-foreground'>
										<Loader2 className='mx-auto mb-2 h-4 w-4 animate-spin' />
										Chargement des catégories...
									</div>
								)}
								{filteredGrouped.length === 0 && categories.length > 0 && (
									<div className='px-3 py-8 text-center text-sm text-muted-foreground'>
										Aucune catégorie trouvée
									</div>
								)}
								{filteredGrouped.map((group, gi) => {
									const childIds = group.children.map((c) => c.id)
									const selectableChildIds =
										childIds.filter(isSelectableCategory)
									const allSelected =
										selectableChildIds.length > 0 &&
										selectableChildIds.every((id) =>
											selectedCategoryIds.includes(id),
										)
									const groupKey = group.parent?.id ?? `orphan-${gi}`
									const expanded = group.parent
										? isGroupExpanded(group.parent.id)
										: true
									const groupStats = getGroupStats(childIds)
									return (
										<div key={groupKey}>
											{group.parent ? (
												<div className='flex items-center gap-3 border-b bg-muted/50 px-3 py-2.5 transition-colors hover:bg-muted'>
													<button
														type='button'
														onClick={() =>
															group.parent && toggleExpand(group.parent.id)
														}
														className='flex min-w-0 flex-1 items-center gap-2 text-left'
													>
														<ChevronDown
															className={cn(
																'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150',
																!expanded && '-rotate-90',
															)}
														/>
														<div className='min-w-0 flex-1'>
															<div className='flex min-w-0 items-center gap-2'>
																<span className='truncate text-sm font-bold uppercase tracking-wide text-foreground/80'>
																	{group.parent.name}
																</span>
																<span className='shrink-0 text-xs text-muted-foreground'>
																	{groupStats.totalProducts} réf.
																</span>
															</div>
														</div>
													</button>
													{renderGroupProgress(childIds, groupStats)}
													<Button
														type='button'
														variant='ghost'
														size='sm'
														onClick={() => toggleGroup(childIds)}
														disabled={selectableChildIds.length === 0}
														className={cn(
															'h-8 shrink-0 px-3 text-xs font-semibold',
															allSelected
																? 'text-orange-600'
																: 'text-muted-foreground',
														)}
													>
														{allSelected ? 'Retirer' : 'Tout'}
													</Button>
												</div>
											) : (
												(() => {
													const root = group.children[0]
													const productCount = getCategoryProductCount(root.id)
													const isChecked = selectedCategoryIds.includes(
														root.id,
													)
													const isDisabled = productCount === 0
													return (
														<label
															className={cn(
																'flex cursor-pointer items-center gap-3 border-b bg-muted/50 px-3 py-2.5 transition-colors hover:bg-muted',
																isDisabled &&
																	'cursor-not-allowed opacity-45 hover:bg-muted/50',
															)}
														>
															<input
																type='checkbox'
																checked={isChecked}
																disabled={isDisabled}
																onChange={() => toggleCategory(root.id)}
																className='shrink-0 rounded accent-orange-500 disabled:cursor-not-allowed'
															/>
															<div className='min-w-0 flex-1'>
																<div className='flex min-w-0 items-center gap-2'>
																	<span className='truncate text-sm font-bold uppercase tracking-wide text-foreground/80'>
																		{root.name}
																	</span>
																	<span className='shrink-0 text-xs text-muted-foreground'>
																		{productCount} réf.
																	</span>
																</div>
															</div>
															{renderStatusTag(root.id)}
														</label>
													)
												})()
											)}
											{group.parent &&
												expanded &&
												group.children.map((cat, ci, visibleChildren) => {
													const productCount = getCategoryProductCount(cat.id)
													const isChecked = selectedCategoryIds.includes(cat.id)
													const isDisabled = productCount === 0
													return (
														<label
															key={cat.id}
															className={cn(
																'flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50',
																ci < visibleChildren.length - 1 && 'border-b',
																isChecked &&
																	'bg-orange-50/50 dark:bg-orange-900/5',
																isDisabled &&
																	'cursor-not-allowed opacity-45 hover:bg-transparent',
															)}
														>
															<input
																type='checkbox'
																checked={isChecked}
																disabled={isDisabled}
																onChange={() => toggleCategory(cat.id)}
																className='shrink-0 rounded accent-orange-500 disabled:cursor-not-allowed'
															/>
															<span className='min-w-0 flex-1 truncate text-sm'>
																{cat.name}
															</span>
															<span className='shrink-0 text-xs text-muted-foreground'>
																{productCount} réf.
															</span>
															<div className='shrink-0'>
																{renderStatusTag(cat.id)}
															</div>
														</label>
													)
												})}
										</div>
									)
								})}
							</div>
						</div>
					)}
				</div>

				<DialogFooter className='shrink-0 border-t px-8 py-5'>
					<Button variant='ghost' onClick={onClose} disabled={isLoading}>
						Annuler
					</Button>
					<Button
						onClick={handleConfirm}
						disabled={!canConfirm || isLoading}
						className='gap-2 bg-orange-500 text-white hover:bg-orange-600'
					>
						{isLoading && <Loader2 className='h-4 w-4 animate-spin' />}
						{scopeMode === 'targeted'
							? 'Démarrer la session ciblée'
							: 'Démarrer le comptage'}
						{scopeMode === 'selection' && selectedProductTotal > 0 && (
							<span className='ml-1 opacity-80'>({selectedProductTotal})</span>
						)}
						{scopeMode === 'targeted' && selectedProductIds.length > 0 && (
							<span className='ml-1 opacity-80'>
								({selectedProductIds.length})
							</span>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ============================================================================
// VUE SESSION LIBRE
// ============================================================================
function FreeSessionView({
	session,
	onComplete,
	onCancel,
	onBack,
	isCompleting,
	isCancelling,
}: {
	session: InventorySession
	onComplete: () => void
	onCancel: () => void
	onBack: () => void
	isCompleting: boolean
	isCancelling: boolean
}) {
	const pb = usePocketBase()
	const queryClient = useQueryClient()
	const { entries, countProduct, resetProduct, isCountingProduct } =
		useInventorySession(session.id)

	const [search, setSearch] = useState('')
	const [isAdding, setIsAdding] = useState(false)
	const searchRef = useRef<HTMLInputElement>(null)

	const fetchFreshCatalog = async () => {
		const products = await appPosApi.getProducts()
		return appPosTransformers.products(products)
	}

	const { data: catalog = [] } = useQuery({
		queryKey: ['apppos', 'products', 'catalog'],
		queryFn: fetchFreshCatalog,
		staleTime: 0,
		gcTime: 60 * 60 * 1000,
		refetchOnMount: 'always',
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	})

	const getProductCurrentStock = (product: any): number => {
		const rawStock =
			product.stock ??
			product.quantity ??
			product.qty ??
			product.current_stock ??
			product.inventory_stock ??
			product.stock_quantity ??
			product.available_stock ??
			0

		const stock = Number(rawStock)

		return Number.isFinite(stock) ? stock : 0
	}

	const refreshAppPosCatalog = async () => {
		await queryClient.invalidateQueries({
			queryKey: ['apppos', 'products', 'catalog'],
		})

		await queryClient.refetchQueries({
			queryKey: ['apppos', 'products', 'catalog'],
			type: 'active',
		})
	}

	const getFreshCatalogProduct = async (productId: string) => {
		const freshCatalog = await fetchFreshCatalog()

		queryClient.setQueryData(['apppos', 'products', 'catalog'], freshCatalog)

		return (freshCatalog as any[]).find((p) => p.id === productId) ?? null
	}

	const searchLower = search.trim().toLowerCase()

	const addedProductIds = useMemo(
		() => new Set(entries.map((e) => e.product_id)),
		[entries],
	)

	const searchResults = useMemo(() => {
		if (!searchLower || searchLower.length < 2) return []

		return (catalog as any[])
			.filter((p: any) => {
				if (addedProductIds.has(p.id)) return false

				return (
					p.name?.toLowerCase().includes(searchLower) ||
					p.sku?.toLowerCase().includes(searchLower) ||
					p.barcode?.toLowerCase().includes(searchLower)
				)
			})
			.slice(0, 8)
	}, [catalog, searchLower, addedProductIds])

	const searchResultProductIds = useMemo(
		() => [...new Set(searchResults.map((p: any) => p.id))],
		[searchResults],
	)

	const {
		data: lastSearchInventoryByProduct = new Map<string, InventoryEntry>(),
	} = useQuery({
		queryKey: [
			'inventory',
			'last-search-by-product',
			session.id,
			searchResultProductIds,
		],
		enabled: searchResultProductIds.length > 0,
		queryFn: async () => {
			const productFilter = searchResultProductIds
				.map((id) => `product_id = "${id}"`)
				.join(' || ')

			const records = await pb
				.collection(INVENTORY_ENTRIES_COLLECTION)
				.getFullList<InventoryEntry>(500, {
					filter: `(${productFilter}) && status = "counted" && session_id != "${session.id}"`,
					sort: '-counted_at',
					$autoCancel: false,
				})

			const map = new Map<string, InventoryEntry>()

			for (const record of records) {
				if (!map.has(record.product_id)) {
					map.set(record.product_id, record)
				}
			}

			return map
		},
	})

	const handleAddProduct = async (product: any) => {
		if (isAdding) return

		setIsAdding(true)

		try {
			const freshProduct = await getFreshCatalogProduct(product.id)
			const productForSnapshot = freshProduct ?? product

			const categoryId =
				productForSnapshot.category_id ??
				productForSnapshot.categories?.[0] ??
				''

			await createInventoryEntries(pb, session.id, [
				{
					product_id: productForSnapshot.id,
					product_name: productForSnapshot.name ?? '',
					product_sku: productForSnapshot.sku ?? '',
					product_barcode: productForSnapshot.barcode ?? '',
					product_image: productForSnapshot.images ?? '',
					category_id: categoryId,
					category_name: session.label ?? 'Session libre',
					stock_theorique: getProductCurrentStock(productForSnapshot),
				},
			])

			queryClient.invalidateQueries({ queryKey: ['inventory'] })
			setSearch('')
			searchRef.current?.focus()
		} catch (err) {
			console.error('Erreur ajout produit:', err)
		} finally {
			setIsAdding(false)
		}
	}

	const handleSaveFreeProduct = async (
		entry: InventoryEntry,
		value: number,
	) => {
		await countProduct(entry, value)
		await refreshAppPosCatalog()
	}

	const countedEntries = entries.filter((e) => e.status === 'counted')
	const canComplete =
		entries.length > 0 && countedEntries.length === entries.length

	const entryProductIds = useMemo(
		() => [...new Set(entries.map((e) => e.product_id))],
		[entries],
	)

	const { data: lastInventoryByProduct = new Map<string, InventoryEntry>() } =
		useQuery({
			queryKey: ['inventory', 'last-by-product', session.id, entryProductIds],
			enabled: entryProductIds.length > 0,
			queryFn: async () => {
				const productFilter = entryProductIds
					.map((id) => `product_id = "${id}"`)
					.join(' || ')

				const records = await pb
					.collection(INVENTORY_ENTRIES_COLLECTION)
					.getFullList<InventoryEntry>(500, {
						filter: `(${productFilter}) && status = "counted" && session_id != "${session.id}"`,
						sort: '-counted_at',
						$autoCancel: false,
					})

				const map = new Map<string, InventoryEntry>()

				for (const record of records) {
					if (!map.has(record.product_id)) {
						map.set(record.product_id, record)
					}
				}

				return map
			},
		})

	return (
		<div className='flex flex-col h-full'>
			<div className='border-b bg-background/95 px-6 py-4'>
				<div className='mb-3 flex items-center justify-between gap-3'>
					<Button
						variant='ghost'
						size='sm'
						onClick={onBack}
						className='gap-1.5 shrink-0'
					>
						<ArrowLeft className='h-4 w-4' />
						Sessions
					</Button>

					<div className='flex items-center gap-2'>
						<Button
							variant='ghost'
							size='sm'
							onClick={onCancel}
							disabled={isCancelling || isCompleting}
							className='text-muted-foreground hover:text-destructive gap-1.5'
						>
							{isCancelling ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
							) : (
								<X className='h-3.5 w-3.5' />
							)}
							Annuler
						</Button>

						<Button
							size='sm'
							onClick={onComplete}
							disabled={!canComplete || isCompleting || isCancelling}
							className='bg-green-600 hover:bg-green-700 text-white gap-1.5'
						>
							{isCompleting ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
							) : (
								<CheckCircle2 className='h-3.5 w-3.5' />
							)}
							Clôturer
						</Button>
					</div>
				</div>

				<div className='flex items-start justify-between gap-4 mb-3'>
					<div>
						<h2 className='text-xl font-bold'>
							{session.label ?? 'Session libre'}
						</h2>
						<p className='text-xs text-muted-foreground mt-0.5'>
							Opérateur : {session.operator} · {entries.length} produit
							{entries.length > 1 ? 's' : ''} · {countedEntries.length} compté
							{countedEntries.length > 1 ? 's' : ''}
						</p>
					</div>

					{entries.length > 0 && (
						<div className='text-right shrink-0'>
							<div className='text-2xl font-black text-orange-500'>
								{Math.round((countedEntries.length / entries.length) * 100)}%
							</div>
							<div className='text-xs text-muted-foreground'>progression</div>
						</div>
					)}
				</div>

				<div className='relative'>
					<Search className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
					<Input
						ref={searchRef}
						placeholder='Rechercher un produit par nom, SKU ou code-barres…'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className='pl-9 pr-8'
						autoFocus
					/>

					{search && (
						<button
							type='button'
							onClick={() => setSearch('')}
							className='absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
						>
							<X className='h-3.5 w-3.5' />
						</button>
					)}
				</div>

				{searchResults.length > 0 && (
					<div className='mt-1 rounded-xl border bg-card shadow-lg z-10'>
						{searchResults.map((product: any) => {
							const lastInventoryAt =
								lastSearchInventoryByProduct.get(product.id)?.counted_at ?? null

							return (
								<button
									key={product.id}
									type='button'
									onClick={() => handleAddProduct(product)}
									disabled={isAdding}
									className='w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-0 text-left'
								>
									<PackagePlus className='h-4 w-4 shrink-0 text-orange-500' />

									<div className='min-w-0 flex-1'>
										<p className='text-sm font-medium truncate'>
											{product.name}
										</p>

										<p className='text-xs text-muted-foreground'>
											{product.sku}
											{product.barcode ? ` · ${product.barcode}` : ''} · Stock :{' '}
											<span className='font-medium'>
												{getProductCurrentStock(product)}
											</span>
										</p>

										{lastInventoryAt && (
											<p className='text-xs text-orange-500 mt-0.5'>
												Dernier inventaire :{' '}
												{formatInventoryDateTime(lastInventoryAt)}
											</p>
										)}
									</div>

									<span className='text-xs text-orange-500 font-medium shrink-0'>
										Ajouter
									</span>
								</button>
							)
						})}
					</div>
				)}

				{searchLower.length >= 2 && searchResults.length === 0 && (
					<p className='mt-2 text-xs text-muted-foreground'>
						Aucun résultat pour « {search} »
					</p>
				)}
			</div>

			<div className='flex-1 overflow-y-auto'>
				{entries.length === 0 ? (
					<div className='flex flex-col items-center justify-center h-full gap-3 text-muted-foreground'>
						<PackagePlus className='h-10 w-10 opacity-30' />
						<p className='text-sm'>
							Recherchez un produit ci-dessus pour l'ajouter
						</p>
					</div>
				) : (
					<table className='w-full text-sm'>
						<thead className='sticky top-0 bg-background border-b'>
							<tr className='text-xs text-muted-foreground'>
								<th className='text-left px-6 py-3 font-medium'>Produit</th>
								<th className='text-center px-3 py-3 font-medium w-24'>
									Théorique
								</th>
								<th className='text-center px-3 py-3 font-medium w-32'>
									Compté
								</th>
								<th className='text-center px-3 py-3 font-medium w-20'>
									Écart
								</th>
								<th className='w-10 px-3 py-3' />
							</tr>
						</thead>

						<tbody className='divide-y'>
							{entries.map((entry) => (
								<CountingRow
									key={entry.id}
									entry={entry}
									lastInventoryAt={
										lastInventoryByProduct.get(entry.product_id)?.counted_at ??
										null
									}
									isValidated={false}
									isCountingProduct={isCountingProduct}
									onSave={handleSaveFreeProduct}
									onReset={(entryId) => resetProduct(entryId)}
								/>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	)
}

// ============================================================================
// SOUS-VUES
// ============================================================================
function SessionOverviewView({
	session,
	summary,
	lastCountedAt,
	onSelectCategory,
	onComplete,
	onCancel,
	onBack,
	isCompleting,
	isCancelling,
}: {
	session: InventorySession
	summary: NonNullable<ReturnType<typeof useInventorySession>['summary']>
	lastCountedAt?: string | null
	onSelectCategory: (categoryId: string) => void
	onComplete: () => void
	onCancel: () => void
	isCompleting: boolean
	isCancelling: boolean
	onBack: () => void
}) {
	const isValidated = (catId: string) =>
		session.validated_category_ids?.includes(catId) ?? false
	const categoriesWithValidation = summary.categories.map((c) => ({
		...c,
		status: isValidated(c.categoryId) ? ('validated' as const) : c.status,
	}))
	const todo = categoriesWithValidation.filter((c) => c.status === 'todo')
	const inProgress = categoriesWithValidation.filter(
		(c) => c.status === 'in_progress',
	)
	const done = categoriesWithValidation.filter(
		(c) => c.status === 'counted' || c.status === 'validated',
	)

	return (
		<div className='flex flex-col h-full'>
			<div className='border-b bg-background/95 px-6 py-4'>
				<div className='mb-4 flex items-center justify-between gap-3'>
					<Button
						variant='ghost'
						size='sm'
						onClick={onBack}
						className='gap-1.5 shrink-0'
					>
						<ArrowLeft className='h-4 w-4' />
						Sessions
					</Button>
					<div className='flex items-center gap-2'>
						<Button
							variant='ghost'
							size='sm'
							onClick={onCancel}
							disabled={isCancelling || isCompleting}
							className='text-muted-foreground hover:text-destructive gap-1.5'
						>
							{isCancelling ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
							) : (
								<X className='h-3.5 w-3.5' />
							)}
							Annuler
						</Button>
						<Button
							size='sm'
							onClick={onComplete}
							disabled={!summary.canComplete || isCompleting || isCancelling}
							className='bg-green-600 hover:bg-green-700 text-white gap-1.5'
						>
							{isCompleting ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
							) : (
								<CheckCircle2 className='h-3.5 w-3.5' />
							)}
							Clôturer
						</Button>
					</div>
				</div>

				<div className='rounded-2xl border bg-card p-4 shadow-sm'>
					<div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
						<div className='min-w-0'>
							<div className='mb-2 flex flex-wrap items-center gap-2'>
								<h2 className='truncate text-2xl font-bold text-foreground'>
									{getPrimaryCategoryLabel(
										summary.categories.map((c) => c.categoryName),
									)}
								</h2>
								<Badge
									variant='outline'
									className='border-orange-300 text-orange-600'
								>
									En cours
								</Badge>
							</div>
							<div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground'>
								<span className='inline-flex items-center gap-1.5'>
									<Clock className='h-4 w-4' />
									{formatInventoryActivityLabel(
										session.started_at,
										lastCountedAt,
									)}
								</span>
								<span>Opérateur : {session.operator}</span>
							</div>
						</div>
						<div className='w-full lg:w-72'>
							<div className='mb-1.5 flex items-center justify-between text-xs'>
								<span className='font-medium text-muted-foreground'>
									Progression globale
								</span>
								<span className='font-bold text-foreground'>
									{summary.progressPercent}%
								</span>
							</div>
							<Progress value={summary.progressPercent} className='h-2' />
							<div className='mt-1 text-xs text-muted-foreground'>
								{summary.countedProducts} / {summary.totalProducts} produits
								comptés
							</div>
						</div>
					</div>

					{inProgress.length > 0 && (
						<div className='mt-4 rounded-2xl border border-blue-200 bg-blue-50/60 px-3 py-3 dark:border-blue-800 dark:bg-blue-900/10'>
							<div className='mb-3'>
								<p className='text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300'>
									Continuer la session
								</p>
								<p className='text-sm text-blue-700/80 dark:text-blue-300/80'>
									Reprenez d'abord les rayons déjà commencés.
								</p>
							</div>
							<div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
								{inProgress.map((cat) => (
									<button
										key={cat.categoryId}
										type='button'
										onClick={() => onSelectCategory(cat.categoryId)}
										className='rounded-xl border border-blue-100 bg-background/90 px-3 py-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-background dark:border-blue-900/40'
									>
										<div className='mb-2 flex items-center justify-between gap-3'>
											<div className='min-w-0'>
												<div className='truncate text-sm font-bold text-foreground'>
													{cat.categoryName}
												</div>
												<div className='text-xs text-muted-foreground'>
													{cat.countedProducts}/{cat.totalProducts} produits
												</div>
											</div>
											<div className='rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'>
												Continuer
											</div>
										</div>
										<Progress
											value={
												cat.totalProducts > 0
													? (cat.countedProducts / cat.totalProducts) * 100
													: 0
											}
											className='h-2'
										/>
									</button>
								))}
							</div>
						</div>
					)}

					<div className='mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
						<div className='rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/10'>
							<div className='flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300'>
								<Clock className='h-3.5 w-3.5' />
								Restant
							</div>
							<div className='mt-1 text-3xl font-black text-amber-700 dark:text-amber-300'>
								{summary.pendingProducts}
							</div>
							<div className='text-xs text-amber-700/70 dark:text-amber-300/70'>
								{todo.length + inProgress.length} rayon
								{todo.length + inProgress.length > 1 ? 's' : ''} à finir
							</div>
						</div>
						<div className='rounded-xl border border-green-200/80 bg-green-50/50 px-4 py-3 dark:border-green-800 dark:bg-green-900/10'>
							<div className='flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-300'>
								<CheckCircle2 className='h-3.5 w-3.5' />
								Compté
							</div>
							<div className='mt-1 text-3xl font-black text-green-700 dark:text-green-300'>
								{summary.countedProducts}
							</div>
							<div className='text-xs text-green-700/70 dark:text-green-300/70'>
								{done.length} rayon{done.length > 1 ? 's' : ''} terminé
								{done.length > 1 ? 's' : ''}
							</div>
						</div>
						<div
							className={cn(
								'rounded-xl border px-4 py-3',
								summary.totalGaps.length > 0
									? 'border-red-200/80 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10'
									: 'border-border bg-muted/20',
							)}
						>
							<div
								className={cn(
									'flex items-center gap-1.5 text-xs font-semibold',
									summary.totalGaps.length > 0
										? 'text-red-700 dark:text-red-300'
										: 'text-muted-foreground',
								)}
							>
								<AlertTriangle className='h-3.5 w-3.5' />
								Écarts
							</div>
							<div
								className={cn(
									'mt-1 text-3xl font-black',
									summary.totalGaps.length > 0
										? 'text-red-700 dark:text-red-300'
										: 'text-muted-foreground',
								)}
							>
								{summary.totalGaps.length}
							</div>
							<div className='text-xs text-muted-foreground'>
								{summary.totalGaps.length === 0 ? 'aucun écart' : 'à vérifier'}
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className='flex-1 overflow-y-auto divide-y'>
				{todo.length > 0 && (
					<div className='px-6 pt-3 pb-1'>
						<p className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
							À compter — {todo.reduce((acc, c) => acc + c.pendingProducts, 0)}{' '}
							produits
						</p>
					</div>
				)}
				{todo.map((cat) => (
					<CategoryRow
						key={cat.categoryId}
						cat={cat}
						onSelectCategory={onSelectCategory}
					/>
				))}
				{inProgress.length > 0 && (
					<div className='px-6 pt-3 pb-1'>
						<p className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
							En cours
						</p>
					</div>
				)}
				{inProgress.map((cat) => (
					<CategoryRow
						key={cat.categoryId}
						cat={cat}
						onSelectCategory={onSelectCategory}
					/>
				))}
				{done.length > 0 && (
					<div className='px-6 pt-3 pb-1'>
						<p className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
							Terminées
						</p>
					</div>
				)}
				{done.map((cat) => (
					<CategoryRow
						key={cat.categoryId}
						cat={cat}
						onSelectCategory={onSelectCategory}
						validated={cat.status === 'validated'}
					/>
				))}
			</div>
		</div>
	)
}

function CategoryRow({
	cat,
	onSelectCategory,
	validated = false,
}: {
	cat: CategoryInventorySummary & {
		status: CategoryInventoryStatus | 'validated'
	}
	onSelectCategory: (id: string) => void
	validated?: boolean
}) {
	const progress =
		cat.totalProducts > 0 ? (cat.countedProducts / cat.totalProducts) * 100 : 0
	return (
		<button
			type='button'
			disabled={validated}
			onClick={() => !validated && onSelectCategory(cat.categoryId)}
			className={cn(
				'w-full px-6 py-3 text-left transition-colors',
				validated
					? 'opacity-60 cursor-default'
					: 'hover:bg-muted/50 cursor-pointer',
			)}
		>
			<div className='flex items-center gap-4 rounded-xl border border-transparent p-3'>
				<CategoryStatusIcon status={cat.status} />
				<div className='min-w-0 flex-1'>
					<div className='flex flex-wrap items-center gap-2'>
						<span className='truncate text-base font-bold text-foreground'>
							{cat.categoryName}
						</span>
						<CategoryStatusBadge status={cat.status} />
						{cat.totalGapCount > 0 && (
							<span className='inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'>
								<AlertTriangle className='h-3 w-3' />
								{cat.totalGapCount} écart{cat.totalGapCount > 1 ? 's' : ''}
							</span>
						)}
					</div>
					<div className='mt-1 text-sm text-muted-foreground'>
						{cat.countedProducts}/{cat.totalProducts} produits
					</div>
					<div className='mt-2 max-w-xl'>
						<Progress value={progress} className='h-1.5' />
					</div>
				</div>
				{!validated && (
					<ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
				)}
			</div>
		</button>
	)
}

function CountingRow({
	entry,
	isValidated,
	isCountingProduct,
	lastInventoryAt,
	onSave,
	onReset,
}: {
	entry: InventoryEntry
	isValidated: boolean
	isCountingProduct: boolean
	lastInventoryAt?: string | null
	onSave: (entry: InventoryEntry, value: number) => void
	onReset: (entryId: string) => void
}) {
	const [localValue, setLocalValue] = useState(
		entry.status === 'counted' && entry.stock_compte !== null
			? String(entry.stock_compte)
			: '',
	)
	const isCounted = entry.status === 'counted'
	const isAdjusted = entry.adjusted
	const ecart =
		isCounted && entry.stock_compte !== null
			? entry.stock_compte - entry.stock_theorique
			: null

	const handleSave = () => {
		if (localValue === '') return
		const val = Number.parseInt(localValue, 10)
		if (Number.isNaN(val) || val < 0) return
		onSave(entry, val)
	}

	useEffect(() => {
		if (entry.status === 'counted' && entry.stock_compte !== null)
			setLocalValue(String(entry.stock_compte))
	}, [entry.status, entry.stock_compte])

	return (
		<tr
			className={cn(
				'transition-colors',
				isAdjusted
					? 'bg-muted/40 opacity-60'
					: isCounted
						? 'bg-muted/20'
						: 'hover:bg-muted/30',
			)}
		>
			<td className='px-2 py-1'>
				<div className='flex items-center gap-2.5'>
					<div
						className={cn(
							'w-2 h-2 rounded-full shrink-0',
							isAdjusted
								? 'bg-blue-400'
								: isCounted
									? 'bg-green-500'
									: 'bg-muted-foreground/30',
						)}
					/>
					<ProductImageById
						productId={entry.product_id}
						productName={entry.product_name}
					/>
					<div className='min-w-0'>
						<div className='font-medium truncate max-w-xs'>
							{entry.product_name}
						</div>
						{entry.product_sku && (
							<div className='text-xs text-muted-foreground'>
								SKU {entry.product_sku}
							</div>
						)}
						{entry.product_barcode && (
							<div className='text-xs text-muted-foreground font-mono tracking-wider'>
								{entry.product_barcode}
							</div>
						)}
						{lastInventoryAt && (
							<div className='text-xs text-orange-500'>
								Dernier inventaire : {formatInventoryDateTime(lastInventoryAt)}
							</div>
						)}
						{entry.counted_at && (
							<div className='text-xs text-muted-foreground'>
								Compté le {formatInventoryDateTime(entry.counted_at)}
							</div>
						)}
						{isAdjusted && (
							<div className='text-xs text-blue-500 font-medium'>
								✓ Ajusté AppPOS
							</div>
						)}
					</div>
				</div>
			</td>
			<td className='px-3 py-3 text-center'>
				<span className='text-muted-foreground font-mono'>
					{entry.stock_theorique}
				</span>
			</td>
			<td className='px-3 py-3 text-center'>
				{isValidated ? (
					<span className='font-mono font-medium'>
						{entry.stock_compte ?? '—'}
					</span>
				) : (
					<Input
						type='number'
						min={0}
						placeholder='—'
						value={localValue}
						onChange={(e) => setLocalValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') handleSave()
						}}
						onBlur={handleSave}
						className={cn(
							'w-20 h-8 text-center font-mono text-sm',
							isCounted &&
								'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
						)}
						disabled={isCountingProduct}
					/>
				)}
			</td>
			<td className='px-3 py-3 text-center'>
				{ecart !== null ? (
					<EcartBadge ecart={ecart} />
				) : (
					<span className='text-muted-foreground/40 text-sm'>…</span>
				)}
			</td>
			{!isValidated && (
				<td className='px-3 py-3 text-center'>
					{isCounted && (
						<button
							type='button'
							onClick={() => onReset(entry.id)}
							className='text-muted-foreground hover:text-foreground transition-colors'
							title='Réinitialiser'
						>
							<RotateCcw className='h-3.5 w-3.5' />
						</button>
					)}
				</td>
			)}
		</tr>
	)
}

function CategoryCountingView({
	sessionId,
	session,
	categoryId,
	categoryName,
	onBack,
}: {
	sessionId: string
	session: InventorySession
	categoryId: string
	categoryName: string
	onBack: () => void
}) {
	const {
		entries,
		entriesLoading,
		countProduct,
		resetProduct,
		isCountingProduct,
	} = useInventorySession(sessionId)
	const [searchQuery, setSearchQuery] = useState('')
	const searchRef = useRef<HTMLInputElement>(null)

	useScanner((barcode) => {
		setSearchQuery(barcode)
		searchRef.current?.focus()
	})

	const catEntries = entries.filter((e) => e.category_id === categoryId)
	const filteredEntries = useMemo(() => {
		const q = searchQuery.trim().toLowerCase()
		if (!q) return catEntries
		return catEntries.filter(
			(e) =>
				e.product_name.toLowerCase().includes(q) ||
				e.product_sku?.toLowerCase().includes(q) ||
				e.product_barcode?.toLowerCase().includes(q),
		)
	}, [catEntries, searchQuery])

	useEffect(() => {
		if (!entriesLoading) setTimeout(() => searchRef.current?.focus(), 100)
	}, [entriesLoading])

	const isValidated =
		session.validated_category_ids?.includes(categoryId) ?? false
	const countedEntries = catEntries.filter((e) => e.status === 'counted')
	const adjustedEntries = catEntries.filter((e) => e.adjusted)
	const gapsCount = catEntries.filter(
		(e) =>
			e.adjusted &&
			e.stock_compte !== null &&
			e.stock_compte !== e.stock_theorique,
	).length

	if (entriesLoading)
		return (
			<div className='flex items-center justify-center h-64'>
				<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
			</div>
		)

	return (
		<div className='flex flex-col h-full'>
			<div className='px-6 py-4 border-b flex items-center gap-4'>
				<Button variant='ghost' size='sm' onClick={onBack} className='gap-1.5'>
					<ArrowLeft className='h-4 w-4' />
					Retour
				</Button>
				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-2'>
						<h2 className='font-semibold text-lg truncate'>{categoryName}</h2>
						{isValidated && (
							<Badge variant='outline' className='text-xs gap-1'>
								<Lock className='h-3 w-3' />
								Validée
							</Badge>
						)}
					</div>
					<p className='text-xs text-muted-foreground'>
						{countedEntries.length}/{catEntries.length} comptés ·{' '}
						{adjustedEntries.length} ajusté
						{adjustedEntries.length > 1 ? 's' : ''} AppPOS
						{gapsCount > 0 && (
							<span className='ml-2 text-amber-600'>
								· {gapsCount} écart{gapsCount > 1 ? 's' : ''}
							</span>
						)}
					</p>
				</div>
			</div>
			<div className='px-6 py-2 border-b bg-muted/30'>
				<div className='relative max-w-sm'>
					<Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none' />
					<Input
						ref={searchRef}
						placeholder='Rechercher par nom, SKU ou code-barres...'
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className='pl-8 h-8 text-sm'
					/>
					{searchQuery && (
						<button
							type='button'
							onClick={() => {
								setSearchQuery('')
								searchRef.current?.focus()
							}}
							className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'
						>
							<X className='h-3.5 w-3.5' />
						</button>
					)}
				</div>
				{searchQuery && (
					<p className='text-xs text-muted-foreground mt-1'>
						{filteredEntries.length} résultat
						{filteredEntries.length > 1 ? 's' : ''} sur {catEntries.length}
					</p>
				)}
			</div>
			<div className='flex-1 overflow-y-auto'>
				<table className='w-full text-sm'>
					<thead className='sticky top-0 bg-background border-b'>
						<tr className='text-xs text-muted-foreground'>
							<th className='text-left px-6 py-3 font-medium'>Produit</th>
							<th className='text-center px-3 py-3 font-medium w-24'>
								Théorique
							</th>
							<th className='text-center px-3 py-3 font-medium w-32'>Compté</th>
							<th className='text-center px-3 py-3 font-medium w-20'>Écart</th>
							{!isValidated && <th className='w-10 px-3 py-3' />}
						</tr>
					</thead>
					<tbody className='divide-y'>
						{filteredEntries.length === 0 && searchQuery && (
							<tr>
								<td
									colSpan={5}
									className='px-6 py-8 text-center text-sm text-muted-foreground'
								>
									Aucun produit trouvé pour « {searchQuery} »
								</td>
							</tr>
						)}
						{filteredEntries.map((entry) => (
							<CountingRow
								key={entry.id}
								entry={entry}
								isValidated={isValidated}
								isCountingProduct={isCountingProduct}
								onSave={(entry, value) => countProduct(entry, value)}
								onReset={(entryId) => resetProduct(entryId)}
							/>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}

function SessionDetailView({
	sessionId,
	sessionDate,
	onBack,
}: { sessionId: string; sessionDate: string; onBack: () => void }) {
	const { data, isLoading } = useInventorySessionDetail(sessionId)
	const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)
	return (
		<div className='flex flex-col h-full'>
			<div className='px-6 py-4 border-b flex items-center gap-4 shrink-0'>
				<Button variant='ghost' size='sm' onClick={onBack} className='gap-1.5'>
					<ArrowLeft className='h-4 w-4' />
					Historique
				</Button>
				<div className='flex-1'>
					<h2 className='font-semibold text-base'>
						Inventaire du{' '}
						{new Date(sessionDate).toLocaleDateString('fr-FR', {
							day: '2-digit',
							month: 'long',
							year: 'numeric',
						})}
					</h2>
					{data && (
						<p className='text-xs text-muted-foreground'>
							{data.totalEntries} produit{data.totalEntries > 1 ? 's' : ''} ·{' '}
							{data.totalGaps > 0 ? (
								<span className='text-orange-600 dark:text-orange-400 font-medium'>
									{data.totalGaps} écart{data.totalGaps > 1 ? 's' : ''}
								</span>
							) : (
								<span className='text-green-600 dark:text-green-400 font-medium'>
									aucun écart
								</span>
							)}
						</p>
					)}
				</div>
			</div>
			<div className='flex-1 overflow-y-auto'>
				{isLoading ? (
					<div className='flex items-center justify-center h-40'>
						<Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
					</div>
				) : !data || data.categories.length === 0 ? (
					<div className='flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground'>
						<ClipboardList className='h-10 w-10 opacity-30' />
						<p className='text-sm'>Aucun produit compté dans cette session</p>
					</div>
				) : (
					<div className='divide-y'>
						{data.categories.map((cat) => {
							const isOpen = openCategoryId === cat.categoryId
							return (
								<div key={cat.categoryId}>
									<button
										type='button'
										className='w-full flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors text-left'
										onClick={() =>
											setOpenCategoryId(isOpen ? null : cat.categoryId)
										}
									>
										<div className='flex-1 min-w-0'>
											<div className='flex items-center gap-2'>
												<span className='font-medium text-sm truncate'>
													{cat.categoryName}
												</span>
												{cat.gapCount > 0 && (
													<span className='flex items-center gap-0.5 text-xs text-orange-600 dark:text-orange-400 font-medium shrink-0'>
														<AlertTriangle className='h-3 w-3' />
														{cat.gapCount} écart{cat.gapCount > 1 ? 's' : ''}
													</span>
												)}
											</div>
											<p className='text-xs text-muted-foreground'>
												{cat.totalProducts} produit
												{cat.totalProducts > 1 ? 's' : ''}
											</p>
										</div>
										<ChevronRight
											className={cn(
												'h-4 w-4 text-muted-foreground shrink-0 transition-transform',
												isOpen && 'rotate-90',
											)}
										/>
									</button>
									{isOpen && (
										<div className='bg-muted/10 border-t'>
											{cat.entries.map((entry) => {
												const ecart =
													entry.stock_compte !== null
														? entry.stock_compte - entry.stock_theorique
														: null
												const hasGap = ecart !== null && ecart !== 0
												return (
													<div
														key={entry.id}
														className={cn(
															'flex items-center gap-3 px-2 py-1 border-b border-border/50 last:border-0',
															hasGap && 'bg-orange-500/5',
														)}
													>
														<ProductImageById
															productId={entry.product_id}
															productName={entry.product_name}
														/>
														<div className='flex-1 min-w-0'>
															<p className='text-sm font-medium truncate'>
																{entry.product_name}
															</p>
															<p className='text-xs text-muted-foreground'>
																{entry.product_sku && (
																	<span>SKU {entry.product_sku}</span>
																)}
																{entry.product_sku && entry.product_barcode && (
																	<span className='mx-1'>·</span>
																)}
																{entry.product_barcode && (
																	<span>{entry.product_barcode}</span>
																)}
																{entry.counted_at && (
																	<>
																		{(entry.product_sku ||
																			entry.product_barcode) && (
																			<span className='mx-1'>·</span>
																		)}
																		<span>
																			{new Date(
																				entry.counted_at,
																			).toLocaleString('fr-FR', {
																				day: '2-digit',
																				month: '2-digit',
																				hour: '2-digit',
																				minute: '2-digit',
																			})}
																		</span>
																	</>
																)}
															</p>
														</div>
														<div className='text-right shrink-0'>
															<div className='flex items-center gap-2 justify-end'>
																<span className='text-xs text-muted-foreground'>
																	Théo.{' '}
																	<span className='font-medium text-foreground'>
																		{entry.stock_theorique}
																	</span>
																</span>
																<span className='text-xs text-muted-foreground'>
																	→
																</span>
																<span className='text-xs text-muted-foreground'>
																	Compté{' '}
																	<span className='font-medium text-foreground'>
																		{entry.stock_compte ?? '—'}
																	</span>
																</span>
															</div>
															{ecart !== null && (
																<div className='mt-0.5'>
																	<EcartBadge ecart={ecart} />
																</div>
															)}
														</div>
													</div>
												)
											})}
										</div>
									)}
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}

function InventoryHistoryView({ onBack }: { onBack: () => void }) {
	const [page, setPage] = useState(1)
	const { data, isLoading } = useInventoryHistory(page)
	const sessions = data?.items ?? []
	const totalPages = data?.totalPages ?? 1
	const [selectedSession, setSelectedSession] = useState<{
		id: string
		date: string
	} | null>(null)

	function formatDuration(startedAt: string, completedAt: string | null) {
		if (!completedAt) return null
		const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
		const totalMin = Math.round(ms / 60000)
		if (totalMin < 60) return `${totalMin} min`
		const h = Math.floor(totalMin / 60)
		const m = totalMin % 60
		return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`
	}

	if (selectedSession)
		return (
			<SessionDetailView
				sessionId={selectedSession.id}
				sessionDate={selectedSession.date}
				onBack={() => setSelectedSession(null)}
			/>
		)

	return (
		<div className='flex flex-col h-full'>
			<div className='px-6 py-4 border-b flex items-center gap-4'>
				<Button variant='ghost' size='sm' onClick={onBack} className='gap-1.5'>
					<ArrowLeft className='h-4 w-4' />
					Retour
				</Button>
				<h2 className='font-semibold text-lg'>Historique des inventaires</h2>
				<span className='text-xs text-muted-foreground ml-auto'>
					{sessions.length} session{sessions.length > 1 ? 's' : ''}
				</span>
			</div>
			<div className='flex-1 overflow-y-auto'>
				{isLoading ? (
					<div className='flex items-center justify-center h-40'>
						<Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
					</div>
				) : sessions.length === 0 ? (
					<div className='flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground'>
						<History className='h-10 w-10 opacity-30' />
						<p className='text-sm'>Aucun inventaire complété pour l'instant</p>
					</div>
				) : (
					<div className='divide-y'>
						{sessions.map((session) => {
							const duration = formatDuration(
								session.started_at,
								session.completed_at,
							)
							const hasStats = session.stats_total_products != null
							const categoryNames: string[] = session.stats_category_names ?? []
							const gapCount = session.stats_total_gaps ?? 0
							const totalProducts = session.stats_total_products ?? 0
							const countedProducts = session.stats_counted_products ?? 0
							const progressPct =
								totalProducts > 0
									? Math.round((countedProducts / totalProducts) * 100)
									: 0
							return (
								<button
									key={session.id}
									type='button'
									className='w-full flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors text-left'
									onClick={() =>
										setSelectedSession({
											id: session.id,
											date: session.started_at,
										})
									}
								>
									<div
										className={cn(
											'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
											session.status === 'completed'
												? 'bg-green-500/10'
												: 'bg-muted',
										)}
									>
										{session.status === 'completed' ? (
											<CheckCircle2 className='h-5 w-5 text-green-500' />
										) : (
											<X className='h-5 w-5 text-muted-foreground' />
										)}
									</div>
									<div className='flex-1 min-w-0'>
										<div className='flex items-center gap-2 mb-1'>
											<span className='font-medium text-sm'>
												{new Date(session.started_at).toLocaleDateString(
													'fr-FR',
													{ day: '2-digit', month: 'long', year: 'numeric' },
												)}
											</span>
											{session.scope === 'free' && session.label && (
												<span className='text-xs font-medium text-orange-600 dark:text-orange-400'>
													· {session.label}
												</span>
											)}
											<span
												className={cn(
													'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
													session.status === 'completed'
														? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
														: 'bg-muted text-muted-foreground',
												)}
											>
												{session.status === 'completed'
													? 'Complété'
													: `Interrompu (${progressPct}% fait)`}
											</span>
										</div>
										<div className='flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground'>
											<span className='font-medium text-foreground/70'>
												{session.operator}
											</span>
											<span>·</span>
											<span>
												{session.scope === 'free'
													? 'Session libre'
													: session.scope === 'all'
														? 'Catalogue complet'
														: `${session.scope_category_ids?.length ?? 0} catégorie(s)`}
											</span>
											{duration && (
												<>
													<span>·</span>
													<span className='flex items-center gap-0.5'>
														<Clock className='h-3 w-3' />
														{duration}
													</span>
												</>
											)}
										</div>
										{hasStats && (
											<div className='flex flex-wrap items-center gap-x-3 mt-1 text-xs'>
												<span className='text-muted-foreground'>
													<span className='font-semibold text-foreground/80'>
														{totalProducts}
													</span>{' '}
													produit{totalProducts > 1 ? 's' : ''}
												</span>
												<span className='text-muted-foreground'>·</span>
												<span className='text-muted-foreground'>
													<span className='font-semibold text-foreground/80'>
														{progressPct}%
													</span>{' '}
													compté
												</span>
												{gapCount > 0 ? (
													<>
														<span className='text-muted-foreground'>·</span>
														<span className='flex items-center gap-0.5 text-orange-600 dark:text-orange-400 font-medium'>
															<AlertTriangle className='h-3 w-3' />
															{gapCount} écart{gapCount > 1 ? 's' : ''}
														</span>
													</>
												) : (
													<>
														<span className='text-muted-foreground'>·</span>
														<span className='flex items-center gap-0.5 text-green-600 dark:text-green-400 font-medium'>
															<CheckCircle2 className='h-3 w-3' />
															Aucun écart
														</span>
													</>
												)}
											</div>
										)}
										{categoryNames.length > 0 && (
											<div className='flex flex-wrap gap-1 mt-1.5'>
												{categoryNames.slice(0, 5).map((name) => (
													<span
														key={name}
														className='text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground'
													>
														{name}
													</span>
												))}
												{categoryNames.length > 5 && (
													<span className='text-xs text-muted-foreground px-1'>
														+{categoryNames.length - 5}
													</span>
												)}
											</div>
										)}
									</div>
									<ChevronRight className='h-4 w-4 text-muted-foreground shrink-0' />
								</button>
							)
						})}
					</div>
				)}
			</div>
			{totalPages > 1 && (
				<div className='flex items-center justify-between px-6 py-4 border-t'>
					<Button
						variant='outline'
						size='sm'
						onClick={() => setPage((p) => Math.max(1, p - 1))}
						disabled={page === 1 || isLoading}
					>
						Précédent
					</Button>
					<span className='text-sm text-muted-foreground'>
						Page {page} sur {totalPages}
					</span>
					<Button
						variant='outline'
						size='sm'
						onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
						disabled={page === totalPages || isLoading}
					>
						Suivant
					</Button>
				</div>
			)}
		</div>
	)
}

function InventoryHomeView({
	activeSessions,
	sessionsLoading,
	onSelectSession,
	onStart,
	isStarting,
}: {
	activeSessions: InventorySession[]
	sessionsLoading: boolean
	onSelectSession: (session: InventorySession) => void
	onStart: () => void
	isStarting: boolean
}) {
	if (sessionsLoading)
		return (
			<div className='flex items-center justify-center h-full min-h-[400px]'>
				<Loader2 className='h-6 w-6 animate-spin text-orange-500' />
			</div>
		)
	return (
		<div className='flex flex-col h-full overflow-y-auto'>
			<div className='px-6 pt-6 pb-4'>
				<div className='mb-4'>
					<GlobalInventoryCapitalStats />
				</div>
				<div className='mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
					<div>
						<h2 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider'>
							Sessions en cours ({activeSessions.length})
						</h2>
						<p className='mt-1 text-sm text-muted-foreground'>
							L'action principale est de continuer le comptage là où il s'est
							arrêté.
						</p>
					</div>
					<Button
						variant='outline'
						onClick={() =>
							activeSessions[0] && onSelectSession(activeSessions[0])
						}
						className='gap-2 self-start border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700'
					>
						<Clock className='h-4 w-4' />
						Continuer la plus récente
					</Button>
				</div>
				<div className='grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3'>
					{activeSessions.map((session) => (
						<SessionCard
							key={session.id}
							session={session}
							onSelect={() => onSelectSession(session)}
						/>
					))}
				</div>
			</div>
			<div
				className={cn(
					'flex flex-col items-center justify-center gap-8 px-6',
					activeSessions.length > 0 ? 'py-8 border-t' : 'h-full min-h-[500px]',
				)}
			>
				{activeSessions.length === 0 && (
					<div className='text-center max-w-md'>
						<div className='w-20 h-20 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-6'>
							<ClipboardList className='h-10 w-10 text-orange-500' />
						</div>
						<h2 className='text-2xl font-bold mb-2'>Inventaire physique</h2>
						<p className='text-muted-foreground'>
							Comptez vos stocks rayon par rayon. Les écarts sont appliqués
							automatiquement dans AppPOS à la validation.
						</p>
					</div>
				)}
				<Button
					size='lg'
					className='gap-2 bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 px-8'
					onClick={onStart}
					disabled={isStarting}
				>
					{isStarting ? (
						<Loader2 className='h-4 w-4 animate-spin' />
					) : (
						<Sparkles className='h-4 w-4' />
					)}
					{activeSessions.length > 0
						? 'Démarrer un nouvel inventaire'
						: 'Démarrer un inventaire'}
				</Button>
				{activeSessions.length === 0 && (
					<div className='flex gap-8 text-center text-sm text-muted-foreground'>
						<div>
							<div className='font-semibold text-foreground text-lg'>1</div>
							<div>Sélectionner le périmètre</div>
						</div>
						<div className='border-l' />
						<div>
							<div className='font-semibold text-foreground text-lg'>2</div>
							<div>Compter rayon par rayon</div>
						</div>
						<div className='border-l' />
						<div>
							<div className='font-semibold text-foreground text-lg'>3</div>
							<div>Valider et appliquer les écarts</div>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

function SessionCard({
	session,
	onSelect,
}: { session: InventorySession; onSelect: () => void }) {
	const { data: progress } = useSessionProgress(session.id)
	const { entries } = useInventorySession(session.id)
	const lastCountedAt = useMemo(() => getLastCountedAt(entries), [entries])

	const total = progress?.total ?? 0
	const counted = progress?.counted ?? 0
	const pending = Math.max(total - counted, 0)
	const percent = total > 0 ? Math.round((counted / total) * 100) : 0
	const categoryNames = progress?.categoryNames ?? []
	const primaryCategory =
		session.scope === 'free'
			? (session.label ?? 'Session libre')
			: getPrimaryCategoryLabel(categoryNames)

	return (
		<button
			type='button'
			onClick={onSelect}
			className='group w-full rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md'
		>
			<div className='flex items-start gap-4'>
				<div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500'>
					<ClipboardList className='h-5 w-5' />
				</div>
				<div className='min-w-0 flex-1'>
					<div className='flex flex-wrap items-center gap-2'>
						<h3 className='truncate text-base font-bold text-foreground'>
							{primaryCategory}
						</h3>
						<span
							className={cn(
								'rounded-full px-2 py-0.5 text-xs font-semibold',
								session.status === 'in_progress'
									? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
									: 'bg-muted text-muted-foreground',
							)}
						>
							{getInventoryStatusLabel(session.status)}
						</span>
					</div>
					<div className='mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
						<span className='inline-flex items-center gap-1'>
							<Clock className='h-3.5 w-3.5' />
							{formatInventoryActivityLabel(session.started_at, lastCountedAt)}
						</span>
						<span>Opérateur : {session.operator}</span>
					</div>
					<div className='mt-3 grid grid-cols-2 gap-2'>
						<div className='rounded-xl border border-border/70 bg-muted/30 px-3 py-2'>
							<div className='text-[11px] uppercase tracking-wide text-muted-foreground'>
								Progression
							</div>
							<div className='mt-0.5 text-lg font-bold text-foreground'>
								{percent}%
							</div>
							<div className='mt-2 h-1.5 overflow-hidden rounded-full bg-muted'>
								<div
									className='h-full rounded-full bg-orange-500 transition-all duration-500'
									style={{ width: `${percent}%` }}
								/>
							</div>
						</div>
						<div className='rounded-xl border border-border/70 bg-muted/30 px-3 py-2'>
							<div className='text-[11px] uppercase tracking-wide text-muted-foreground'>
								À compter
							</div>
							<div className='mt-0.5 text-lg font-bold text-foreground'>
								{pending}
							</div>
							<div className='text-xs text-muted-foreground'>
								{counted} / {total} produits
							</div>
						</div>
					</div>
					{session.scope !== 'free' && categoryNames.length > 1 && (
						<div className='mt-3 flex items-center justify-between gap-3'>
							<div className='min-w-0 flex-1'>
								<div className='flex flex-wrap gap-1.5'>
									{categoryNames.slice(0, 3).map((name) => (
										<span
											key={name}
											className='rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
										>
											{name}
										</span>
									))}
									{categoryNames.length > 3 && (
										<span className='px-1 text-xs text-muted-foreground'>
											+{categoryNames.length - 3}
										</span>
									)}
								</div>
							</div>
							<div className='inline-flex items-center gap-2 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white'>
								Continuer
								<ChevronRight className='h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5' />
							</div>
						</div>
					)}
					{session.scope === 'free' && (
						<div className='mt-3 flex justify-end'>
							<div className='inline-flex items-center gap-2 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white'>
								Continuer
								<ChevronRight className='h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5' />
							</div>
						</div>
					)}
				</div>
			</div>
		</button>
	)
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================
export function InventoryPageAppPos() {
	const [view, setView] = useState<PageView>('home')
	const [showCreateDialog, setShowCreateDialog] = useState(false)
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
		null,
	)
	const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
	const [activeCategoryName, setActiveCategoryName] = useState('')

	const { user } = useAuth()
	const userName = (user as any)?.name || (user as any)?.username || ''
	const pb = usePocketBase()

	const { data: activeSessions = [], isLoading: sessionsLoading } =
		useActiveSessions()
	const createSession = useCreateInventorySession()
	const { progress: creationProgress } = createSession
	const currentSession =
		activeSessions.find((s) => s.id === selectedSessionId) ?? null

	const {
		summary,
		entries,
		entriesLoading,
		completeSession,
		cancelSession,
		isCompletingSession,
		isCancellingSession,
	} = useInventorySession(selectedSessionId ?? undefined)
	const currentSessionLastCountedAt = useMemo(
		() => getLastCountedAt(entries),
		[entries],
	)

	useEffect(() => {
		if (
			selectedSessionId &&
			!sessionsLoading &&
			activeSessions.length > 0 &&
			!activeSessions.find((s) => s.id === selectedSessionId)
		) {
			setSelectedSessionId(null)
			setView('home')
		}
	}, [activeSessions, selectedSessionId, sessionsLoading])

	const handleSelectSession = (session: InventorySession) => {
		setSelectedSessionId(session.id)
		setView('overview')
	}

	const handleCreateConfirm = async (
		operator: string,
		scope: 'selection' | 'free',
		categoryIds: string[],
		label?: string,
		targetedProductIds?: string[],
	) => {
		const result = await createSession.mutateAsync({
			operator,
			scope,
			scope_category_ids: categoryIds,
			label: label ?? null,
		})

		if (targetedProductIds && targetedProductIds.length > 0) {
			const freshCatalog: any[] = await appPosApi
				.getProducts()
				.then((p) => appPosTransformers.products(p))
			const entries = targetedProductIds.map((pid) => {
				const p = freshCatalog.find((c: any) => c.id === pid) as any
				return {
					product_id: p.id,
					product_name: p.name ?? '',
					product_sku: p.sku ?? '',
					product_barcode: p.barcode ?? '',
					product_image: p.images ?? '',
					category_id: (p.categories as string[])?.[0] ?? '',
					category_name: label ?? 'Session ciblée',
					stock_theorique: Number(p.stock_quantity ?? 0),
				}
			})
			await createInventoryEntries(pb, result.session.id, entries)
		}

		setShowCreateDialog(false)
		setSelectedSessionId(result.session.id)
		setView('overview')
	}

	const handleSelectCategory = (catId: string, catName: string) => {
		setActiveCategoryId(catId)
		setActiveCategoryName(catName)
		setView('counting')
	}

	const handleCompleteSession = async () => {
		await completeSession()
		setSelectedSessionId(null)
		setView('home')
	}

	const handleCancelSession = async () => {
		if (
			!confirm(
				"Annuler l'inventaire ? Les ajustements déjà appliqués ne seront pas annulés.",
			)
		)
			return
		await cancelSession()
		setSelectedSessionId(null)
		setView('home')
	}

	const sessionsBadge =
		activeSessions.length > 0 ? (
			<StatusBadge label={`${activeSessions.length} en cours`} variant='info' />
		) : undefined

	return (
		<ModulePageShell
			manifest={inventoryManifest as any}
			badge={sessionsBadge}
			actions={
				<Button
					variant='outline'
					size='sm'
					className='gap-1.5'
					onClick={() => setView('history')}
				>
					<History className='h-3.5 w-3.5' />
					Historique
				</Button>
			}
		>
			<div className='flex flex-col h-full -m-6 overflow-hidden'>
				{creationProgress && (
					<div className='flex flex-col items-center justify-center h-full gap-6'>
						<div className='w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center'>
							<Loader2 className='h-8 w-8 text-orange-500 animate-spin' />
						</div>
						<div className='text-center'>
							<h3 className='text-lg font-semibold mb-1'>
								Création du snapshot en cours...
							</h3>
							<p className='text-sm text-muted-foreground mb-4'>
								{creationProgress.done} / {creationProgress.total} produits
								enregistrés
							</p>
							<div className='w-72'>
								<div className='h-2 bg-muted rounded-full overflow-hidden'>
									<div
										className='h-full bg-orange-500 rounded-full transition-all duration-300'
										style={{
											width: `${Math.round((creationProgress.done / creationProgress.total) * 100)}%`,
										}}
									/>
								</div>
								<p className='text-xs text-muted-foreground mt-1 text-right'>
									{Math.round(
										(creationProgress.done / creationProgress.total) * 100,
									)}
									%
								</p>
							</div>
						</div>
					</div>
				)}

				{view === 'home' && !creationProgress && (
					<InventoryHomeView
						activeSessions={activeSessions}
						sessionsLoading={sessionsLoading}
						onSelectSession={handleSelectSession}
						onStart={() => setShowCreateDialog(true)}
						isStarting={createSession.isPending}
					/>
				)}

				{view === 'overview' &&
					currentSession &&
					!creationProgress &&
					(currentSession.scope === 'free' ? (
						<FreeSessionView
							session={currentSession}
							onComplete={handleCompleteSession}
							onCancel={handleCancelSession}
							onBack={() => setView('home')}
							isCompleting={isCompletingSession}
							isCancelling={isCancellingSession}
						/>
					) : entriesLoading || !summary ? (
						<div className='flex flex-col items-center justify-center h-full gap-4'>
							<Loader2 className='h-6 w-6 animate-spin text-orange-500' />
							<p className='text-sm text-muted-foreground'>
								Chargement des produits...
							</p>
						</div>
					) : summary.totalProducts === 0 ? (
						<div className='flex flex-col items-center justify-center h-full gap-4'>
							<p className='text-sm text-muted-foreground'>
								Aucun produit dans cette session.
							</p>
							<Button
								variant='outline'
								size='sm'
								onClick={() => window.location.reload()}
								className='gap-2'
							>
								<RotateCcw className='h-3.5 w-3.5' />
								Rafraîchir la page
							</Button>
						</div>
					) : (
						<SessionOverviewView
							session={currentSession}
							summary={summary}
							lastCountedAt={currentSessionLastCountedAt}
							onSelectCategory={(catId) => {
								const cat = summary.categories.find(
									(c) => c.categoryId === catId,
								)
								handleSelectCategory(catId, cat?.categoryName ?? '')
							}}
							onComplete={handleCompleteSession}
							onCancel={handleCancelSession}
							onBack={() => setView('home')}
							isCompleting={isCompletingSession}
							isCancelling={isCancellingSession}
						/>
					))}

				{view === 'history' && (
					<InventoryHistoryView onBack={() => setView('home')} />
				)}

				{view === 'counting' && currentSession && activeCategoryId && (
					<CategoryCountingView
						sessionId={currentSession.id}
						session={currentSession}
						categoryId={activeCategoryId}
						categoryName={activeCategoryName}
						onBack={() => setView('overview')}
					/>
				)}

				<CreateSessionDialog
					open={showCreateDialog}
					onClose={() => setShowCreateDialog(false)}
					onConfirm={handleCreateConfirm}
					isLoading={createSession.isPending}
					activeSessions={activeSessions}
					defaultOperator={userName}
				/>

				{createSession.error && (
					<div className='fixed bottom-4 right-4 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive shadow-lg max-w-sm'>
						{(createSession.error as Error).message}
					</div>
				)}
			</div>
		</ModulePageShell>
	)
}
