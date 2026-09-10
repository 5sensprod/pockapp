import {
	CATEGORY_SELECTED_CLASS,
	CategoryTreeRow,
} from '@/components/catalog/CategoryTreeRow'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type {
	CatalogBrandShape,
	CatalogCategoryShape,
	CatalogSupplierShape,
} from '@/lib/queries/catalog-shapes'
import { useUpdateCategory } from '@/lib/queries/categories'
import { hasUsableCategoryCounts } from '@/lib/queries/category-counts'
import type { CategoryNode } from '@/lib/queries/category-tree'
import {
	normalizeCategorySearch,
	parentMap,
	parentsWithVisibleChildren,
	searchCategoryIds,
	toCategoryOptions,
	visibleCategoryOptions,
} from '@/lib/queries/category-tree'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import { type CatalogCounts, countsOfCategory } from '@/lib/queries/products'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import {
	Building2,
	ChevronDown,
	ChevronRight,
	FolderTree,
	Loader2,
	Search,
	Settings2,
	Star,
	Truck,
	X,
} from 'lucide-react'
import {
	type DragEvent as ReactDragEvent,
	type MouseEvent as ReactMouseEvent,
	useEffect,
	useMemo,
	useState,
} from 'react'
import { toast } from 'sonner'

import { BrandDialog } from './BrandDialog'
import { BrandLogo } from './BrandLogo'
import { CategoryDialog } from './CategoryDialog'
import { SupplierDialog } from './SupplierDialog'
import { PRODUCT_BATCH_DRAG_TYPE } from './product-batch-drag'

type ExplorerView = 'category' | 'brand' | 'supplier'

const SELECTED_ITEM_CLASS = CATEGORY_SELECTED_CLASS

// Le fournisseur est reçu ENTIER, et non réduit à `{ id, name, brands }` :
// l'engrenage de la ligne ouvre `SupplierDialog`, qui préremplit sa fiche
// depuis l'enregistrement lui-même.
type SupplierOption = CatalogSupplierShape

/** Élément dont l'engrenage a ouvert une modale d'édition. */
type EditingTarget = { kind: ExplorerView; id: string }

const GEAR_BUTTON_CLASS =
	'mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100'

interface ProductCategoryFilterTreeProps {
	categories: CatalogCategoryShape[]
	brands: CatalogBrandShape[]
	suppliers: SupplierOption[]
	counts?: CatalogCounts
	categoryValue: string
	brandValue: string
	supplierValue: string
	noneValue: string
	onCategoryChange: (value: string) => void
	onBrandChange: (value: string) => void
	onSupplierChange: (value: string) => void
	selectedProductCount?: number
	onProductsDropOnCategory?: (category: CategoryNode) => void
	loading?: Partial<Record<ExplorerView, boolean>>
}

const normalizeSearch = normalizeCategorySearch

/**
 * Arbre de navigation du catalogue. Il ne possède aucun état de filtre : la
 * sélection reçue est exactement le `categoryId` envoyé par ProductsPage à la
 * requête serveur. Un parent sélectionné représente toute sa branche.
 */
