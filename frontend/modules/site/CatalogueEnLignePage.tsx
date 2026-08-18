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
// 12-contrat-catalogue.md) et ÉDITE les textes que le visiteur lira.
//
// ── L'ÉDITION, ET SA CONTRAINTE ─────────────────────────────────────────────
// Tranchée le 12 août 2026 (docs/DECISIONS.md) : les textes s'écrivent
// DIRECTEMENT dans `products`, `categories` et `brands`. Deux champs, et deux
// seulement — le `name` du produit, qui fait office de titre de site puisque
// `present_product` (server/api/catalog.php:134-141) retombe dessus quand
// `site_title` est vide, et la `description` des trois entités. Ni prix, ni
// stock, ni statut : ils appartiennent à AppStock.
//
// ⚠️ CES SAISIES NE SURVIVENT PAS À `catalog-import -load`, qui purge les
// collections (backend/catalog/load/loader.go:290). Ce n'est pas un défaut à
// contourner : la campagne éditoriale réelle se fera APRÈS l'import définitif,
// et ce qui est saisi d'ici là est un essai dont la perte est acceptée d'avance.
// L'éditeur le dit à l'écran, il ne se contente pas de le savoir.
//
// La voie d'écriture est unique et nommée : `hooks/use-catalog-editorial.ts`.
// Elle ne passe pas par `useUpdateProductUniversal`.
// ═══════════════════════════════════════════════════════════════════════════

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import {
	type CatalogBrand,
	type CatalogCategory,
	type CatalogProduct,
	useCatalogBrands,
	useCatalogCategories,
	useProductCount,
	usePublishedProducts,
} from '@/lib/queries/site-catalog'
import {
	AlertTriangle,
	Globe,
	Loader2,
	Pencil,
	RefreshCw,
	Search,
	X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { CatalogSyncBar } from './components/online-catalog/CatalogSyncBar'
import {
	EditorialDialog,
	type EditorialTarget,
} from './components/online-catalog/EditorialDialog'
import { OnlineBrandGrid } from './components/online-catalog/OnlineBrandGrid'
import { OnlineCategoryTree } from './components/online-catalog/OnlineCategoryTree'
import { OnlineProductGrid } from './components/online-catalog/OnlineProductGrid'
import {
	useCatalogInventory,
	useExportCatalog,
	useProductChecksums,
	useRelationChecksums,
} from './hooks/use-catalog-sync'
import { type SyncState, syncStateOf } from './lib/catalog-export'
import {
	type OnlineCategoryNode,
	buildOnlineCatalog,
	collectSubtreeProducts,
} from './lib/online-catalog'

/**
 * Tableaux vides PARTAGÉS, et non des `[]` créés à la volée.
 *
 * `data ?? []` fabrique un nouveau tableau à chaque rendu : passé en dépendance
 * d'un hook qui calcule puis pose un état, cela reboucle indéfiniment et la
 * page ne s'affiche jamais. Une constante de module a une identité stable.
 */
const NO_PRODUCTS: CatalogProduct[] = []
const NO_CATEGORIES: CatalogCategory[] = []
const NO_BRANDS: CatalogBrand[] = []

export function CatalogueEnLignePage() {
	const products = usePublishedProducts()
	const categories = useCatalogCategories()
	const brands = useCatalogBrands()
	const totalProducts = useProductCount()

	const [search, setSearch] = useState('')
	const [onlyModified, setOnlyModified] = useState(false)
	const [selectedCategory, setSelectedCategory] =
		useState<OnlineCategoryNode | null>(null)
	const [selectedBrand, setSelectedBrand] = useState<CatalogBrand | null>(null)
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	/** La fiche en cours d'édition, quel que soit son genre. `null` : dialogue
	 *  fermé. Un seul état pour les trois, l'éditeur étant le même. */
	const [editing, setEditing] = useState<EditorialTarget | null>(null)
	/**
	 * PocketBase répond par une liste vide (et non une erreur) quand la règle de
	 * lecture n'est momentanément pas satisfaite. React Query garderait alors ce
	 * faux résultat pendant cinq minutes. Si les produits prouvent que des
	 * relations existent, on accorde une seule seconde lecture aux collections.
	 */
	const relationRetryAttempted = useRef(false)
	useEffect(() => {
		if (
			relationRetryAttempted.current ||
			!products.data?.length ||
			categories.isFetching ||
			brands.isFetching
		) {
			return
		}

		const categoriesExpected = products.data.some(
			(product) => (product.categories?.length ?? 0) > 0,
		)
		const brandsExpected = products.data.some((product) =>
			Boolean(product.brand),
		)
		const categoriesMissing =
			categoriesExpected && (categories.data?.length ?? 0) === 0
		const brandsMissing = brandsExpected && (brands.data?.length ?? 0) === 0

		if (!categoriesMissing && !brandsMissing) return

		relationRetryAttempted.current = true
		const retries: Promise<unknown>[] = []
		if (categoriesMissing) retries.push(categories.refetch())
		if (brandsMissing) retries.push(brands.refetch())
		void Promise.all(retries)
	}, [
		products.data,
		categories.data,
		categories.isFetching,
		categories.refetch,
		brands.data,
		brands.isFetching,
		brands.refetch,
	])

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

	const brandsById = useMemo(
		() => new Map((brands.data ?? []).map((b) => [b.id, b])),
		[brands.data],
	)
	const categoriesById = useMemo(
		() =>
			new Map(
				(categories.data ?? []).map((category) => [category.id, category]),
			),
		[categories.data],
	)

	// ── Synchronisation ──────────────────────────────────────────────────────
	// L'inventaire n'est interrogé qu'une fois le catalogue lu : sans produits
	// à confronter, il n'apprendrait rien.
	const inventory = useCatalogInventory((products.data?.length ?? 0) > 0)
	const exportCatalog = useExportCatalog()

	const checksums = useProductChecksums(
		products.data ?? NO_PRODUCTS,
		categories.data ?? NO_CATEGORIES,
		brands.data ?? NO_BRANDS,
		Boolean(inventory.data),
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

	// Le filtre « à mettre à jour » porte uniquement sur les produits déjà
	// présents sur le site dont l'empreinte a changé. Les produits jamais
	// exportés gardent leur état distinct et restent accessibles dans la vue
	// complète.
	const visibleProducts = useMemo(() => {
		if (!onlyModified || !inventory.data) return filteredProducts
		return filteredProducts.filter(
			(product) => syncStates.get(product.legacy_id) === 'modified',
		)
	}, [filteredProducts, inventory.data, onlyModified, syncStates])

	// La dérivation vient APRÈS tous les filtres produit : l'arbre et la grille
	// montrent ainsi les mêmes branches, marques et décomptes.
	const catalog = useMemo(
		() =>
			buildOnlineCatalog(
				visibleProducts,
				categories.data ?? [],
				brands.data ?? [],
			),
		[visibleProducts, categories.data, brands.data],
	)

	// Ce qui s'affiche à droite : la sélection de catégorie d'abord, celle de
	// marque ensuite, et à défaut tout ce qui part vers le site.
	const shownProducts = useMemo(() => {
		let list = selectedCategory
			? collectSubtreeProducts(selectedCategory, catalog.productsByCategory)
			: visibleProducts
		if (selectedBrand) list = list.filter((p) => p.brand === selectedBrand.id)
		return list
	}, [selectedCategory, selectedBrand, catalog, visibleProducts])

	// ── État des catégories et des marques ───────────────────────────────────
	// Décision du 13 août 2026 : l'export reste explicite, mais une retouche de
	// texte isolée doit se VOIR. Sans cela, on modifie la description d'une
	// catégorie et rien ne dit qu'elle n'est pas partie.
	const relationChecksums = useRelationChecksums(
		categories.data ?? NO_CATEGORIES,
		brands.data ?? NO_BRANDS,
		Boolean(inventory.data),
	)

	/** Les catégories et marques EN LIGNE dont l'empreinte diffère de celle du
	 *  site. Restreint à ce qui est en ligne : une catégorie que le site ne
	 *  connaît pas n'est pas « modifiée », elle est absente — et elle partira
	 *  d'elle-même avec le premier produit qui la cite. */
	const staleRelations = useMemo(() => {
		if (!inventory.data) {
			return {
				categories: [] as CatalogCategory[],
				brands: [] as CatalogBrand[],
			}
		}

		const staleCategories = (categories.data ?? []).filter(
			(category) =>
				catalog.onlineCategoryIds.has(category.id) &&
				syncStateOf(
					category.legacy_id,
					relationChecksums.categories.get(category.legacy_id),
					inventory.data?.categories,
				) === 'modified',
		)

		const onlineBrandIds = new Set(catalog.brands.map((b) => b.brand.id))
		const staleBrands = (brands.data ?? []).filter(
			(brand) =>
				onlineBrandIds.has(brand.id) &&
				syncStateOf(
					brand.legacy_id,
					relationChecksums.brands.get(brand.legacy_id),
					inventory.data?.brands,
				) === 'modified',
		)

		return { categories: staleCategories, brands: staleBrands }
	}, [inventory.data, categories.data, brands.data, catalog, relationChecksums])

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
			// ⚠️ GARDE-FOU, ajouté après un export qui a écrit `brand = NULL`.
			//
			// Si les catégories ou les marques n'ont pas été chargées, les index
			// `id → legacy_id` sont vides : chaque produit part alors sans marque
			// et sans catégorie, et le serveur l'écrit sans broncher — il ne
			// décide de rien, c'est le contrat (§2). Le résultat est une base de
			// site silencieusement amputée de toutes ses relations.
			//
			// Un export ne doit jamais partir sur des relations qu'on n'a pas pu
			// résoudre. Mieux vaut ne rien envoyer et le dire.
			const referencesCategories = selection.some(
				(p) => (p.categories ?? []).length > 0,
			)
			const referencesBrands = selection.some((p) => Boolean(p.brand))

			if (referencesCategories && !categories.data?.length) {
				toast.error(
					'Export annulé : les catégories ne sont pas chargées. ' +
						'Les produits partiraient sans aucun rattachement.',
				)
				return
			}
			if (referencesBrands && !brands.data?.length) {
				toast.error(
					'Export annulé : les marques ne sont pas chargées. ' +
						'Les produits partiraient sans marque.',
				)
				return
			}

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
		[categories.data, brands.data, brandsById, exportCatalog],
	)

	// ── Ouverture de l'éditeur ───────────────────────────────────────────────
	// La fiche est relue dans les données FRAÎCHES au moment du clic, jamais
	// prise dans l'objet que le composant porte : `selectedCategory` est un nœud
	// d'arbre figé dans un état React, et rouvrir l'éditeur après une première
	// modification y montrerait le texte d'avant.
	const editProduct = useCallback(
		(product: CatalogProduct) => {
			setEditing({
				kind: 'product',
				id: product.id,
				name: product.name,
				description: product.description,
				designation: product.designation,
				sku: product.sku,
				brand: product.brand ? brandsById.get(product.brand)?.name : undefined,
				categories: (product.categories ?? [])
					.map((id) => categoriesById.get(id)?.name)
					.filter((name): name is string => Boolean(name)),
			})
		},
		[brandsById, categoriesById],
	)

	const editCategory = useCallback(
		(id: string) => {
			const fresh = (categories.data ?? []).find((c) => c.id === id)
			if (!fresh) return
			setEditing({
				kind: 'category',
				id: fresh.id,
				name: fresh.name,
				description: fresh.description,
			})
		},
		[categories.data],
	)

	const editBrand = useCallback(
		(brand: CatalogBrand) => {
			const fresh = brandsById.get(brand.id) ?? brand
			setEditing({
				kind: 'brand',
				id: fresh.id,
				name: fresh.name,
				description: fresh.description,
			})
		},
		[brandsById],
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

					{/* Distinguer la panne du résultat métier. « Aucune catégorie en
				    ligne » est une conclusion ; une collection vide alors que les
				    produits en citent est une PANNE DE LECTURE, et le dire évite de
				    chercher le défaut du mauvais côté. */}
					{!categories.isFetching && !categories.data?.length && (
						<Card className='mb-6 border-destructive'>
							<CardContent className='flex items-start gap-3 pt-6'>
								<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-destructive' />
								<div>
									<p className='font-medium'>
										Les catégories n'ont pas été lues
									</p>
									<p className='text-muted-foreground text-sm'>
										{categories.error
											? String(categories.error)
											: 'La collection est revenue vide. L’arbre et les rattachements sont donc faux, et l’export est bloqué.'}
									</p>
								</div>
							</CardContent>
						</Card>
					)}

					{!brands.isFetching && !brands.data?.length && (
						<Card className='mb-6 border-destructive'>
							<CardContent className='flex items-start gap-3 pt-6'>
								<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-destructive' />
								<div>
									<p className='font-medium'>Les marques n'ont pas été lues</p>
									<p className='text-muted-foreground text-sm'>
										{brands.error
											? String(brands.error)
											: 'La collection est revenue vide. Les produits partiraient sans marque : l’export est bloqué.'}
									</p>
								</div>
							</CardContent>
						</Card>
					)}

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

					{/* Les retouches de texte isolées : elles ne partent QUE si on le
					    demande, mais elles ne doivent pas se taire (docs/DECISIONS.md,
					    2026-08-13). Une modification qui accompagne un produit, elle,
					    part déjà toute seule avec lui. */}
					{(staleRelations.categories.length > 0 ||
						staleRelations.brands.length > 0) && (
						<Card className='mb-6 border-amber-500/50'>
							<CardContent className='flex flex-wrap items-center justify-between gap-3 pt-6'>
								<div className='text-sm'>
									<p className='font-medium'>
										{staleRelations.categories.length} catégorie(s) et{' '}
										{staleRelations.brands.length} marque(s) modifiées depuis
										leur dernier envoi
									</p>
									<p className='text-muted-foreground'>
										Leur texte a changé ici, pas encore sur le site. Les
										produits, eux, ne sont pas concernés.
									</p>
								</div>
								<Button
									variant='secondary'
									disabled={exportCatalog.isPending}
									onClick={() =>
										exportCatalog.mutate({
											products: [],
											categories: staleRelations.categories,
											brands: staleRelations.brands,
										})
									}
								>
									<RefreshCw className='mr-1.5 h-4 w-4' />
									Envoyer ces textes
								</Button>
							</CardContent>
						</Card>
					)}

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

					{/* ── Filtres produit ───────────────────────────────────────── */}
					<div className='mb-4 flex flex-col gap-2 sm:flex-row'>
						<div className='relative flex-1'>
							<Search className='-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground' />
							<Input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder='Rechercher un produit en ligne (nom, référence)…'
								className='pl-9'
							/>
						</div>
						<Toggle
							variant='outline'
							pressed={onlyModified}
							onPressedChange={setOnlyModified}
							disabled={!inventory.data}
							aria-label='Afficher uniquement les produits à mettre à jour'
							title={
								inventory.data
									? 'Afficher uniquement les produits modifiés depuis leur dernier export'
									: 'L’état du site doit être disponible pour utiliser ce filtre'
							}
							className='shrink-0'
						>
							<RefreshCw className='h-4 w-4' />À mettre à jour (
							{syncCounts.modified})
						</Toggle>
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
										{/* La description d'une catégorie s'édite depuis la
										    catégorie sélectionnée, et non depuis l'arbre : une
										    rangée de crayons dans un arbre de 463 lignes ferait
										    un champ de mines pour le clic de sélection. */}
										{selectedCategory && (
											<button
												type='button'
												onClick={() =>
													editCategory(selectedCategory.category.id)
												}
												className='inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-accent'
												title='Modifier la description affichée sur le site'
											>
												<Pencil className='h-3 w-3' />
												Description
											</button>
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
										onEdit={editProduct}
										emptyLabel={
											onlyModified
												? 'Aucun produit à mettre à jour avec ces filtres.'
												: selectedBrand
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
								onEdit={editBrand}
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
								onEdit={editProduct}
							/>
						</section>
					)}

					{/* Monté une fois pour les trois genres : la cible dit lequel. */}
					<EditorialDialog target={editing} onClose={() => setEditing(null)} />
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
