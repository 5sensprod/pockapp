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
import { getAppPosToken, loginToAppPos } from '@/lib/apppos'
import { appPosApi } from '@/lib/apppos/apppos-api'
import { getAppPosImageUrl } from '@/lib/apppos/apppos-config'
import { useAppPosCategoriesWithCounts } from '@/lib/apppos/apppos-hooks'
import { appPosTransformers } from '@/lib/apppos/apppos-transformers'
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
import { cn } from '@/lib/utils'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useQuery } from '@tanstack/react-query'
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
	PlusCircle,
	RotateCcw,
	Search,
	Sparkles,
	X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

// Manifest local pour le ModulePageShell
// (on ne réutilise pas le manifest stock pour éviter le sidebarMenu du stock)
const inventoryManifest = {
	id: 'inventory',
	name: 'Inventaire',
	description: 'Inventaire physique AppPOS',
	icon: ClipboardList,
	route: '/inventory-apppos',
}

// ============================================================================
// TYPES LOCAUX
// ============================================================================
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

	return `${date.toLocaleDateString('fr-FR', {
		weekday: 'short',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})} · ${time}`
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

function InventoryCapitalStats({
	totalProducts,
	countedProducts,
	label = 'Vision stock',
}: {
	totalProducts: number
	countedProducts: number
	label?: string
}) {
	const remainingProducts = Math.max(totalProducts - countedProducts, 0)
	const progress =
		totalProducts > 0 ? Math.round((countedProducts / totalProducts) * 100) : 0

	return (
		<div className='rounded-2xl border border-orange-200/80 bg-orange-50/60 p-4 shadow-sm dark:border-orange-900/50 dark:bg-orange-950/10'>
			<div className='mb-3 flex items-start justify-between gap-3'>
				<div>
					<p className='text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300'>
						{label}
					</p>
					<h3 className='mt-1 text-lg font-bold text-foreground'>
						Stock à saisir
					</h3>
				</div>

				<div className='rounded-full bg-orange-500 px-3 py-1 text-sm font-bold text-white'>
					{progress}%
				</div>
			</div>

			<div className='grid grid-cols-3 gap-2'>
				<div className='rounded-xl bg-background/85 px-3 py-2'>
					<div className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
						Total
					</div>
					<div className='mt-1 text-2xl font-black text-foreground'>
						{totalProducts}
					</div>
				</div>

				<div className='rounded-xl bg-background/85 px-3 py-2'>
					<div className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
						Comptés
					</div>
					<div className='mt-1 text-2xl font-black text-green-700 dark:text-green-300'>
						{countedProducts}
					</div>
				</div>

				<div className='rounded-xl bg-background/85 px-3 py-2'>
					<div className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
						Restants
					</div>
					<div className='mt-1 text-2xl font-black text-amber-700 dark:text-amber-300'>
						{remainingProducts}
					</div>
				</div>
			</div>

			<div className='mt-3'>
				<div className='mb-1 flex items-center justify-between text-xs text-muted-foreground'>
					<span>
						{countedProducts} / {totalProducts} produits entrés
					</span>
					<span className='font-semibold text-foreground'>
						{remainingProducts} à faire
					</span>
				</div>
				<Progress value={progress} className='h-2' />
			</div>
		</div>
	)
}

