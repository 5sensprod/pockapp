// frontend/modules/site/CatalogueEnLignePage.tsx
// ═══════════════════════════════════════════════════════════════════════════
// CATALOGUE EN LIGNE — ce qui est destiné au site
// ═══════════════════════════════════════════════════════════════════════════
// Montre le catalogue **PocketBase** filtré par la règle de publication, et
// autrement qu'en table : un arbre pour la structure, des cards pour ce que le
// visiteur verra. Voir `lib/online-catalog.ts` pour la règle, qui est dérivée
// et non saisie.
//
// L'écran EXPORTE vers la base SQL du site (contrat : PocketSite-docs/
// 12-contrat-catalogue.md), mais n'ÉDITE rien du catalogue local.
//
// ⚠️ AUCUNE ÉDITION LOCALE, ET CE N'EST PAS UN OUBLI.
// Le catalogue PocketBase est une projection de NeDB rechargée **par purge** :
// chaque `catalog-import -load` efface tout et réécrit. Un titre de site saisi
// ici, une description de marque retouchée, seraient détruits au prochain
// rechargement sans un mot. Les retouches éditoriales prévues (titre de site du
// produit, image et description de catégorie, logo et description de marque)
// attendent donc que leur persistance soit tranchée — collection séparée clée
// sur `legacy_id`, champs préservés par le chargeur, ou fin des rechargements.
// ═══════════════════════════════════════════════════════════════════════════

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
	type CatalogBrand,
	type CatalogCategory,
	type CatalogProduct,
	useCatalogBrands,
	useCatalogCategories,
	useProductCount,
	usePublishedProducts,
} from '@/lib/queries/site-catalog'
import { AlertTriangle, Globe, Loader2, Search, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { CatalogSyncBar } from './components/online-catalog/CatalogSyncBar'
import { OnlineBrandGrid } from './components/online-catalog/OnlineBrandGrid'
import { OnlineCategoryTree } from './components/online-catalog/OnlineCategoryTree'
import { OnlineProductGrid } from './components/online-catalog/OnlineProductGrid'
import {
	useCatalogInventory,
	useExportCatalog,
	useProductChecksums,
} from './hooks/use-catalog-sync'
import { type SyncState, syncStateOf } from './lib/catalog-export'
import {
	type OnlineCategoryNode,
	buildOnlineCatalog,
	collectSubtreeProducts,
} from './lib/online-catalog'

export function CatalogueEnLignePage() {
	const products = usePublishedProducts()
	const categories = useCatalogCategories()
	const brands = useCatalogBrands()
	const totalProducts = useProductCount()

	const [search, setSearch] = useState('')
	const [selectedCategory, setSelectedCategory] =
		useState<OnlineCategoryNode | null>(null)
	const [selectedBrand, setSelectedBrand] = useState<CatalogBrand | null>(null)
	const [expanded, setExpanded] = useState<Set<string>>(new Set())

	// La recherche filtre les produits AVANT la dérivation : l'arbre montre
	// alors les seules branches qui portent un résultat, ce qui est l'intérêt —
	// une table donnerait la liste, pas l'endroit où elle se trouve.
	const filteredProducts = useMemo(() => {
		const all = products.data ?? []
		const q = search.trim().toLowerCase()
		if (!q) return all
		return all.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				p.sku?.toLowerCase().includes(q) ||
				p.designation?.toLowerCase().includes(q),
		)
	}, [products.data, search])

	const catalog = useMemo(
		() =>
			buildOnlineCatalog(
				filteredProducts,
				categories.data ?? [],
				brands.data ?? [],
			),
		[filteredProducts, categories.data, brands.data],
	)

	const brandsById = useMemo(
		() => new Map((brands.data ?? []).map((b) => [b.id, b])),
		[brands.data],
	)

	// Ce qui s'affiche à droite : la sélection de catégorie d'abord, celle de
	// marque ensuite, et à défaut tout ce qui part vers le site.
	const shownProducts = useMemo(() => {
		let list = selectedCategory
			? collectSubtreeProducts(selectedCategory, catalog.productsByCategory)
			: filteredProducts
		if (selectedBrand) list = list.filter((p) => p.brand === selectedBrand.id)
		return list
	}, [selectedCategory, selectedBrand, catalog, filteredProducts])

	// ── Synchronisation ──────────────────────────────────────────────────────
	// L'inventaire n'est interrogé qu'une fois le catalogue lu : sans produits
	// à confronter, il n'apprendrait rien.
	const inventory = useCatalogInventory((products.data?.length ?? 0) > 0)
	const exportCatalog = useExportCatalog()

	const checksums = useProductChecksums(
		products.data ?? [],
		categories.data ?? [],
		brands.data ?? [],
	)

	const syncStates = useMemo(() => {
		const map = new Map<string, SyncState>()
		if (!inventory.data) return map
		for (const product of products.data ?? []) {
			map.set(
				product.legacy_id,
				syncStateOf(
					product.legacy_id,
					checksums.get(product.legacy_id),
					inventory.data.products,
				),
			)
		}
		return map
	}, [inventory.data, products.data, checksums])

	const syncCounts = useMemo(() => {
		const counts = { absent: 0, modified: 0, synced: 0 }
		for (const state of syncStates.values()) counts[state]++
		return counts
	}, [syncStates])

	/**
	 * Exporte une sélection de produits **avec leurs dépendances** : la marque
	 * et les catégories qu'ils citent, ancêtres compris. Envoyer un produit
	 * seul laisserait le site avec un rattachement vers une catégorie qu'il ne
	 * connaît pas.
	 */
	const exportProducts = useCallback(
		(selection: CatalogProduct[]) => {
			const categoryById = new Map(
				(categories.data ?? []).map((c) => [c.id, c]),
			)
			const neededCategories = new Map<string, CatalogCategory>()
			const neededBrands = new Map<string, CatalogBrand>()

			for (const product of selection) {
				for (const categoryId of product.categories ?? []) {
					// Toute la chaîne d'ancêtres, sinon l'arbre du site a des trous.
					let current: string | undefined = categoryId
					const guard = new Set<string>()
					while (current && categoryById.has(current) && !guard.has(current)) {
						guard.add(current)
						const category = categoryById.get(current)
						if (!category) break
						neededCategories.set(category.id, category)
						current = category.parent || undefined
					}
				}
				const brand = product.brand ? brandsById.get(product.brand) : undefined
				if (brand) neededBrands.set(brand.id, brand)
			}

			exportCatalog.mutate({
				products: selection,
				categories: [...neededCategories.values()],
				brands: [...neededBrands.values()],
			})
		},
		[categories.data, brandsById, exportCatalog],
	)

	const toggle = (id: string) =>
		setExpanded((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	const isLoading =
		products.isLoading || categories.isLoading || brands.isLoading
	const error = products.error ?? categories.error ?? brands.error

	return (
		<div className='container mx-auto px-6 py-8'>
			<div className='mb-6'>
				<div className='mb-2 flex items-center gap-3'>
					<div className='flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10'>
						<Globe className='h-6 w-6 text-primary' />
					</div>
					<h1 className='font-bold text-3xl'>Catalogue en ligne</h1>
				</div>
				<p className='text-muted-foreground'>
					Ce qui part vers axemusique.shop. Un produit est en ligne si son
					statut est <strong>publié</strong> ; catégories et marques suivent
					automatiquement. Les produits grisés ne sont pas encore dans la base
					du site.
				</p>
			</div>

			{error && (
				<Card className='mb-6 border-destructive'>
					<CardContent className='flex items-start gap-3 pt-6'>
						<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-destructive' />
						<div>
							<p className='font-medium'>Lecture du catalogue impossible</p>
							<p className='text-muted-foreground text-sm'>{String(error)}</p>
						</div>
					</CardContent>
				</Card>
			)}

			{isLoading ? (
				<div className='flex items-center justify-center gap-3 py-24 text-muted-foreground'>
					<Loader2 className='h-5 w-5 animate-spin' />
					<span className='text-sm'>Lecture du catalogue…</span>
				</div>
			) : (
				<>
					{/* ── Décomptes ──────────────────────────────────────────────── */}
					<div className='mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4'>
						<Stat
							label='Produits en ligne'
							value={products.data?.length ?? 0}
							hint={
								typeof totalProducts.data === 'number'
									? `sur ${totalProducts.data} au catalogue`
									: undefined
							}
						/>
						<Stat
							label='Catégories en ligne'
							value={catalog.onlineCategoryIds.size}
							hint={`sur ${categories.data?.length ?? 0}`}
						/>
						<Stat
							label='Marques en ligne'
							value={catalog.brands.length}
							hint={`sur ${brands.data?.length ?? 0}`}
						/>
						<Stat
							label='Sans catégorie'
							value={catalog.uncategorized.length}
							hint='publiés, sans point d’entrée'
							warn={catalog.uncategorized.length > 0}
						/>
					</div>

					{catalog.missingCategoryIds.length > 0 && (
						<Card className='mb-6 border-amber-500/50'>
							<CardContent className='flex items-start gap-3 pt-6'>
								<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-amber-500' />
								<div className='text-sm'>
									<p className='font-medium'>
										{catalog.missingCategoryIds.length} catégorie(s) citée(s)
										par un produit mais absente(s) de la collection
									</p>
									<p className='text-muted-foreground'>
										Constat, pas correction : à remonter avant l’export.
									</p>
								</div>
							</CardContent>
						</Card>
					)}

					<CatalogSyncBar
						available={Boolean(inventory.data)}
						loading={inventory.isFetching}
						error={(inventory.error as Error | null) ?? null}
						counts={syncCounts}
						remoteCount={inventory.data?.counts.products ?? null}
						exporting={exportCatalog.isPending}
						progress={exportCatalog.progress}
						rejected={exportCatalog.data?.rejected ?? []}
						onRefresh={() => inventory.refetch()}
						onExportAll={() =>
							exportProducts(
								(products.data ?? []).filter(
									(p) => syncStates.get(p.legacy_id) !== 'synced',
								),
							)
						}
					/>

					{exportCatalog.error && (
						<Card className='mb-6 border-destructive'>
							<CardContent className='flex items-start gap-3 pt-6'>
								<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-destructive' />
								<div>
									<p className='font-medium'>Export interrompu</p>
									<p className='text-muted-foreground text-sm'>
										{exportCatalog.error.message}
									</p>
									<p className='mt-1 text-muted-foreground text-xs'>
										Les lots déjà écrits le restent. L’opération est idempotente
										: relancer la synchronisation reprend l’ensemble sans rien
										dupliquer.
									</p>
								</div>
							</CardContent>
						</Card>
					)}

					{/* ── Recherche ──────────────────────────────────────────────── */}
					<div className='relative mb-4'>
						<Search className='-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground' />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder='Rechercher un produit en ligne (nom, référence)…'
							className='pl-9'
						/>
					</div>

					<Tabs defaultValue='structure'>
						<TabsList>
							<TabsTrigger value='structure'>Arborescence</TabsTrigger>
							<TabsTrigger value='brands'>
								Marques ({catalog.brands.length})
							</TabsTrigger>
						</TabsList>

						{/* ── Arbre + produits ─────────────────────────────────────── */}
						<TabsContent value='structure' className='mt-4'>
							<div className='grid gap-4 lg:grid-cols-[320px_1fr]'>
								<Card className='h-fit lg:sticky lg:top-4'>
									<CardContent className='max-h-[70vh] overflow-y-auto p-2'>
										<OnlineCategoryTree
											nodes={catalog.tree}
											selectedId={selectedCategory?.category.id ?? null}
											expanded={expanded}
											onSelect={(node) =>
												setSelectedCategory((prev) =>
													prev?.category.id === node.category.id ? null : node,
												)
											}
											onToggle={toggle}
										/>
									</CardContent>
								</Card>

								<div>
									<div className='mb-3 flex flex-wrap items-center gap-2'>
										<span className='font-medium text-sm'>
											{selectedCategory
												? selectedCategory.category.name
												: 'Tout le catalogue en ligne'}
										</span>
										<Badge variant='secondary'>
											{shownProducts.length} produit
											{shownProducts.length > 1 ? 's' : ''}
										</Badge>
										{selectedCategory && (
											<span className='text-muted-foreground text-xs'>
												descendance comprise
											</span>
										)}
										{/* Le filtre marque se pose dans l'AUTRE onglet. Sans moyen
										    visible de le retirer, il vide la grille sans dire
										    pourquoi — d'où la croix, et non un simple badge. */}
										{selectedBrand && (
											<button
												type='button'
												onClick={() => setSelectedBrand(null)}
												className='inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-accent'
												title='Retirer le filtre de marque'
											>
												{selectedBrand.name}
												<X className='h-3 w-3' />
											</button>
										)}
									</div>

									<OnlineProductGrid
										products={shownProducts}
										brandsById={brandsById}
										syncStates={syncStates}
										onExport={(product) => exportProducts([product])}
										exporting={exportCatalog.isPending}
										emptyLabel={
											selectedBrand
												? `Aucun produit de la marque ${selectedBrand.name} ici. Retirez le filtre pour voir les ${selectedCategory?.totalCount ?? ''} produits de la branche.`
												: undefined
										}
									/>
								</div>
							</div>
						</TabsContent>

						{/* ── Marques ──────────────────────────────────────────────── */}
						<TabsContent value='brands' className='mt-4'>
							<OnlineBrandGrid
								brands={catalog.brands}
								selectedId={selectedBrand?.id ?? null}
								onSelect={setSelectedBrand}
							/>
						</TabsContent>
					</Tabs>

					{catalog.uncategorized.length > 0 && (
						<section className='mt-8'>
							<h2 className='mb-1 font-semibold text-lg'>
								Publiés sans catégorie
							</h2>
							<p className='mb-3 text-muted-foreground text-sm'>
								Ces produits partiraient vers le site sans apparaître dans la
								navigation.
							</p>
							<OnlineProductGrid
								products={catalog.uncategorized}
								brandsById={brandsById}
								syncStates={syncStates}
								onExport={(product) => exportProducts([product])}
								exporting={exportCatalog.isPending}
							/>
						</section>
					)}
				</>
			)}
		</div>
	)
}

function Stat({
	label,
	value,
	hint,
	warn,
}: { label: string; value: number; hint?: string; warn?: boolean }) {
	return (
		<Card>
			<CardContent className='pt-6'>
				<p className='text-muted-foreground text-xs uppercase tracking-wide'>
					{label}
				</p>
				<p
					className={`font-bold text-2xl tabular-nums ${warn ? 'text-amber-500' : ''}`}
				>
					{value}
				</p>
				{hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
			</CardContent>
		</Card>
	)
}