export function ProductCategoryFilterTree({
	categories,
	brands,
	suppliers,
	counts,
	categoryValue,
	brandValue,
	supplierValue,
	noneValue,
	onCategoryChange,
	onBrandChange,
	onSupplierChange,
	selectedProductCount = 0,
	onProductsDropOnCategory,
	loading = {},
}: ProductCategoryFilterTreeProps) {
	const pb = usePocketBase()
	const updateCategory = useUpdateCategory()
	const [view, setView] = useState<ExplorerView>('category')
	const [search, setSearch] = useState('')
	const [featuredOnly, setFeaturedOnly] = useState(false)
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
	const [expandedSupplierIds, setExpandedSupplierIds] = useState<Set<string>>(
		() => new Set(),
	)
	const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(
		null,
	)
	// L'engrenage n'ouvre qu'une modale à la fois, quel que soit l'onglet.
	const [editing, setEditing] = useState<EditingTarget | null>(null)

	const parentById = useMemo(() => parentMap(categories), [categories])
	const categoryById = useMemo(
		() => new Map(categories.map((category) => [category.id, category])),
		[categories],
	)
	const featuredCategoryIds = useMemo(
		() =>
			new Set(
				categories
					.filter((category) => category.is_featured)
					.map((category) => category.id),
			),
		[categories],
	)
	const featuredVisibleIds = useMemo(() => {
		const included = new Set<string>()
		const includeWithParents = (categoryId: string) => {
			const visited = new Set<string>()
			let current = categoryId
			while (current && !visited.has(current)) {
				visited.add(current)
				included.add(current)
				current = parentById.get(current) || ''
			}
		}

		for (const id of featuredCategoryIds) includeWithParents(id)
		// Un filtre produit déjà actif ne doit pas devenir invisible lorsque le
		// bouton « mises en avant » est activé.
		if (categoryValue && categoryValue !== noneValue)
			includeWithParents(categoryValue)
		return included
	}, [categoryValue, featuredCategoryIds, noneValue, parentById])
	const categoryCountsAreUsable = hasUsableCategoryCounts(counts)

	// `total` est déjà remonté par le serveur. Les branches sans produit peuvent
	// disparaître sans calculer ni parcourir les produits dans le navigateur. Si
	// une ancienne réponse en cache n'a aucune ventilation par catégorie alors
	// que le catalogue est non vide, elle ne doit surtout pas vider l'arbre.
	const options = useMemo(() => {
		const treeOrder = toCategoryOptions(categories)
		// Pendant un déplacement, même une catégorie vide doit devenir une cible.
		const populated =
			!categoryCountsAreUsable || selectedProductCount > 0
				? treeOrder
				: treeOrder.filter(
						(category) => countsOfCategory(counts, category.id).total > 0,
					)
		// Le glisser-déposer reste possible vers toutes les catégories, même si le
		// filtre visuel était actif avant de commencer la sélection.
		if (!featuredOnly || selectedProductCount > 0) return populated
		return populated.filter((category) => featuredVisibleIds.has(category.id))
	}, [
		categories,
		categoryCountsAreUsable,
		counts,
		featuredOnly,
		featuredVisibleIds,
		selectedProductCount,
	])
	const parentsWithChildren = useMemo(
		() => parentsWithVisibleChildren(categories, options),
		[categories, options],
	)

	// Une sélection restaurée doit être visible immédiatement, même si ses
	// parents étaient repliés avant le démontage de la page.
	useEffect(() => {
		if (!categoryValue || categoryValue === noneValue) return
		setExpandedIds((current) => {
			const next = new Set(current)
			const visited = new Set<string>()
			let parent = parentById.get(categoryValue) || ''
			while (parent && !visited.has(parent)) {
				visited.add(parent)
				next.add(parent)
				parent = parentById.get(parent) || ''
			}
			return next
		})
	}, [categoryValue, noneValue, parentById])

	// Afficher directement les catégories mises en avant plutôt que seulement
	// leurs racines : toutes les branches nécessaires sont dépliées au toggle.
	useEffect(() => {
		if (!featuredOnly) return
		setExpandedIds((current) => {
			const next = new Set(current)
			for (const categoryId of featuredCategoryIds) {
				const visited = new Set<string>()
				let parent = parentById.get(categoryId) || ''
				while (parent && !visited.has(parent)) {
					visited.add(parent)
					next.add(parent)
					parent = parentById.get(parent) || ''
				}
			}
			return next
		})
	}, [featuredCategoryIds, featuredOnly, parentById])

	const normalizedSearch = normalizeSearch(search.trim())
	const searchedIds = useMemo(
		() => (view === 'category' ? searchCategoryIds(categories, search) : null),
		[categories, search, view],
	)

	const visibleOptions = useMemo(
		() => visibleCategoryOptions(options, parentById, expandedIds, searchedIds),
		[expandedIds, options, parentById, searchedIds],
	)
	const filteredBrands = useMemo(
		() =>
			brands.filter((brand) =>
				normalizeSearch(brand.name).includes(normalizedSearch),
			),
		[brands, normalizedSearch],
	)
	const brandById = useMemo(
		() => new Map(brands.map((brand) => [brand.id, brand])),
		[brands],
	)
	const supplierById = useMemo(
		() => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
		[suppliers],
	)
	const filteredSuppliers = useMemo(
		() =>
			suppliers.filter((supplier) =>
				normalizeSearch(supplier.name).includes(normalizedSearch),
			),
		[suppliers, normalizedSearch],
	)
	const supplierNamesByBrand = useMemo(() => {
		const namesByBrand = new Map<string, string[]>()
		for (const supplier of suppliers) {
			for (const brandId of supplier.brands ?? []) {
				const names = namesByBrand.get(brandId) ?? []
				names.push(supplier.name)
				namesByBrand.set(brandId, names)
			}
		}
		return namesByBrand
	}, [suppliers])
	// Les marques d'un fournisseur sont rendues en pastilles, avec leur logo :
	// ce sont donc les ENREGISTREMENTS qu'il faut ici, plus seulement les noms.
	// Une marque citée par un fournisseur mais absente du catalogue est écartée
	// — `brandById` ne la connaît pas, et une pastille vide n'apprendrait rien.
	const brandsBySupplier = useMemo(
		() =>
			new Map(
				suppliers.map((supplier) => [
					supplier.id,
					(supplier.brands ?? [])
						.map((brandId) => brandById.get(brandId))
						.filter((brand): brand is CatalogBrandShape => Boolean(brand)),
				]),
			),
		[suppliers, brandById],
	)

	const viewOptions = {
		category: {
			label: 'Catégories',
			search: 'Chercher une catégorie…',
			all: 'Toutes les catégories',
			none: 'Sans catégorie',
			count: featuredOnly
				? options.filter((option) => featuredCategoryIds.has(option.id)).length
				: options.length,
			value: categoryValue,
			onChange: onCategoryChange,
			Icon: FolderTree,
		},
		brand: {
			label: 'Marques',
			search: 'Chercher une marque…',
			all: 'Toutes les marques',
			none: 'Sans marque',
			count: brands.length,
			value: brandValue,
			onChange: onBrandChange,
			Icon: Building2,
		},
		supplier: {
			label: 'Fournisseurs',
			search: 'Chercher un fournisseur…',
			all: 'Tous les fournisseurs',
			none: 'Sans fournisseur',
			count: suppliers.length,
			value: supplierValue,
			onChange: onSupplierChange,
			Icon: Truck,
		},
	} as const
	const currentView = viewOptions[view]
	const CurrentViewIcon = currentView.Icon
	const flatOptions = view === 'brand' ? filteredBrands : filteredSuppliers
	const explorerTabs = [
		{ id: 'category', label: 'Catégories', Icon: FolderTree },
		{ id: 'brand', label: 'Marques', Icon: Building2 },
		{ id: 'supplier', label: 'Fournisseurs', Icon: Truck },
	] as const

	const toggleCategory = (id: string) => {
		setExpandedIds((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}
	const toggleSupplier = (id: string) => {
		setExpandedSupplierIds((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}
	const toggleCategoryFeatured = async (categoryId: string) => {
		const category = categoryById.get(categoryId)
		if (!category) return

		try {
			await updateCategory.mutateAsync({
				id: category.id,
				data: { is_featured: !category.is_featured },
			})
		} catch (error) {
			toast.error(`Mise en avant refusée : ${pocketbaseErrorMessage(error)}`)
		}
	}
	// Ouvrir l'édition ne doit RIEN faire d'autre : ni sélectionner la ligne, ni
	// changer le filtre, ni amorcer un glisser-déposer depuis la ligne parente.
	const openEditor = (
		event: ReactMouseEvent,
		kind: ExplorerView,
		id: string,
	) => {
		event.stopPropagation()
		event.preventDefault()
		setEditing({ kind, id })
	}
	const closeEditor = (open: boolean) => {
		if (!open) setEditing(null)
	}
	const editingCategory =
		editing?.kind === 'category' ? (categoryById.get(editing.id) ?? null) : null
	const editingBrand =
		editing?.kind === 'brand' ? (brandById.get(editing.id) ?? null) : null
	const editingSupplier =
		editing?.kind === 'supplier' ? (supplierById.get(editing.id) ?? null) : null

	const acceptsProductBatch = (event: ReactDragEvent) =>
		selectedProductCount > 0 &&
		Array.from(event.dataTransfer.types).includes(PRODUCT_BATCH_DRAG_TYPE)

	return (
		// L'arbre remplit la colonne et ne défile QUE dans sa liste (5 septembre
		// 2026). Il était collant sous un décalage écrit en dur — `header + 5.5rem`
		// —, qui ne correspondait plus à la hauteur réelle de la barre dès qu'un
		// filtre passait à la ligne, et sa liste était bornée par un second calcul
		// de la même famille. La colonne étant désormais à hauteur fixe, il n'y a
		// plus rien à deviner : l'en-tête est hors de la zone défilante.
		<Card
			onDragEnter={(event) => {
				if (view === 'category' || !acceptsProductBatch(event)) return
				setView('category')
				setSearch('')
			}}
			className='flex min-h-0 flex-col overflow-hidden lg:h-full'
		>
			<CardContent className='flex min-h-0 flex-1 flex-col p-0'>
				<div className='shrink-0 border-b bg-muted/30 p-3'>
					<div className='mb-2 flex items-center justify-between gap-2'>
						<div
							role='tablist'
							aria-label='Type de classement'
							className='flex items-center gap-1 rounded-lg border bg-background p-0.5'
						>
							{explorerTabs.map(({ id, label, Icon }) => (
								<button
									key={id}
									type='button'
									role='tab'
									aria-label={label}
									aria-selected={view === id}
									title={label}
									onClick={() => {
										setView(id)
										setSearch('')
									}}
									onDragEnter={(event) => {
										if (id !== 'category' || !acceptsProductBatch(event)) return
										setView('category')
										setSearch('')
									}}
									className={cn(
										'rounded-md p-1.5 transition-colors',
										view === id
											? 'bg-primary text-primary-foreground shadow-sm'
											: 'text-muted-foreground hover:bg-accent hover:text-foreground',
									)}
								>
									<Icon className='h-4 w-4' />
								</button>
							))}
						</div>
						<div className='flex items-center gap-1.5'>
							{view === 'category' && (
								<button
									type='button'
									aria-pressed={featuredOnly}
									aria-label={
										featuredOnly
											? 'Afficher toutes les catégories'
											: 'Afficher uniquement les catégories mises en avant'
									}
									title={
										featuredOnly
											? 'Voir toutes les catégories'
											: 'Catégories mises en avant'
									}
									onClick={() => setFeaturedOnly((active) => !active)}
									className={cn(
										'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
										featuredOnly
											? 'border-amber-300 bg-amber-50 text-amber-600 shadow-sm hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
											: 'border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-amber-600',
									)}
								>
									<Star
										className={cn('h-4 w-4', featuredOnly && 'fill-current')}
									/>
								</button>
							)}
							<span className='text-muted-foreground text-xs tabular-nums'>
								{currentView.count}
							</span>
						</div>
					</div>
					<div className='relative'>
						<Search className='-translate-y-1/2 absolute top-1/2 left-2.5 h-3.5 w-3.5 text-muted-foreground' />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={currentView.search}
							aria-label={`Chercher dans les ${currentView.label.toLocaleLowerCase('fr')}`}
							className='h-8 pr-8 pl-8 text-sm'
						/>
						{search && (
							<button
								type='button'
								onClick={() => setSearch('')}
								aria-label='Effacer la recherche'
								className='-translate-y-1/2 absolute top-1/2 right-2 rounded-sm text-muted-foreground hover:text-foreground'
							>
								<X className='h-3.5 w-3.5' />
							</button>
						)}
					</div>
				</div>

				<div className='max-h-72 overflow-y-auto overscroll-contain p-2 lg:max-h-none lg:min-h-0 lg:flex-1'>
					<button
						type='button'
						onClick={() => currentView.onChange('')}
						aria-pressed={currentView.value === ''}
						className={cn(
							'mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left font-medium text-sm transition-colors',
							currentView.value === ''
								? SELECTED_ITEM_CLASS
								: 'hover:bg-accent',
						)}
					>
						<CurrentViewIcon className='h-4 w-4 shrink-0' />
						<span className='min-w-0 flex-1 truncate'>{currentView.all}</span>
					</button>
					<button
						type='button'
						onClick={() => currentView.onChange(noneValue)}
						aria-pressed={currentView.value === noneValue}
						className={cn(
							'mb-1.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
							currentView.value === noneValue
								? SELECTED_ITEM_CLASS
								: 'text-muted-foreground hover:bg-accent hover:text-foreground',
						)}
					>
						<CurrentViewIcon className='h-4 w-4 shrink-0 opacity-70' />
						<span className='truncate'>{currentView.none}</span>
					</button>

					{loading[view] ? (
						<div className='flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm'>
							<Loader2 className='h-4 w-4 animate-spin' />
							Chargement…
						</div>
					) : view === 'category' && visibleOptions.length === 0 ? (
						<p className='py-8 text-center text-muted-foreground text-sm'>
							{normalizedSearch
								? 'Aucune catégorie trouvée'
								: featuredOnly
									? 'Aucune catégorie mise en avant'
									: 'Aucune catégorie peuplée'}
						</p>
					) : view === 'category' ? (
						<div role='tree' aria-label='Arbre des catégories'>
							{visibleOptions.map((option) => {
								const hasChildren = parentsWithChildren.has(option.id)
								const featured = featuredCategoryIds.has(option.id)
								const expanded =
									normalizedSearch !== '' || expandedIds.has(option.id)
								const categoryCounts = countsOfCategory(
									categoryCountsAreUsable ? counts : undefined,
									option.id,
								)
								const selected = categoryValue === option.id
								const dragTarget = dragOverCategoryId === option.id
								const updatingFeatured =
									updateCategory.isPending &&
									updateCategory.variables?.id === option.id
								return (
									<CategoryTreeRow
										key={option.id}
										option={option}
										hasChildren={hasChildren}
										expanded={expanded}
										onToggle={() => toggleCategory(option.id)}
										toggleDisabled={normalizedSearch !== ''}
										selected={selected}
										highlighted={dragTarget}
										counts={
											categoryCountsAreUsable ? categoryCounts : undefined
										}
										labelTitle={`${option.name} — ${categoryCounts.direct} directement, ${categoryCounts.total} dans la branche`}
										onLabelClick={() => onCategoryChange(option.id)}
										onDragEnter={(event) => {
											if (!acceptsProductBatch(event)) return
											setDragOverCategoryId(option.id)
											if (hasChildren) {
												setExpandedIds((current) =>
													current.has(option.id)
														? current
														: new Set(current).add(option.id),
												)
											}
										}}
										onDragOver={(event) => {
											if (!acceptsProductBatch(event)) return
											event.preventDefault()
											event.dataTransfer.dropEffect = 'move'
										}}
										onDragLeave={(event) => {
											if (
												event.relatedTarget instanceof Node &&
												event.currentTarget.contains(event.relatedTarget)
											)
												return
											setDragOverCategoryId(null)
										}}
										onDrop={(event) => {
											if (!acceptsProductBatch(event)) return
											event.preventDefault()
											setDragOverCategoryId(null)
											onProductsDropOnCategory?.(option)
										}}
										actions={
											<>
												<button
													type='button'
													aria-pressed={featured}
													aria-label={
														featured
															? `Retirer ${option.name} des catégories mises en avant`
															: `Mettre ${option.name} en avant`
													}
													title={
														featured
															? 'Retirer de la mise en avant'
															: 'Mettre en avant'
													}
													disabled={updateCategory.isPending}
													onClick={() => void toggleCategoryFeatured(option.id)}
													className={cn(
														'mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
														featured
															? 'text-amber-500 opacity-100 hover:bg-amber-100 dark:hover:bg-amber-950/50'
															: 'text-muted-foreground opacity-0 hover:bg-background hover:text-amber-500 group-hover:opacity-100',
														updatingFeatured && 'opacity-100',
													)}
												>
													{updatingFeatured ? (
														<Loader2 className='h-3.5 w-3.5 animate-spin' />
													) : (
														<Star
															className={cn(
																'h-3.5 w-3.5',
																featured && 'fill-current',
															)}
														/>
													)}
												</button>
												<button
													type='button'
													aria-label={`Modifier la catégorie ${option.name}`}
													title='Modifier la catégorie'
													onClick={(event) =>
														openEditor(event, 'category', option.id)
													}
													className={GEAR_BUTTON_CLASS}
												>
													<Settings2 className='h-3.5 w-3.5' />
												</button>
											</>
										}
									/>
								)
							})}
						</div>
					) : flatOptions.length === 0 ? (
						<p className='py-8 text-center text-muted-foreground text-sm'>
							Aucun résultat
						</p>
					) : (
						<nav aria-label={currentView.label}>
							{flatOptions.map((option) => {
								const selected = currentView.value === option.id
								const brand =
									view === 'brand' ? brandById.get(option.id) : undefined
								const logoUrl = brand?.image
									? pb.files.getUrl(brand, brand.image)
									: null
								const supplierNames =
									view === 'brand'
										? (supplierNamesByBrand.get(option.id) ?? [])
										: []
								const supplierBrands =
									view === 'supplier'
										? (brandsBySupplier.get(option.id) ?? [])
										: []
								const supplierExpanded =
									view === 'supplier' && expandedSupplierIds.has(option.id)
								const productCount = counts
									? view === 'brand'
										? (counts.parMarque[option.id] ?? 0)
										: (counts.parFournisseur[option.id] ?? 0)
									: undefined
								return (
									<div key={option.id} className='mb-0.5'>
										<div
											className={cn(
												'group flex min-w-0 items-center rounded-md transition-colors',
												selected ? SELECTED_ITEM_CLASS : 'hover:bg-accent',
											)}
										>
											{view === 'supplier' && (
												<button
													type='button'
													disabled={supplierBrands.length === 0}
													onClick={() => toggleSupplier(option.id)}
													aria-label={
														supplierExpanded
															? `Replier ${option.name}`
															: `Déplier ${option.name}`
													}
													aria-expanded={
														supplierBrands.length > 0
															? supplierExpanded
															: undefined
													}
													className={cn(
														'm-0.5 rounded p-1 hover:bg-background/20',
														supplierBrands.length === 0 && 'invisible',
													)}
												>
													{supplierExpanded ? (
														<ChevronDown className='h-3.5 w-3.5' />
													) : (
														<ChevronRight className='h-3.5 w-3.5' />
													)}
												</button>
											)}
											<button
												type='button'
												aria-pressed={selected}
												onClick={() => currentView.onChange(option.id)}
												className='flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm'
											>
												{brand && <BrandLogo name={brand.name} url={logoUrl} />}
												<span className='min-w-0 flex-1'>
													<span className='block truncate'>{option.name}</span>
													{supplierNames.length > 0 && (
														<span
															className='flex min-w-0 items-center gap-1 text-[11px] text-orange-600'
															title={supplierNames.join(', ')}
														>
															<Truck className='h-3 w-3 shrink-0' />
															<span className='truncate'>
																{supplierNames.join(', ')}
															</span>
														</span>
													)}
												</span>
											</button>
											{/* L'engrenage se glisse ENTRE le nom et le décompte,
											    comme l'étoile des catégories : le compteur reste la
											    dernière colonne, alignée d'une ligne à l'autre. Le
											    décompte est donc sorti du bouton de sélection. */}
											<button
												type='button'
												aria-label={
													view === 'brand'
														? `Modifier la marque ${option.name}`
														: `Modifier le fournisseur ${option.name}`
												}
												title={
													view === 'brand'
														? 'Modifier la marque'
														: 'Modifier le fournisseur'
												}
												onClick={(event) => openEditor(event, view, option.id)}
												className={GEAR_BUTTON_CLASS}
											>
												<Settings2 className='h-3.5 w-3.5' />
											</button>
											{productCount !== undefined && (
												<span className='shrink-0 pr-2 text-[11px] tabular-nums opacity-60'>
													{productCount}
												</span>
											)}
										</div>
										{supplierExpanded && (
											// Une pastille par marque, avec son logo quand il existe.
											// La liste était une phrase en `join(', ')` : au-delà de
											// quelques marques — ALGAM en distribue 46 — elle
											// devenait un pavé où l'œil ne séparait plus rien.
											// Cliquer une pastille filtre sur la marque et bascule
											// sur son onglet : c'est le geste qu'on attend d'un nom
											// de marque affiché sous un fournisseur.
											<div className='flex flex-wrap gap-1 px-8 pt-0.5 pb-2'>
												{supplierBrands.map((brand) => (
													<button
														key={brand.id}
														type='button'
														title={`Filtrer sur ${brand.name}`}
														onClick={() => {
															setView('brand')
															setSearch('')
															onBrandChange(brand.id)
														}}
														className='inline-flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pr-2 pl-1 text-[11px] transition-colors hover:bg-accent'
													>
														<BrandLogo
															name={brand.name}
															url={
																brand.image
																	? pb.files.getUrl(brand, brand.image)
																	: null
															}
															size='tag'
														/>
														<span className='truncate'>{brand.name}</span>
													</button>
												))}
											</div>
										)}
									</div>
								)
							})}
						</nav>
					)}
				</div>
			</CardContent>

			{/* Les trois modales sont montées ici, hors de la liste défilante : une
			    modale rendue DANS la ligne disparaîtrait avec elle dès qu'un filtre
			    ou une recherche la sort de `visibleOptions`. */}
			<CategoryDialog
				open={editing?.kind === 'category' && !!editingCategory}
				onOpenChange={closeEditor}
				category={editingCategory}
			/>
			<BrandDialog
				open={editing?.kind === 'brand' && !!editingBrand}
				onOpenChange={closeEditor}
				brand={editingBrand}
			/>
			<SupplierDialog
				open={editing?.kind === 'supplier' && !!editingSupplier}
				onOpenChange={closeEditor}
				supplier={editingSupplier}
			/>
		</Card>
	)
}