function CreateSessionStockStats({
	totalProducts,
	countedProducts,
	isLoading = false,
}: {
	totalProducts: number
	countedProducts: number
	isLoading?: boolean
}) {
	const remainingProducts = Math.max(totalProducts - countedProducts, 0)
	const countedPercent =
		totalProducts > 0 ? Math.round((countedProducts / totalProducts) * 100) : 0

	return (
		<div className='rounded-2xl border border-orange-200/80 bg-orange-50/60 p-4 shadow-sm dark:border-orange-900/50 dark:bg-orange-950/10'>
			<div className='mb-3 flex items-start justify-between gap-3'>
				<div>
					<p className='text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300'>
						Stock global
					</p>
					<h3 className='mt-1 text-base font-bold text-foreground'>
						Avancement inventaire
					</h3>
				</div>

				<div className='rounded-full bg-orange-500 px-3 py-1 text-sm font-bold text-white'>
					{countedPercent}%
				</div>
			</div>

			<div className='grid grid-cols-3 gap-2'>
				<div className='rounded-xl bg-background/85 px-3 py-2'>
					<div className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
						Total
					</div>
					<div className='mt-1 text-2xl font-black text-foreground'>
						{isLoading ? '…' : totalProducts}
					</div>
				</div>

				<div className='rounded-xl bg-background/85 px-3 py-2'>
					<div className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
						Comptés
					</div>
					<div className='mt-1 text-2xl font-black text-green-700 dark:text-green-300'>
						{countedProducts}
					</div>
				</div>

				<div className='rounded-xl bg-background/85 px-3 py-2'>
					<div className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
						À compter
					</div>
					<div className='mt-1 text-2xl font-black text-amber-700 dark:text-amber-300'>
						{isLoading ? '…' : remainingProducts}
					</div>
				</div>
			</div>

			<div className='mt-3'>
				<div className='mb-1 flex items-center justify-between text-xs text-muted-foreground'>
					<span>
						{countedProducts} / {isLoading ? '…' : totalProducts} produits
						comptés
					</span>
					<span className='font-semibold text-foreground'>
						{isLoading ? '…' : remainingProducts} à faire
					</span>
				</div>
				<Progress value={countedPercent} className='h-2' />
			</div>
		</div>
	)
}

function SessionProgressReporter({
	sessionId,
	onChange,
}: {
	sessionId: string
	onChange: (
		sessionId: string,
		value: { total: number; counted: number },
	) => void
}) {
	const { data: progress } = useSessionProgress(sessionId)

	useEffect(() => {
		onChange(sessionId, {
			total: progress?.total ?? 0,
			counted: progress?.counted ?? 0,
		})
	}, [sessionId, progress?.total, progress?.counted, onChange])

	return null
}

function ActiveSessionsCapitalStats({
	sessions,
}: {
	sessions: InventorySession[]
}) {
	const [progressBySession, setProgressBySession] = useState<
		Record<string, { total: number; counted: number }>
	>({})

	const handleProgressChange = (
		sessionId: string,
		value: { total: number; counted: number },
	) => {
		setProgressBySession((current) => {
			const previous = current[sessionId]
			if (
				previous?.total === value.total &&
				previous?.counted === value.counted
			) {
				return current
			}

			return {
				...current,
				[sessionId]: value,
			}
		})
	}

	const totals = sessions.reduce(
		(acc, session) => {
			const progress = progressBySession[session.id]
			const total = progress?.total ?? session.stats_total_products ?? 0
			const counted = progress?.counted ?? session.stats_counted_products ?? 0

			return {
				total: acc.total + total,
				counted: acc.counted + counted,
			}
		},
		{ total: 0, counted: 0 },
	)

	return (
		<>
			{sessions.map((session) => (
				<SessionProgressReporter
					key={session.id}
					sessionId={session.id}
					onChange={handleProgressChange}
				/>
			))}

			<InventoryCapitalStats
				totalProducts={totals.total}
				countedProducts={totals.counted}
				label='Sessions en cours'
			/>
		</>
	)
}

