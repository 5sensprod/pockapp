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
import { useAppPosCategories } from '@/lib/apppos'
import { getAppPosToken, loginToAppPos } from '@/lib/apppos'
import type {
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

	const { data: categories = [] } = useAppPosCategories()
	const { data: history } = useInventoryHistory()

	useEffect(() => {
		if (open) {
			setOperator(defaultOperator)
			setSelectedCategoryIds([])
			setSearch('')
			setExpandedGroups(new Set())
		}
	}, [open, defaultOperator])

	const categoryTags = useMemo(() => {
		const tags = new Map<
			string,
			| { type: 'active'; sessionOperator: string }
			| { type: 'done'; date: string; operator: string }
		>()
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
					})
				}
			}
		}
		return tags
	}, [activeSessions, history])

	const grouped = useMemo(() => {
		const byId = new Map(categories.map((c) => [c.id, c]))
		const roots = categories.filter((c) => !(c as any).parent)
		const groups: Array<{
			parent: (typeof categories)[0] | null
			children: typeof categories
		}> = []
		for (const root of roots) {
			const children = categories.filter((c) => (c as any).parent === root.id)
			if (children.length > 0) {
				groups.push({ parent: root, children })
			} else {
				groups.push({ parent: null, children: [root] })
			}
		}
		const orphans = categories.filter(
			(c) => (c as any).parent && !byId.has((c as any).parent),
		)
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
					<div className='space-y-1.5'>
						<Label>Opérateur</Label>
						<Input
							placeholder='Votre nom...'
							value={operator}
							onChange={(e) => setOperator(e.target.value)}
							autoFocus
						/>
					</div>

					<Separator />

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

						<div className='border rounded-lg overflow-y-auto max-h-64'>
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

								return (
									<div key={groupKey}>
										{group.parent && (
											<div className='flex items-center border-b bg-muted/60 hover:bg-muted transition-colors'>
												<button
													type='button'
													onClick={() =>
														group.parent && toggleExpand(group.parent.id)
													}
													className='flex items-center gap-2 flex-1 px-3 py-2 text-left'
												>
													<ChevronDown
														className={cn(
															'h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 shrink-0',
															!expanded && '-rotate-90',
														)}
													/>
													<span className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
														{group.parent.name}
													</span>
													{someSelected && (
														<span className='text-xs text-orange-500 font-medium ml-1'>
															(
															{
																childIds.filter((id) =>
																	selectedCategoryIds.includes(id),
																).length
															}
															/{childIds.length})
														</span>
													)}
												</button>
												<button
													type='button'
													onClick={() => toggleGroup(childIds)}
													className={cn(
														'text-xs px-2 py-1 mr-2 rounded font-medium transition-colors hover:bg-background',
														allSelected
															? 'text-orange-500'
															: 'text-muted-foreground',
													)}
												>
													{allSelected ? 'Tout ôter' : 'Tout'}
												</button>
											</div>
										)}

										{expanded &&
											group.children.map((cat, ci) => {
												const tag = categoryTags.get(cat.id)
												return (
													<label
														key={cat.id}
														className={cn(
															'flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors',
															group.parent ? 'pl-6' : '',
															ci < group.children.length - 1 ? 'border-b' : '',
														)}
													>
														<input
															type='checkbox'
															checked={selectedCategoryIds.includes(cat.id)}
															onChange={() => toggleCategory(cat.id)}
															className='rounded accent-orange-500 shrink-0'
														/>
														<span className='text-sm flex-1'>{cat.name}</span>
														{tag?.type === 'active' && (
															<span className='text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shrink-0 whitespace-nowrap'>
																En cours
															</span>
														)}
														{tag?.type === 'done' && (
															<span
																className='text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 whitespace-nowrap'
																title={`Par ${tag.operator}`}
															>
																{tag.date}
															</span>
														)}
													</label>
												)
											})}
									</div>
								)
							})}
						</div>
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
	onSelectCategory,
	onComplete,
	onCancel,
	isCompleting,
	isCancelling,
}: {
	session: InventorySession
	summary: NonNullable<ReturnType<typeof useInventorySession>['summary']>
	onSelectCategory: (categoryId: string) => void
	onComplete: () => void
	onCancel: () => void
	isCompleting: boolean
	isCancelling: boolean
}) {
	const isValidated = (catId: string) =>
		session.validated_category_ids?.includes(catId) ?? false

	const categoriesWithValidation = summary.categories.map((c) => ({
		...c,
		status: isValidated(c.categoryId) ? ('validated' as const) : c.status,
	}))

	return (
		<div className='flex flex-col h-full'>
			<div className='px-6 py-4 border-b'>
				<div className='flex items-center justify-between'>
					<div>
						<div className='flex items-center gap-2 mb-0.5'>
							<h2 className='text-lg font-semibold'>
								Inventaire du{' '}
								{new Date(session.started_at).toLocaleDateString('fr-FR', {
									day: '2-digit',
									month: '2-digit',
									year: 'numeric',
								})}
							</h2>
							<Badge
								variant='outline'
								className='text-orange-600 border-orange-300 text-xs'
							>
								En cours
							</Badge>
						</div>
						<p className='text-sm text-muted-foreground'>
							Opérateur : {session.operator}
						</p>
					</div>
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
							Clôturer l'inventaire
						</Button>
					</div>
				</div>

				<div className='mt-4'>
					<div className='flex justify-between text-xs text-muted-foreground mb-1.5'>
						<span>
							{summary.countedProducts} / {summary.totalProducts} produits
							comptés
						</span>
						<span className='font-medium text-foreground'>
							{summary.progressPercent}%
						</span>
					</div>
					<Progress value={summary.progressPercent} className='h-2' />
				</div>

				<div className='flex gap-4 mt-3 text-sm'>
					<div className='flex items-center gap-1.5 text-muted-foreground'>
						<CheckCircle2 className='h-3.5 w-3.5 text-green-500' />
						{summary.validatedCategories} validée
						{summary.validatedCategories > 1 ? 's' : ''}
					</div>
					<div className='flex items-center gap-1.5 text-muted-foreground'>
						<AlertTriangle className='h-3.5 w-3.5 text-amber-500' />
						{summary.totalGaps.length} écart
						{summary.totalGaps.length > 1 ? 's' : ''} détecté
						{summary.totalGaps.length > 1 ? 's' : ''}
					</div>
					<div className='flex items-center gap-1.5 text-muted-foreground'>
						<Clock className='h-3.5 w-3.5' />
						{summary.pendingProducts} restant
						{summary.pendingProducts > 1 ? 's' : ''}
					</div>
				</div>
			</div>

			<div className='flex-1 overflow-y-auto divide-y'>
				{categoriesWithValidation.map((cat) => {
					const validated = cat.status === 'validated'
					return (
						<button
							key={cat.categoryId}
							type='button'
							disabled={validated}
							onClick={() => !validated && onSelectCategory(cat.categoryId)}
							className={cn(
								'w-full flex items-center gap-4 px-6 py-4 text-left transition-colors',
								validated
									? 'opacity-60 cursor-default'
									: 'hover:bg-muted/50 cursor-pointer',
							)}
						>
							<CategoryStatusIcon status={cat.status} />
							<div className='flex-1 min-w-0'>
								<div className='flex items-center gap-2 mb-0.5'>
									<span className='font-medium text-sm'>
										{cat.categoryName}
									</span>
									{cat.totalGapCount > 0 && (
										<span className='flex items-center gap-0.5 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full'>
											<AlertTriangle className='h-3 w-3' />
											{cat.totalGapCount} écart
											{cat.totalGapCount > 1 ? 's' : ''}
										</span>
									)}
								</div>
								<div className='text-xs text-muted-foreground'>
									{cat.countedProducts}/{cat.totalProducts} produits
								</div>
							</div>
							<div className='flex items-center gap-3'>
								<div className='w-24 hidden sm:block'>
									<Progress
										value={
											cat.totalProducts > 0
												? (cat.countedProducts / cat.totalProducts) * 100
												: 0
										}
										className='h-1.5'
									/>
								</div>
								<CategoryStatusBadge status={cat.status} />
								{!validated && (
									<ChevronRight className='h-4 w-4 text-muted-foreground' />
								)}
							</div>
						</button>
					)
				})}
			</div>
		</div>
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

	const isAdjusted = entry.adjusted

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
			<td className='px-6 py-3'>
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
					<div className='min-w-0'>
						<div className='font-medium truncate max-w-xs'>
							{entry.product_name}
						</div>
						{entry.product_sku && (
							<div className='text-xs text-muted-foreground'>
								{entry.product_sku}
							</div>
						)}
						{entry.product_barcode && (
							<div className='text-xs text-muted-foreground font-mono tracking-wider'>
								{entry.product_barcode}
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
							isCounted
								? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
								: '',
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
															'flex items-center gap-3 px-6 py-2.5 border-b border-border/50 last:border-0',
															hasGap && 'bg-orange-500/5',
														)}
													>
														{entry.product_image ? (
															<img
																src={entry.product_image}
																alt={entry.product_name}
																className='w-8 h-8 rounded object-cover shrink-0 border bg-muted'
															/>
														) : (
															<div className='w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0'>
																<ClipboardList className='h-3.5 w-3.5 text-muted-foreground/50' />
															</div>
														)}
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
	const { data, isLoading } = useInventoryHistory()
	const sessions = data?.items ?? []
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
												{session.status === 'completed' ? 'Complété' : 'Annulé'}
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
					<h2 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>
						Sessions en cours ({activeSessions.length})
					</h2>
					<div className='flex flex-col gap-3'>
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
	const date = new Date(session.started_at).toLocaleDateString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
	const total = progress?.total ?? 0
	const counted = progress?.counted ?? 0
	const percent = total > 0 ? Math.round((counted / total) * 100) : 0
	const categoryNames = progress?.categoryNames ?? []

	return (
		<button
			type='button'
			onClick={onSelect}
			className='flex items-start gap-4 p-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-orange-300 transition-all text-left group w-full'
		>
			<div className='w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0 mt-0.5'>
				<ClipboardList className='h-5 w-5 text-orange-500' />
			</div>

			<div className='flex-1 min-w-0'>
				<div className='flex items-center gap-2 mb-1'>
					<span className='font-semibold text-sm'>Inventaire du {date}</span>
					<span
						className={cn(
							'text-xs font-medium px-2 py-0.5 rounded-full',
							session.status === 'in_progress'
								? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
								: 'bg-muted/50 text-muted-foreground',
						)}
					>
						{session.status === 'in_progress' ? 'En cours' : 'Brouillon'}
					</span>
				</div>

				<div className='text-xs text-muted-foreground mb-2'>
					Opérateur : {session.operator}
				</div>

				{categoryNames.length > 0 && (
					<div className='flex flex-wrap gap-1 mb-2'>
						{categoryNames.slice(0, 4).map((name) => (
							<span
								key={name}
								className='text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground'
							>
								{name}
							</span>
						))}
						{categoryNames.length > 4 && (
							<span className='text-xs text-muted-foreground px-1 self-center'>
								+{categoryNames.length - 4}
							</span>
						)}
					</div>
				)}

				{total > 0 && (
					<div className='space-y-1'>
						<div className='flex items-center justify-between'>
							<span className='text-xs text-muted-foreground'>
								{counted} / {total} produits comptés
							</span>
							<span className='text-xs font-semibold text-orange-500'>
								{percent}%
							</span>
						</div>
						<div className='h-1.5 bg-muted rounded-full overflow-hidden'>
							<div
								className='h-full bg-orange-500 rounded-full transition-all duration-500'
								style={{ width: `${percent}%` }}
							/>
						</div>
					</div>
				)}
			</div>

			<ChevronRight className='h-4 w-4 text-muted-foreground shrink-0 group-hover:text-orange-500 transition-colors mt-1' />
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
		entriesLoading,
		completeSession,
		cancelSession,
		isCompletingSession,
		isCancellingSession,
	} = useInventorySession(selectedSessionId ?? undefined)

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
								onSelectCategory={(catId) => {
									const cat = summary.categories.find(
										(c) => c.categoryId === catId,
									)
									handleSelectCategory(catId, cat?.categoryName ?? '')
								}}
								onComplete={handleCompleteSession}
								onCancel={handleCancelSession}
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
