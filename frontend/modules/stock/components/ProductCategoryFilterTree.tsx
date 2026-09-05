import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { CatalogBrandShape } from '@/lib/queries/catalog-shapes'
import type { CategoryNode } from '@/lib/queries/category-tree'
import {
	collectBranchIds,
	toCategoryOptions,
} from '@/lib/queries/category-tree'
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
	Truck,
	X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type ExplorerView = 'category' | 'brand' | 'supplier'

interface NamedOption {
	id: string
	name: string
}

interface SupplierOption extends NamedOption {
	brands?: string[]
}

interface ProductCategoryFilterTreeProps {
	categories: CategoryNode[]
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
	loading?: Partial<Record<ExplorerView, boolean>>
}

function BrandLogo({ name, url }: { name: string; url: string | null }) {
	const [brokenUrl, setBrokenUrl] = useState<string | null>(null)

	return (
		<div className='flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-muted'>
			{url && brokenUrl !== url ? (
				<img
					src={url}
					alt={`Logo ${name}`}
					loading='lazy'
					decoding='async'
					className='h-full w-full object-contain'
					onError={() => setBrokenUrl(url)}
				/>
			) : (
				<Building2 className='h-3.5 w-3.5 text-muted-foreground' />
			)}
		</div>
	)
}