// ============================================================================
// IMAGE PRODUIT — résolue dynamiquement via le catalogue AppPOS caché
// (le snapshot d'inventaire ne stocke plus l'URL : on la récupère par product_id)
// ============================================================================
function ProductImageById({
	productId,
	productName,
}: { productId: string; productName: string }) {
	// On consomme exactement la même queryKey que useAppPosProducts() dans apppos-hooks.
	// Avantages :
	//   1. React Query déduplique → une seule requête réseau pour toute l'app
	//      (partagée avec ProductsPanel, etc.)
	//   2. On obtient le CATALOGUE COMPLET non paginé
	//      (useAppPosProducts retourne un résultat paginé limit=50, donc inutilisable ici)
	//   3. Le composant re-render automatiquement quand les données arrivent
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
		// Préfixe vers l'origine AppPOS (sinon /uploads/... tape sur le frontend → 404).
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

// ============================================================================
// HELPERS VISUELS — inchangés
// ============================================================================
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
// DIALOG CRÉATION SESSION — inchangé
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
		scope: 'selection',
		categoryIds: string[],
	) => void
	isLoading: boolean
	activeSessions: InventorySession[]
	defaultOperator?: string
}) {
	const [operator, setOperator] = useState(defaultOperator)
	const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
	const [search, setSearch] = useState('')
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

	const { data: categoriesRaw = [] } = useAppPosCategoriesWithCounts()
	const { data: history } = useInventoryHistory()

	// Catalogue complet AppPOS : source fiable pour le total global produits.
	// Les compteurs de catégories peuvent compter des regroupements / sous-rayons,
	// donc ils ne doivent pas servir au total global catalogue.
	const { data: catalogProducts = [], isLoading: catalogLoading } = useQuery({
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

	const globalProductTotal = catalogProducts.length

	const globalCountedProductTotal = useMemo(() => {
		const countedProductIds = new Set<string>()

		for (const session of activeSessions) {
			for (const entry of (session as any).entries ?? []) {
				if (entry.status === 'counted' || entry.stock_compte !== null) {
					countedProductIds.add(entry.product_id)
				}
			}
		}

		for (const session of history?.items ?? []) {
			if (session.status !== 'completed') continue

			for (const entry of (session as any).entries ?? []) {
				if (entry.status === 'counted' || entry.stock_compte !== null) {
					countedProductIds.add(entry.product_id)
				}
			}

			// Fallback si l'historique ne renvoie que les stats agrégées.
			if (((session as any).entries ?? []).length === 0) {
				return Math.max(
					0,
					Math.min(
						globalProductTotal,
						(history?.items ?? [])
							.filter((item) => item.status === 'completed')
							.reduce(
								(total, item) => total + (item.stats_counted_products ?? 0),
								0,
							),
					),
				)
			}
		}

		return countedProductIds.size
	}, [activeSessions, history, globalProductTotal])

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
			setSelectedCategoryIds([])
			setSearch('')
			setExpandedGroups(new Set())
		}
	}, [open, defaultOperator])

	// ── Type tag enrichi ──────────────────────────────────────────────────
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

		// Sessions actives — priorité absolue
		for (const session of activeSessions) {
			for (const catId of session.scope_category_ids ?? []) {
				tags.set(catId, {
					type: 'active',
					sessionOperator: session.operator,
				})
			}
		}

		// Historique — seulement si pas déjà tagué "active"
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
						countedProducts: session.stats_counted_products ?? null,
						totalProducts: session.stats_total_products ?? null,
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

			if (children.length > 0) {
				groups.push({ parent: root, children })
			} else {
				groups.push({ parent: null, children: [root] })
			}
		}

		const orphans = categories
			.filter((c) => c.parent && !byId.has(c.parent))
			.sort((a, b) => a.name.localeCompare(b.name, 'fr'))

		if (orphans.length > 0) {
			groups.push({ parent: null, children: orphans })
		}

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

	const toggleExpand = (groupId: string) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev)
			next.has(groupId) ? next.delete(groupId) : next.add(groupId)
			return next
		})
	}

	const toggleCategory = (id: string) => {
		setSelectedCategoryIds((prev) =>
			prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
		)
	}

	const toggleGroup = (ids: string[]) => {
		const allSelected = ids.every((id) => selectedCategoryIds.includes(id))
		setSelectedCategoryIds((prev) =>
			allSelected
				? prev.filter((id) => !ids.includes(id))
				: [...prev, ...ids.filter((id) => !prev.includes(id))],
		)
	}

	// ── Stats résumées pour la ligne parente ──────────────────────────────
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
		const firstDoneTag = childIds
			.map((id) => categoryTags.get(id))
			.find(
				(t): t is Extract<CategoryTag, { type: 'done' }> => t?.type === 'done',
			)
		return { selectedCount, activeCount, doneCount, firstDoneTag }
	}

	// ── Rendu tag pour une sous-catégorie ────────────────────────────────
	const renderTag = (tag: CategoryTag | undefined) => {
		if (!tag) return null

		if (tag.type === 'active') {
			return (
				<span className='text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shrink-0 whitespace-nowrap'>
					En cours
				</span>
			)
		}

		return (
			<div className='flex flex-col items-end gap-0 shrink-0'>
				<span className='text-xs text-muted-foreground whitespace-nowrap'>
					{tag.date}
				</span>
				{tag.countedProducts !== null && tag.totalProducts !== null && (
					<span className='text-xs text-green-600 dark:text-green-400 font-medium whitespace-nowrap'>
						{tag.countedProducts}/{tag.totalProducts} comptés
					</span>
				)}
			</div>
		)
	}

	// ── Rendu tag résumé pour la ligne parente ────────────────────────────
	const renderGroupTag = (
		childIds: string[],
		stats: ReturnType<typeof getGroupStats>,
	) => {
		const { activeCount, doneCount, firstDoneTag } = stats

		if (activeCount > 0) {
			return (
				<span className='text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shrink-0 whitespace-nowrap'>
					{activeCount} en cours
				</span>
			)
		}

		if (doneCount > 0 && firstDoneTag) {
			return (
				<div className='flex flex-col items-end gap-0 shrink-0'>
					<span className='text-xs text-muted-foreground whitespace-nowrap'>
						{firstDoneTag.date} · {doneCount}/{childIds.length} cat.
					</span>
					{firstDoneTag.countedProducts !== null &&
						firstDoneTag.totalProducts !== null && (
							<span className='text-xs text-green-600 dark:text-green-400 font-medium whitespace-nowrap'>
								{firstDoneTag.countedProducts}/{firstDoneTag.totalProducts}{' '}
								comptés
							</span>
						)}
				</div>
			)
		}

		return null
	}

	const canConfirm =
		operator.trim().length > 0 && selectedCategoryIds.length > 0

	const handleConfirm = () => {
		if (!canConfirm) return
		onConfirm(operator.trim(), 'selection', selectedCategoryIds)
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className='max-w-lg max-h-[85vh] flex flex-col'>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<ClipboardList className='h-5 w-5 text-orange-500' />
						Nouvel inventaire
					</DialogTitle>
				</DialogHeader>

				<div className='flex-1 overflow-y-auto space-y-5 py-2'>
					{/* Opérateur */}
					<div className='space-y-1.5'>
						<Label>Opérateur</Label>
						<Input
							placeholder='Votre nom...'
							value={operator}
							onChange={(e) => setOperator(e.target.value)}
							autoFocus
						/>
					</div>

					<CreateSessionStockStats
						totalProducts={globalProductTotal}
						countedProducts={globalCountedProductTotal}
						isLoading={catalogLoading}
					/>

					<Separator />

					{/* Sélection catégories */}
					<div className='space-y-2'>
						<div className='flex items-center justify-between'>
							<Label>Catégories à inventorier</Label>
							{selectedCategoryIds.length > 0 && (
								<span className='text-xs text-orange-500 font-medium'>
									{selectedCategoryIds.length} sélectionnée
									{selectedCategoryIds.length > 1 ? 's' : ''}
								</span>
							)}
						</div>

						<div className='relative'>
							<Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none' />
							<Input
								placeholder='Rechercher une catégorie...'
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className='pl-8 h-8 text-sm'
							/>
						</div>

						<div className='border rounded-lg overflow-y-auto max-h-72'>
							{categories.length === 0 && (
								<div className='px-3 py-4 text-sm text-muted-foreground text-center'>
									<Loader2 className='h-4 w-4 animate-spin mx-auto mb-1' />
									Chargement des catégories...
								</div>
							)}
							{filteredGrouped.length === 0 && categories.length > 0 && (
								<div className='px-3 py-4 text-sm text-muted-foreground text-center'>
									Aucune catégorie trouvée
								</div>
							)}

							{filteredGrouped.map((group, gi) => {
								const childIds = group.children.map((c) => c.id)
								const allSelected = childIds.every((id) =>
									selectedCategoryIds.includes(id),
								)
								const someSelected = childIds.some((id) =>
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
											// ── Groupe avec enfants ──────────────────────────────
											<div className='flex items-center border-b bg-muted/60 hover:bg-muted transition-colors'>
												<button
													type='button'
													onClick={() =>
														group.parent && toggleExpand(group.parent.id)
													}
													className='flex items-center gap-2 flex-1 px-3 py-2 text-left min-w-0'
												>
													<ChevronDown
														className={cn(
															'h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 shrink-0',
															!expanded && '-rotate-90',
														)}
													/>
													<span className='text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate'>
														{group.parent.name}
													</span>
													{/* Nombre total produits du groupe */}
													{(() => {
														const counts = countMap.get(group.parent.id)
														const total = counts?.totalProductCount ?? 0
														return total > 0 ? (
															<span className='text-xs text-muted-foreground font-normal normal-case shrink-0'>
																({total} réf.)
															</span>
														) : null
													})()}
													{/* Sélection partielle */}
													{someSelected && (
														<span className='text-xs text-orange-500 font-medium ml-auto shrink-0'>
															{groupStats.selectedCount}/{childIds.length}
														</span>
													)}
												</button>

												{/* Tag résumé + bouton Tout */}
												<div className='flex items-center gap-2 pr-2 shrink-0'>
													{!someSelected &&
														renderGroupTag(childIds, groupStats)}
													<button
														type='button'
														onClick={() => toggleGroup(childIds)}
														className={cn(
															'text-xs px-2 py-1 rounded font-medium transition-colors hover:bg-background shrink-0',
															allSelected
																? 'text-orange-500'
																: 'text-muted-foreground',
														)}
													>
														{allSelected ? 'Tout ôter' : 'Tout'}
													</button>
												</div>
											</div>
										) : (
											// ── Catégorie racine sans enfants ────────────────────
											<label className='flex items-center border-b bg-muted/60 hover:bg-muted transition-colors cursor-pointer'>
												<div className='flex items-center gap-2 flex-1 px-3 py-2 min-w-0'>
													<input
														type='checkbox'
														checked={selectedCategoryIds.includes(
															group.children[0].id,
														)}
														onChange={() =>
															toggleCategory(group.children[0].id)
														}
														className='rounded accent-orange-500 shrink-0'
													/>
													<span className='text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate'>
														{group.children[0].name}
													</span>
													{(() => {
														const counts = countMap.get(group.children[0].id)
														const total = counts?.productCount ?? 0
														return total > 0 ? (
															<span className='text-xs text-muted-foreground font-normal normal-case shrink-0'>
																({total} réf.)
															</span>
														) : null
													})()}
												</div>
												<div className='pr-3 shrink-0'>
													{renderTag(categoryTags.get(group.children[0].id))}
												</div>
											</label>
										)}

										{/* Sous-catégories — visibles si groupe expandé */}
										{group.parent &&
											expanded &&
											group.children.map((cat, ci) => {
												const tag = categoryTags.get(cat.id)
												const counts = countMap.get(cat.id)
												const productCount = counts?.productCount ?? 0
												const isChecked = selectedCategoryIds.includes(cat.id)

												return (
													<label
														key={cat.id}
														className={cn(
															'flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors pl-6',
															ci < group.children.length - 1 ? 'border-b' : '',
															isChecked &&
																'bg-orange-50/50 dark:bg-orange-900/5',
														)}
													>
														<input
															type='checkbox'
															checked={isChecked}
															onChange={() => toggleCategory(cat.id)}
															className='rounded accent-orange-500 shrink-0'
														/>
														<span className='text-sm flex-1 min-w-0 truncate'>
															{cat.name}
														</span>
														{/* Nb références */}
														{productCount > 0 && (
															<span className='text-xs text-muted-foreground shrink-0'>
																{productCount} réf.
															</span>
														)}
														{/* Tag historique / en cours */}
														<div className='shrink-0'>{renderTag(tag)}</div>
													</label>
												)
											})}
									</div>
								)
							})}
						</div>

						{/* Légende */}
						{categoryTags.size > 0 && (
							<div className='flex items-center gap-4 text-xs text-muted-foreground'>
								<div className='flex items-center gap-1.5'>
									<span className='w-2 h-2 rounded-full bg-blue-400 shrink-0' />
									En cours dans une autre session
								</div>
								<div className='flex items-center gap-1.5'>
									<span className='w-2 h-2 rounded-full bg-green-400 shrink-0' />
									Déjà inventorié
								</div>
							</div>
						)}
					</div>
				</div>

				<DialogFooter className='pt-2'>
					<Button variant='ghost' onClick={onClose} disabled={isLoading}>
						Annuler
					</Button>
					<Button
						onClick={handleConfirm}
						disabled={!canConfirm || isLoading}
						className='bg-orange-500 hover:bg-orange-600 text-white gap-2'
					>
						{isLoading && <Loader2 className='h-4 w-4 animate-spin' />}
						Démarrer le comptage
						{selectedProductTotal > 0 && (
							<span className='ml-1 opacity-80'>({selectedProductTotal})</span>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ============================================================================
// SOUS-VUES — inchangées (SessionOverviewView, CategoryCountingView, etc.)
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

	// ── Blocs "que reste-t-il" ────────────────────────────────────────────────
	const todo = categoriesWithValidation.filter((c) => c.status === 'todo')
	const inProgress = categoriesWithValidation.filter(
		(c) => c.status === 'in_progress',
	)
	const done = categoriesWithValidation.filter(
		(c) => c.status === 'counted' || c.status === 'validated',
	)

	return (
		<div className='flex flex-col h-full'>
			{/* ── Header ──────────────────────────────────────────────────────── */}
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

					<div className='mt-4'>
						<InventoryCapitalStats
							totalProducts={summary.totalProducts}
							countedProducts={summary.countedProducts}
						/>
					</div>

					{inProgress.length > 0 && (
						<div className='mt-4 rounded-2xl border border-blue-200 bg-blue-50/60 px-3 py-3 dark:border-blue-800 dark:bg-blue-900/10'>
							<div className='mb-3 flex items-center justify-between gap-3'>
								<div>
									<p className='text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300'>
										Continuer la session
									</p>
									<p className='text-sm text-blue-700/80 dark:text-blue-300/80'>
										Reprenez d'abord les rayons déjà commencés.
									</p>
								</div>
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

			{/* ── Liste catégories ──────────────────────────────────────────── */}
			<div className='flex-1 overflow-y-auto divide-y'>
				{/* Pas encore commencées — en premier si todo > 0 */}
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

				{/* En cours */}
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

				{/* Terminées */}
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

// Composant ligne catégorie extrait pour éviter la répétition
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
	onSave,
	onReset,
}: {
	entry: InventoryEntry
	isValidated: boolean
	isCountingProduct: boolean
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
		if (entry.status === 'counted' && entry.stock_compte !== null) {
			setLocalValue(String(entry.stock_compte))
		}
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
		if (!entriesLoading) {
			setTimeout(() => searchRef.current?.focus(), 100)
		}
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

	if (entriesLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
			</div>
		)
	}

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
						{countedEntries.length}/{catEntries.length} comptés
						{' · '}
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
}: {
	sessionId: string
	sessionDate: string
	onBack: () => void
}) {
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
																{/* ✅ Date de comptage */}
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

	if (selectedSession) {
		return (
			<SessionDetailView
				sessionId={selectedSession.id}
				sessionDate={selectedSession.date}
				onBack={() => setSelectedSession(null)}
			/>
		)
	}

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
													{
														day: '2-digit',
														month: 'long',
														year: 'numeric',
													},
												)}
											</span>
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
												{session.scope === 'all'
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

			{/* --- NOUVEAU : Contrôles de pagination --- */}
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
	if (sessionsLoading) {
		return (
			<div className='flex items-center justify-center h-full min-h-[400px]'>
				<Loader2 className='h-6 w-6 animate-spin text-orange-500' />
			</div>
		)
	}

	return (
		<div className='flex flex-col h-full overflow-y-auto'>
			{activeSessions.length > 0 && (
				<div className='px-6 pt-6 pb-4'>
					<div className='mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
						<div>
							<h2 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider'>
								Reprendre une session ({activeSessions.length})
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

					<div className='mb-4'>
						<ActiveSessionsCapitalStats sessions={activeSessions} />
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
			)}

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
}: {
	session: InventorySession
	onSelect: () => void
}) {
	const { data: progress } = useSessionProgress(session.id)
	const { entries } = useInventorySession(session.id)
	const lastCountedAt = useMemo(() => getLastCountedAt(entries), [entries])

	const total = progress?.total ?? 0
	const counted = progress?.counted ?? 0
	const pending = Math.max(total - counted, 0)
	const percent = total > 0 ? Math.round((counted / total) * 100) : 0
	const categoryNames = progress?.categoryNames ?? []
	const primaryCategory = getPrimaryCategoryLabel(categoryNames)

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

					<div className='mt-3 flex items-center justify-between gap-3'>
						<div className='min-w-0 flex-1'>
							{categoryNames.length > 1 && (
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
							)}
						</div>

						<div className='inline-flex items-center gap-2 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white'>
							Continuer
							<ChevronRight className='h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5' />
						</div>
					</div>
				</div>
			</div>
		</button>
	)
}