function normalizeSearch(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLocaleLowerCase('fr')
}

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
	loading = {},
}: ProductCategoryFilterTreeProps) {
	const pb = usePocketBase()
	const [view, setView] = useState<ExplorerView>('category')
	const [search, setSearch] = useState('')
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
	const [expandedSupplierIds, setExpandedSupplierIds] = useState<Set<string>>(
		() => new Set(),
	)

	// `total` est déjà remonté par le serveur. Les branches sans produit peuvent
	// disparaître sans calculer ni parcourir les produits dans le navigateur.
	const options = useMemo(() => {
		const treeOrder = toCategoryOptions(categories)
		if (!counts) return treeOrder
		return treeOrder.filter(
			(category) => countsOfCategory(counts, category.id).total > 0,
		)
	}, [categories, counts])
	const optionIds = useMemo(
		() => new Set(options.map((option) => option.id)),
		[options],
	)
	const parentById = useMemo(
		() =>
			new Map(
				categories.map((category) => [category.id, category.parent || '']),
			),
		[categories],
	)
	const parentsWithChildren = useMemo(() => {
		const parents = new Set<string>()
		for (const category of categories) {
			const parent = category.parent || ''
			if (parent && optionIds.has(parent) && optionIds.has(category.id)) {
				parents.add(parent)
			}
		}
		return parents
	}, [categories, optionIds])

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

	const normalizedSearch = normalizeSearch(search.trim())
	const searchedIds = useMemo(() => {
		if (view !== 'category' || !normalizedSearch) return null
		const included = new Set<string>()
		for (const category of categories) {
			if (!normalizeSearch(category.name).includes(normalizedSearch)) continue

			// Le résultat conserve ses parents pour expliquer où il se trouve, et sa
			// descendance pour que chercher une famille garde ses sous-catégories.
			for (const id of collectBranchIds(categories, category.id))
				included.add(id)
			const visited = new Set<string>()
			let parent = category.parent || ''
			while (parent && !visited.has(parent)) {
				visited.add(parent)
				included.add(parent)
				parent = parentById.get(parent) || ''
			}
		}
		return included
	}, [categories, normalizedSearch, parentById, view])

	const visibleOptions = useMemo(() => {
		if (searchedIds)
			return options.filter((option) => searchedIds.has(option.id))
		return options.filter((option) => {
			const visited = new Set<string>()
			let parent = parentById.get(option.id) || ''
			while (parent && optionIds.has(parent) && !visited.has(parent)) {
				if (!expandedIds.has(parent)) return false
				visited.add(parent)
				parent = parentById.get(parent) || ''
			}
			return true
		})
	}, [expandedIds, optionIds, options, parentById, searchedIds])
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
	const brandNamesBySupplier = useMemo(
		() =>
			new Map(
				suppliers.map((supplier) => [
					supplier.id,
					(supplier.brands ?? [])
						.map((brandId) => brandById.get(brandId)?.name)
						.filter((name): name is string => Boolean(name)),
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
			count: options.length,
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

	return (
		// L'arbre remplit la colonne et ne défile QUE dans sa liste (5 septembre
		// 2026). Il était collant sous un décalage écrit en dur — `header + 5.5rem`
		// —, qui ne correspondait plus à la hauteur réelle de la barre dès qu'un
		// filtre passait à la ligne, et sa liste était bornée par un second calcul
		// de la même famille. La colonne étant désormais à hauteur fixe, il n'y a
		// plus rien à deviner : l'en-tête est hors de la zone défilante.
		<Card className='flex min-h-0 flex-col overflow-hidden lg:h-full'>
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
						<span className='text-muted-foreground text-xs tabular-nums'>
							{currentView.count}
						</span>
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
								? 'bg-primary text-primary-foreground'
								: 'hover:bg-accent',
						)}
					>
						{view !== 'supplier' && (
							<CurrentViewIcon className='h-4 w-4 shrink-0' />
						)}
						<span className='min-w-0 flex-1 truncate'>{currentView.all}</span>
					</button>
					<button
						type='button'
						onClick={() => currentView.onChange(noneValue)}
						aria-pressed={currentView.value === noneValue}
						className={cn(
							'mb-1.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
							currentView.value === noneValue
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:bg-accent hover:text-foreground',
						)}
					>
						{view !== 'supplier' && (
							<CurrentViewIcon className='h-4 w-4 shrink-0 opacity-70' />
						)}
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
								: 'Aucune catégorie peuplée'}
						</p>
					) : view === 'category' ? (
						<div role='tree' aria-label='Arbre des catégories'>
							{visibleOptions.map((option) => {
								const hasChildren = parentsWithChildren.has(option.id)
								const expanded =
									normalizedSearch !== '' || expandedIds.has(option.id)
								const categoryCounts = countsOfCategory(counts, option.id)
								const selected = categoryValue === option.id
								return (
									<div
										key={option.id}
										role='treeitem'
										aria-level={option.depth + 1}
										aria-selected={selected}
										aria-expanded={hasChildren ? expanded : undefined}
										className={cn(
											'group mb-0.5 flex min-w-0 items-center rounded-md transition-colors',
											selected
												? 'bg-primary text-primary-foreground'
												: 'hover:bg-accent',
										)}
										style={{ paddingLeft: `${4 + option.depth * 13}px` }}
									>
										<button
											type='button'
											disabled={!hasChildren || normalizedSearch !== ''}
											onClick={() => toggleCategory(option.id)}
											aria-label={
												expanded
													? `Replier ${option.name}`
													: `Déplier ${option.name}`
											}
											className={cn(
												'm-0.5 rounded p-1 hover:bg-background/20',
												!hasChildren && 'invisible',
											)}
										>
											{expanded ? (
												<ChevronDown className='h-3.5 w-3.5' />
											) : (
												<ChevronRight className='h-3.5 w-3.5' />
											)}
										</button>
										<button
											type='button'
											onClick={() => onCategoryChange(option.id)}
											className='flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2 text-left text-sm'
											title={`${option.name} — ${categoryCounts.direct} directement, ${categoryCounts.total} dans la branche`}
										>
											<span className='min-w-0 flex-1 truncate'>
												{option.name}
											</span>
											{counts && (
												<span className='shrink-0 text-[11px] tabular-nums opacity-60'>
													{categoryCounts.direct === categoryCounts.total
														? categoryCounts.total
														: `${categoryCounts.direct}/${categoryCounts.total}`}
												</span>
											)}
										</button>
									</div>
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
								const supplierBrandNames =
									view === 'supplier'
										? (brandNamesBySupplier.get(option.id) ?? [])
										: []
								const supplierExpanded =
									view === 'supplier' && expandedSupplierIds.has(option.id)
								const productCount =
									view === 'brand' ? counts?.parMarque[option.id] : undefined
								return (
									<div key={option.id} className='mb-0.5'>
										<div
											className={cn(
												'flex min-w-0 items-center rounded-md transition-colors',
												selected
													? 'bg-primary text-primary-foreground'
													: 'hover:bg-accent',
											)}
										>
											{view === 'supplier' && (
												<button
													type='button'
													disabled={supplierBrandNames.length === 0}
													onClick={() => toggleSupplier(option.id)}
													aria-label={
														supplierExpanded
															? `Replier ${option.name}`
															: `Déplier ${option.name}`
													}
													aria-expanded={
														supplierBrandNames.length > 0
															? supplierExpanded
															: undefined
													}
													className={cn(
														'm-0.5 rounded p-1 hover:bg-background/20',
														supplierBrandNames.length === 0 && 'invisible',
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
												{productCount !== undefined && (
													<span className='shrink-0 text-[11px] tabular-nums opacity-60'>
														{productCount}
													</span>
												)}
											</button>
										</div>
										{supplierExpanded && (
											<p className='px-8 py-1.5 text-muted-foreground text-xs leading-relaxed'>
												{supplierBrandNames.join(', ')}
											</p>
										)}
									</div>
								)
							})}
						</nav>
					)}
				</div>
			</CardContent>
		</Card>
	)
}