// ============================================================================
// PAGE PRINCIPALE — wrappée dans ModulePageShell
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

	const [showAppPosAuth, setShowAppPosAuth] = useState(() => !getAppPosToken())
	const [appPosPassword, setAppPosPassword] = useState('')
	const [appPosAuthError, setAppPosAuthError] = useState<string | null>(null)
	const [appPosAuthLoading, setAppPosAuthLoading] = useState(false)

	const handleAppPosLogin = async () => {
		setAppPosAuthLoading(true)
		setAppPosAuthError(null)
		try {
			const res = await loginToAppPos('admin', appPosPassword)
			if (res.success && res.token) {
				setShowAppPosAuth(false)
				setAppPosPassword('')
			} else {
				setAppPosAuthError('Mot de passe incorrect')
			}
		} catch {
			setAppPosAuthError('Mot de passe incorrect')
		} finally {
			setAppPosAuthLoading(false)
		}
	}

	// ⚠️ Tous les hooks avant les returns conditionnels
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

	// ── Contenu selon l'état d'auth AppPOS ───────────────────────────────────
	const authContent = showAppPosAuth ? (
		<div className='flex items-center justify-center h-full min-h-[400px]'>
			<div className='w-full max-w-sm border rounded-xl p-6 bg-card shadow-md'>
				<div className='flex items-center gap-3 mb-6'>
					<div className='w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center'>
						<ClipboardList className='h-5 w-5 text-orange-500' />
					</div>
					<div>
						<h2 className='text-base font-medium'>Accès inventaire</h2>
						<p className='text-xs text-muted-foreground'>
							Code administrateur requis
						</p>
					</div>
				</div>
				<div className='space-y-4'>
					<div className='space-y-2'>
						<Label htmlFor='apppos-password'>Mot de passe AppPOS</Label>
						<Input
							id='apppos-password'
							type='password'
							placeholder='••••••••'
							value={appPosPassword}
							onChange={(e) => setAppPosPassword(e.target.value)}
							onKeyDown={(e) => e.key === 'Enter' && handleAppPosLogin()}
							autoFocus
						/>
					</div>
					{appPosAuthError && (
						<p className='text-sm text-destructive'>{appPosAuthError}</p>
					)}
					<Button
						className='w-full'
						onClick={handleAppPosLogin}
						disabled={appPosAuthLoading || !appPosPassword}
					>
						{appPosAuthLoading ? (
							<>
								<Loader2 className='h-4 w-4 animate-spin mr-2' />
								Connexion...
							</>
						) : (
							'Déverrouiller'
						)}
					</Button>
				</div>
			</div>
		</div>
	) : null

	// ── Handlers ─────────────────────────────────────────────────────────────
	const handleSelectSession = (session: InventorySession) => {
		setSelectedSessionId(session.id)
		setView('overview')
	}

	const handleCreateConfirm = async (
		operator: string,
		scope: 'selection',
		categoryIds: string[],
	) => {
		const result = await createSession.mutateAsync({
			operator,
			scope,
			scope_category_ids: categoryIds,
		})
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

	// Badge sessions actives pour le shell
	const sessionsBadge =
		activeSessions.length > 0 ? (
			<StatusBadge label={`${activeSessions.length} en cours`} variant='info' />
		) : undefined

	return (
		<ModulePageShell
			manifest={inventoryManifest as any}
			badge={sessionsBadge}
			actions={
				!showAppPosAuth ? (
					<Button
						variant='outline'
						size='sm'
						className='gap-1.5'
						onClick={() => setView('history')}
					>
						<History className='h-3.5 w-3.5' />
						Historique
					</Button>
				) : undefined
			}
		>
			{/* Auth AppPOS */}
			{authContent}

			{/* Contenu principal */}
			{!showAppPosAuth && (
				<div className='flex flex-col h-full -m-6 overflow-hidden'>
					{/* Écran progression création */}
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
						(entriesLoading || !summary ? (
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
			)}
		</ModulePageShell>
	)
}
