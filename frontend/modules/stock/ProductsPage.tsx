// frontend/modules/stock/ProductsPage.tsx
//
// LES PRODUITS POCKETBASE — LECTURE ET ÉCRITURE, 13 août 2026.
//
// Quatrième et dernière entité affichée depuis PocketBase. Elle est d'une autre
// nature que les trois précédentes, et l'écran le dit plutôt que de le cacher :
//
//   • le STOCK est modifié par la caisse, qui écrit dans NeDB ;
//   • le PRIX part sur le ticket ;
//   • ils sont 2999, donc la pagination est une contrainte de requête et non un
//     confort d'affichage — d'où `useCatalogProducts`, paginé côté serveur.
//
// L'ÉCRITURE EST OUVERTE depuis le 13 août 2026 : la prochaine version retire
// AppPos de la logique, donc la question « où vit la vérité du prix et du
// stock » est tranchée par le calendrier (docs/DECISIONS.md). La caisse et
// l'inventaire se raccordent en dernier ; jusque-là les deux bases peuvent
// diverger, et c'est accepté.

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBrands } from '@/lib/queries/brands'
import { PRODUCT_HEALTH_MAX } from '@/lib/queries/catalog-health'
import {
	type CatalogCommercialStateFilter,
	type CatalogProductStatus,
	type CatalogSaleStateFilter,
	useCatalogProducts,
} from '@/lib/queries/catalog-products'
import { type StockProductRow, toStockRow } from '@/lib/queries/catalog-rows'
import { useCategories } from '@/lib/queries/categories'
import {
	collectBranchIds,
	toCategoryOptions,
} from '@/lib/queries/category-tree'
import { useCatalogCounts } from '@/lib/queries/products'
import { useSuppliers } from '@/lib/queries/suppliers'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import type { SortingState } from '@tanstack/react-table'
import {
	AlertTriangle,
	Check,
	ChevronDown,
	ChevronsUpDown,
	CircleDollarSign,
	FileText,
	ImageOff,
	Loader2,
	PackageX,
	Plus,
	Search,
	SlidersHorizontal,
	X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useEtatPersistant } from '@/lib/hooks/useEtatPersistant'

import { CatalogProductDialog } from './components/CatalogProductDialog'
import {
	DeleteProductDialog,
	type ProduitASupprimer,
} from './components/DeleteProductDialog'
import { PaginationBar } from './components/PaginationBar'
import { ProductCategoryFilterTree } from './components/ProductCategoryFilterTree'
import { ProductTable } from './components/ProductTable'

const PER_PAGE = 25
const NO_RELATION_FILTER = '__none__'
const HEALTH_OPTIONS = Array.from(
	{ length: PRODUCT_HEALTH_MAX + 1 },
	(_, index) => {
		const score = PRODUCT_HEALTH_MAX - index
		const detail =
			score === PRODUCT_HEALTH_MAX
				? 'Prête'
				: score === 0
					? 'Fiche vide'
					: `${PRODUCT_HEALTH_MAX - score} élément${PRODUCT_HEALTH_MAX - score > 1 ? 's' : ''} à compléter`
		return {
			value: String(score),
			label: `${score}/${PRODUCT_HEALTH_MAX} · ${detail}`,
		}
	},
)
const COMMERCIAL_STATE_LABELS: Record<CatalogCommercialStateFilter, string> = {
	new: 'Neuf',
	used: 'Occasion',
	rental: 'Location',
}
const SALE_STATE_LABELS: Record<CatalogSaleStateFilter, string> = {
	regular: 'Plein tarif',
	sale: 'Soldé',
	promo: 'Promotion',
}
// Les gardes de la mémoire d'écran. Elles ne défendent pas contre l'utilisateur
// mais contre NOUS : une valeur écrite par une version antérieure — un filtre
// retiré, une colonne de tri renommée — partirait au serveur et rendrait une
// liste vide sans expliquer pourquoi. Rejetée, elle repart de la valeur
// initiale.
const estChaine = (valeur: unknown) => typeof valeur === 'string'
const estBooleen = (valeur: unknown) => typeof valeur === 'boolean'
const estPageValide = (valeur: unknown) =>
	typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 1
const estStatutValide = (valeur: unknown) =>
	valeur === undefined || valeur === 'draft' || valeur === 'published'
const estScoreSanteValide = (valeur: unknown) =>
	typeof valeur === 'string' &&
	(valeur === '' || HEALTH_OPTIONS.some((option) => option.value === valeur))
const estEtatCommercialValide = (valeur: unknown) =>
	valeur === '' ||
	(typeof valeur === 'string' && valeur in COMMERCIAL_STATE_LABELS)
const estEtatVenteValide = (valeur: unknown) =>
	valeur === '' || (typeof valeur === 'string' && valeur in SALE_STATE_LABELS)
const estTriValide = (valeur: unknown) =>
	Array.isArray(valeur) &&
	valeur.every(
		(entree) =>
			typeof entree === 'object' &&
			entree !== null &&
			typeof (entree as { id?: unknown }).id === 'string' &&
			typeof (entree as { desc?: unknown }).desc === 'boolean' &&
			(entree as { id: string }).id in CATALOG_SORT_FIELDS,
	)

export function ProductsPage() {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase()
	const navigate = useNavigate()

	// TOUT CE QUI CIRCONSCRIT LA LISTE SURVIT À LA SORTIE DE L'ÉCRAN
	// (4 septembre 2026). Ouvrir une fiche produit démonte cette page : sans
	// mémoire, on revenait page 1, sans recherche et sans filtre, à chaque
	// retour. Une clé par état, toutes relues sous validation — voir
	// `useEtatPersistant`. Le dialogue de création, lui, n'est PAS persisté :
	// rouvrir une modale toute seule au montage serait une surprise, pas un
	// confort.
	const [search, setSearch] = useEtatPersistant(
		'stock-produits-recherche',
		'',
		estChaine,
	)
	// Le débounce ne repart pas de vide : la valeur restaurée est déjà « posée »,
	// sinon le premier rendu demanderait les 2999 produits avant de se corriger.
	const [debounced, setDebounced] = useState(search)
	const [page, setPage] = useEtatPersistant(
		'stock-produits-page',
		1,
		estPageValide,
	)
	const [status, setStatus] = useEtatPersistant<
		CatalogProductStatus | undefined
	>('stock-produits-statut', undefined, estStatutValide)
	const [brandId, setBrandId] = useEtatPersistant(
		'stock-produits-marque',
		'',
		estChaine,
	)
	const [categoryId, setCategoryId] = useEtatPersistant(
		'stock-produits-categorie',
		'',
		estChaine,
	)
	const [supplierId, setSupplierId] = useEtatPersistant(
		'stock-produits-fournisseur',
		'',
		estChaine,
	)
	const [missingImage, setMissingImage] = useEtatPersistant(
		'stock-produits-sans-image',
		false,
		estBooleen,
	)
	const [missingDescription, setMissingDescription] = useEtatPersistant(
		'stock-produits-sans-description',
		false,
		estBooleen,
	)
	const [missingPurchasePrice, setMissingPurchasePrice] = useEtatPersistant(
		'stock-produits-sans-prix-achat',
		false,
		estBooleen,
	)
	const [emptyStock, setEmptyStock] = useEtatPersistant(
		'stock-produits-stock-vide',
		false,
		estBooleen,
	)
	const [healthScore, setHealthScore] = useEtatPersistant(
		'stock-produits-sante',
		'',
		estScoreSanteValide,
	)
	const [commercialState, setCommercialState] = useEtatPersistant<
		CatalogCommercialStateFilter | ''
	>('stock-produits-etat-commercial', '', estEtatCommercialValide)
	const [saleState, setSaleState] = useEtatPersistant<
		CatalogSaleStateFilter | ''
	>('stock-produits-etat-vente', '', estEtatVenteValide)
	const [sorting, setSorting] = useEtatPersistant<SortingState>(
		'stock-produits-tri',
		[{ id: 'created', desc: true }],
		estTriValide,
	)
	const [dialogOpen, setDialogOpen] = useState(false)
	/** La fiche dont on demande la suppression. `null` = aucune confirmation
	 *  ouverte. On garde l'ENREGISTREMENT et non la ligne de table : la
	 *  suppression a besoin du `legacy_id`, que `StockProductRow` ne porte pas —
	 *  les documents anciens désignent le produit par son identifiant NeDB. */
	const [produitASupprimer, setProduitASupprimer] =
		useState<ProduitASupprimer | null>(null)
	const previousCompanyId = useRef(activeCompanyId)

	const openCreate = () => {
		setDialogOpen(true)
	}

	// La recherche part au serveur : la lancer à chaque frappe ferait 2999
	// produits interrogés une fois par lettre. 300 ms suffisent à ne plus le
	// sentir tout en n'envoyant qu'une requête par mot tapé.
	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(search), 300)
		return () => window.clearTimeout(timer)
	}, [search])

	// Les identifiants de marque, catégorie et fournisseur appartiennent à une
	// entreprise. Les conserver lors d'un changement d'entreprise fabriquerait
	// un filtre invisible et impossible à satisfaire dans le nouveau catalogue.
	useEffect(() => {
		if (previousCompanyId.current === activeCompanyId) return
		previousCompanyId.current = activeCompanyId
		setBrandId('')
		setCategoryId('')
		setSupplierId('')
		setMissingImage(false)
		setMissingDescription(false)
		setMissingPurchasePrice(false)
		setEmptyStock(false)
		setHealthScore('')
		setCommercialState('')
		setSaleState('')
		setPage(1)
		// Les setters de `useEtatPersistant` sont ceux de `useState` : stables
		// pour la vie du composant. Ils sont listés parce que le linter ne les
		// reconnaît plus comme tels, pas parce qu'ils changent.
	}, [
		activeCompanyId,
		setBrandId,
		setCategoryId,
		setSupplierId,
		setMissingImage,
		setMissingDescription,
		setMissingPurchasePrice,
		setEmptyStock,
		setHealthScore,
		setCommercialState,
		setSaleState,
		setPage,
	])

	const categories = useCategories({ companyId: activeCompanyId ?? undefined })
	const catalogCounts = useCatalogCounts(activeCompanyId ?? undefined)

	// Filtrer sur une catégorie, c'est filtrer sur SA BRANCHE : les produits sont
	// rattachés aux feuilles, jamais aux ancêtres. Sans cela, « Guitares » ne
	// rendrait que les rares produits posés sur le nœud lui-même.
	//
	// Le repli sur `[categoryId]` n'est pas une précaution de style : une liste
	// VIDE serait comprise comme « pas de filtre » et afficherait les 2999
	// produits sous une catégorie qui n'en a aucun. Il sert deux fois — pendant
	// le chargement des catégories, et si la catégorie choisie a disparu.
	const categoryBranch = useMemo(() => {
		if (!categoryId || categoryId === NO_RELATION_FILTER) return undefined
		const branche = collectBranchIds(categories.data ?? [], categoryId)
		return branche.length ? branche : [categoryId]
	}, [categories.data, categoryId])

	// Les branches vides disparaissent de l'arbre latéral. `total` compte déjà
	// toute la sous-arborescence : le serveur a remonté l'information, il n'y a
	// plus rien à recalculer depuis les produits dans le navigateur.
	const populatedCategoryIds = useMemo(() => {
		const peuplees = new Set<string>()
		for (const [id, compte] of Object.entries(
			catalogCounts.data?.parCategorie ?? {},
		)) {
			if (compte.total > 0) peuplees.add(id)
		}
		return peuplees
	}, [catalogCounts.data])
	const categoryOptions = useMemo(
		() =>
			catalogCounts.data
				? toCategoryOptions(categories.data ?? []).filter((category) =>
						populatedCategoryIds.has(category.id),
					)
				: [],
		[categories.data, catalogCounts.data, populatedCategoryIds],
	)

	// Une catégorie peut devenir vide après une réaffectation ou un nouvel
	// import. Elle disparaît alors des choix et ne doit pas rester sélectionnée
	// comme un filtre invisible.
	useEffect(() => {
		if (!categoryId || categoryId === NO_RELATION_FILTER || !catalogCounts.data)
			return
		if (populatedCategoryIds.has(categoryId)) return
		setCategoryId('')
		setPage(1)
	}, [
		categoryId,
		populatedCategoryIds,
		catalogCounts.data,
		setCategoryId,
		setPage,
	])

	const products = useCatalogProducts({
		companyId: activeCompanyId ?? undefined,
		page,
		perPage: PER_PAGE,
		search: debounced || undefined,
		status,
		brandId: brandId && brandId !== NO_RELATION_FILTER ? brandId : undefined,
		withoutBrand: brandId === NO_RELATION_FILTER,
		categoryIds: categoryBranch,
		withoutCategory: categoryId === NO_RELATION_FILTER,
		supplierId:
			supplierId && supplierId !== NO_RELATION_FILTER ? supplierId : undefined,
		withoutSupplier: supplierId === NO_RELATION_FILTER,
		missingImage,
		missingDescription,
		missingPurchasePrice,
		emptyStock,
		commercialState: commercialState || undefined,
		saleState: saleState || undefined,
		healthScore: healthScore === '' ? undefined : Number(healthScore),
		sort: toCatalogSort(sorting),
	})

	const brands = useBrands({ companyId: activeCompanyId ?? undefined })
	const suppliers = useSuppliers({ companyId: activeCompanyId ?? undefined })

	const brandById = useMemo(
		() => new Map((brands.data ?? []).map((b) => [b.id, b.name])),
		[brands.data],
	)
	const categoryById = useMemo(
		() => new Map((categories.data ?? []).map((c) => [c.id, c.name])),
		[categories.data],
	)
	const supplierById = useMemo(
		() => new Map((suppliers.data ?? []).map((s) => [s.id, s.name])),
		[suppliers.data],
	)

	// Les lignes affichées : produits PocketBase, relations résolues en mémoire,
	// image résolue par `pb.files.getUrl`. Une seule provenance, du haut en bas.
	const rows = useMemo(
		() =>
			(products.data?.items ?? []).map((product) =>
				toStockRow(product, {
					brandById,
					supplierById,
					categoryById,
					fileUrl: (record, filename) => pb.files.getUrl(record, filename),
				}),
			),
		[products.data, brandById, supplierById, categoryById, pb],
	)

	// La ligne mène à la fiche complète. La modale reste disponible pour la
	// création rapide et sera allégée dans l'étape suivante du chantier.
	//
	// Les deux rappels sont STABLES, et pas par habitude : `ProductTable`
	// mémorise ses colonnes sur `onDelete`. Une lambda écrite dans le JSX en
	// ferait une identité neuve à chaque rendu — donc des colonnes reconstruites
	// et les caches de TanStack invalidés pour les 25 lignes, à chaque frappe
	// dans la recherche.
	const ouvrirFiche = useCallback(
		(row: StockProductRow) => {
			void navigate({
				to: '/stock/produits/$productId',
				params: { productId: row.id },
			})
		},
		[navigate],
	)

	const demanderSuppression = useCallback(
		(row: StockProductRow) => {
			// La ligne de table ne porte pas `legacy_id` : on retrouve
			// l'enregistrement de la page courante, qui l'a.
			const record = products.data?.items.find((item) => item.id === row.id)
			setProduitASupprimer({
				id: row.id,
				name: row.name,
				legacy_id: record?.legacy_id,
				status: row.status,
			})
		},
		[products.data],
	)

	// Toute recherche et tout changement de filtre ramènent à la page 1 : rester
	// en page 7 d'un résultat qui n'en compte que 2 donnerait un écran vide sans
	// dire pourquoi.
	const changeSearch = (value: string) => {
		setSearch(value)
		setPage(1)
	}

	const changeStatus = (value: CatalogProductStatus | undefined) => {
		setStatus(value)
		setPage(1)
	}

	const changeFilter = (setter: (v: string) => void) => (value: string) => {
		setter(value)
		setPage(1)
	}

	// Changer de page sans remonter laisserait l'œil au milieu d'un tableau dont
	// les 25 lignes ont toutes changé. Ce n'est plus la PAGE qu'on remonte — elle
	// ne défile plus — mais la zone défilante de la table, et c'est elle qui le
	// fait, sur changement de lignes (`ProductTable`).

	const changeSorting = (nextSorting: SortingState) => {
		setSorting(nextSorting)
		setPage(1)
	}

	const activeFilterTags: {
		key: string
		label: string
		clear: () => void
	}[] = []
	if (brandId) {
		activeFilterTags.push({
			key: 'brand',
			label:
				brandId === NO_RELATION_FILTER
					? 'Aucune marque'
					: `Marque · ${brandById.get(brandId) ?? 'Sélectionnée'}`,
			clear: () => {
				setBrandId('')
				setPage(1)
			},
		})
	}
	if (categoryId) {
		activeFilterTags.push({
			key: 'category',
			label:
				categoryId === NO_RELATION_FILTER
					? 'Aucune catégorie'
					: `Catégorie · ${categoryById.get(categoryId) ?? 'Sélectionnée'}`,
			clear: () => {
				setCategoryId('')
				setPage(1)
			},
		})
	}
	if (supplierId) {
		activeFilterTags.push({
			key: 'supplier',
			label:
				supplierId === NO_RELATION_FILTER
					? 'Aucun fournisseur'
					: `Fournisseur · ${supplierById.get(supplierId) ?? 'Sélectionné'}`,
			clear: () => {
				setSupplierId('')
				setPage(1)
			},
		})
	}
	if (missingImage) {
		activeFilterTags.push({
			key: 'missing-image',
			label: 'Sans image',
			clear: () => {
				setMissingImage(false)
				setPage(1)
			},
		})
	}
	if (missingDescription) {
		activeFilterTags.push({
			key: 'missing-description',
			label: 'Sans description',
			clear: () => {
				setMissingDescription(false)
				setPage(1)
			},
		})
	}
	if (missingPurchasePrice) {
		activeFilterTags.push({
			key: 'missing-purchase-price',
			label: 'Sans prix d’achat',
			clear: () => {
				setMissingPurchasePrice(false)
				setPage(1)
			},
		})
	}
	if (emptyStock) {
		activeFilterTags.push({
			key: 'empty-stock',
			label: 'Stock vide ou à 0',
			clear: () => {
				setEmptyStock(false)
				setPage(1)
			},
		})
	}
	if (healthScore !== '') {
		activeFilterTags.push({
			key: 'health',
			label: `Santé · ${healthScore}/${PRODUCT_HEALTH_MAX}`,
			clear: () => {
				setHealthScore('')
				setPage(1)
			},
		})
	}
	if (commercialState) {
		activeFilterTags.push({
			key: 'commercial-state',
			label: `État · ${COMMERCIAL_STATE_LABELS[commercialState]}`,
			clear: () => {
				setCommercialState('')
				setPage(1)
			},
		})
	}
	if (saleState) {
		activeFilterTags.push({
			key: 'sale-state',
			label: `Opération · ${SALE_STATE_LABELS[saleState]}`,
			clear: () => {
				setSaleState('')
				setPage(1)
			},
		})
	}
	const filterCount = activeFilterTags.length
	const filtresActifs = filterCount > 0
	const clearFilters = () => {
		setBrandId('')
		setCategoryId('')
		setSupplierId('')
		setMissingImage(false)
		setMissingDescription(false)
		setMissingPurchasePrice(false)
		setEmptyStock(false)
		setHealthScore('')
		setCommercialState('')
		setSaleState('')
		setPage(1)
	}

	const total = products.data?.totalItems ?? 0
	const totalPages = products.data?.totalPages ?? 1

	return (
		// LE CADRE NE DÉFILE PAS, SES DEUX PANNEAUX SI (5 septembre 2026).
		//
		// L'écran tenait dans la page : barre collante, arbre collant, et une
		// table à hauteur bornée qui portait SON PROPRE ascenseur. Trois
		// scrollports imbriqués dans un quatrième — le document. La molette
		// s'accrochait alors au conteneur intérieur et n'en repartait qu'après un
		// mouvement de souris (le « latch » de Chrome), et l'en-tête de la table
		// glissait hors de vue dès qu'on descendait la page elle-même, puisqu'il
		// ne collait qu'à son propre conteneur.
		//
		// À partir de `lg` la page prend exactement la hauteur restante et ne
		// déborde plus : le document n'a plus d'ascenseur, il n'en reste qu'UN par
		// panneau — l'arbre et la table —, et les deux en-têtes sont hors de leur
		// zone défilante, donc toujours visibles sans `sticky`. Sous `lg` l'arbre
		// n'est pas rendu : la page reprend sa hauteur naturelle et sa barre
		// redevient collante.
		<div className='flex flex-col lg:h-[calc(100dvh-var(--header-h))] lg:overflow-hidden'>
			{products.error && (
				<Card className='m-3 shrink-0 border-destructive'>
					<CardContent className='flex items-start gap-3 pt-6'>
						<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-destructive' />
						<div>
							<p className='font-medium'>Lecture du catalogue impossible</p>
							<p className='text-muted-foreground text-sm'>
								{String(products.error)}
							</p>
						</div>
					</CardContent>
				</Card>
			)}

			<div className='sticky top-header z-30 shrink-0 border-b bg-background px-3 py-2 shadow-sm lg:static'>
				<div className='flex min-w-0 items-center gap-2.5'>
					<div className='group relative min-w-36 flex-1 sm:max-w-48 lg:max-w-56 xl:max-w-64'>
						<Search className='-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-primary' />
						<Input
							autoFocus
							value={search}
							onChange={(event) => changeSearch(event.target.value)}
							placeholder='Rechercher…'
							aria-label='Rechercher un produit'
							className='h-10 rounded-md border-input bg-sky-50/80 pl-9 text-primary shadow-sm transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground hover:bg-sky-50 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/15 focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:ring-offset-0 dark:bg-sky-950/35 dark:text-foreground dark:focus:bg-background'
						/>
					</div>

					<Popover>
						<PopoverTrigger asChild>
							<Button
								variant='outline'
								size='sm'
								className='h-10 shrink-0 rounded-md border-input bg-violet-50/80 px-3.5 text-primary shadow-sm hover:bg-violet-100 hover:text-primary dark:bg-violet-950/35 dark:text-foreground dark:hover:bg-violet-900/55'
							>
								<SlidersHorizontal className='mr-1.5 h-4 w-4' />
								Filtres
								{filtresActifs && (
									<span className='ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-primary-foreground text-xs tabular-nums'>
										{filterCount}
									</span>
								)}
								<ChevronDown className='ml-1.5 h-3.5 w-3.5' />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align='start'
							className='max-h-[min(38rem,var(--radix-popover-content-available-height))] w-80 overflow-y-auto p-2'
						>
							<div className='px-2 py-1 font-semibold text-sm'>
								Filtrer les produits
							</div>
							<div className='space-y-3 p-2'>
								<div className='space-y-3 lg:hidden'>
									<CompactFilterField label='Catégorie'>
										<FilterSelect
											value={categoryId}
											onChange={changeFilter(setCategoryId)}
											vide='Toutes les catégories'
											noneLabel='Aucune catégorie'
											recherche='Rechercher une catégorie…'
											options={categoryOptions}
											loading={categories.isLoading || catalogCounts.isLoading}
										/>
									</CompactFilterField>
									<CompactFilterField label='Marque'>
										<FilterSelect
											value={brandId}
											onChange={changeFilter(setBrandId)}
											vide='Toutes les marques'
											noneLabel='Aucune marque'
											recherche='Rechercher une marque…'
											options={brands.data ?? []}
										/>
									</CompactFilterField>
									<CompactFilterField label='Fournisseur'>
										<FilterSelect
											value={supplierId}
											onChange={changeFilter(setSupplierId)}
											vide='Tous les fournisseurs'
											noneLabel='Aucun fournisseur'
											recherche='Rechercher un fournisseur…'
											options={suppliers.data ?? []}
										/>
									</CompactFilterField>
								</div>
								<CompactFilterField label='Santé'>
									<ChoiceFilter
										value={healthScore}
										onChange={(value) => {
											setHealthScore(value)
											setPage(1)
										}}
										ariaLabel='Filtrer par santé'
										emptyLabel='Toutes les notes'
										options={HEALTH_OPTIONS}
									/>
								</CompactFilterField>
								<CompactFilterField label='État commercial'>
									<ChoiceFilter
										value={commercialState}
										onChange={(value) => {
											setCommercialState(
												value as CatalogCommercialStateFilter | '',
											)
											setPage(1)
										}}
										ariaLabel='Filtrer par état commercial'
										emptyLabel='Tous les états'
										options={[
											{ value: 'new', label: 'Neuf' },
											{ value: 'used', label: 'Occasion' },
											{ value: 'rental', label: 'Location' },
										]}
									/>
								</CompactFilterField>
								<CompactFilterField label='Opération commerciale'>
									<ChoiceFilter
										value={saleState}
										onChange={(value) => {
											setSaleState(value as CatalogSaleStateFilter | '')
											setPage(1)
										}}
										ariaLabel='Filtrer par opération commerciale'
										emptyLabel='Toutes les opérations'
										options={[
											{ value: 'regular', label: 'Plein tarif' },
											{ value: 'sale', label: 'Soldé' },
											{ value: 'promo', label: 'Promotion' },
										]}
									/>
								</CompactFilterField>
							</div>
							<div className='my-1 h-px bg-border' />
							<div className='space-y-1 p-1'>
								<CompactBooleanFilter
									checked={missingImage}
									onChange={(checked) => {
										setMissingImage(checked)
										setPage(1)
									}}
									icon={<ImageOff />}
									label='Sans image'
								/>
								<CompactBooleanFilter
									checked={missingDescription}
									onChange={(checked) => {
										setMissingDescription(checked)
										setPage(1)
									}}
									icon={<FileText />}
									label='Sans description'
								/>
								<CompactBooleanFilter
									checked={missingPurchasePrice}
									onChange={(checked) => {
										setMissingPurchasePrice(checked)
										setPage(1)
									}}
									icon={<CircleDollarSign />}
									label='Sans prix d’achat'
								/>
								<CompactBooleanFilter
									checked={emptyStock}
									onChange={(checked) => {
										setEmptyStock(checked)
										setPage(1)
									}}
									icon={<PackageX />}
									label='Stock vide ou à 0'
								/>
							</div>
							{filtresActifs && (
								<Button
									variant='ghost'
									size='sm'
									className='mt-1 w-full'
									onClick={clearFilters}
								>
									<X className='mr-1 h-4 w-4' />
									Réinitialiser les filtres
								</Button>
							)}
						</PopoverContent>
					</Popover>

					<div className='hidden h-10 shrink-0 items-center gap-1 rounded-md border border-input bg-background p-1 shadow-sm lg:flex'>
						<StatusChip
							tone='all'
							active={status === undefined}
							onClick={() => changeStatus(undefined)}
						>
							Tous
						</StatusChip>
						<StatusChip
							tone='published'
							active={status === 'published'}
							onClick={() => changeStatus('published')}
						>
							Publiés
						</StatusChip>
						<StatusChip
							tone='draft'
							active={status === 'draft'}
							onClick={() => changeStatus('draft')}
						>
							Brouillons
						</StatusChip>
					</div>

					<div className='min-w-2 flex-1' />

					{/* La pagination est descendue SOUS la table le 5 septembre 2026 :
					    le cadre à hauteur fixe lui donne un pied de tableau visible,
					    et elle y gagne les numéros de page. Voir `PaginationBar`. */}

					<Button className='shrink-0' onClick={openCreate}>
						<Plus className='mr-2 h-4 w-4' />
						Nouveau produit
					</Button>
				</div>

				<div className='mt-1.5 flex min-h-6 min-w-0 items-start gap-2'>
					<div className='flex w-36 shrink-0 items-center gap-2 font-medium text-sm sm:w-48 lg:w-56 xl:w-64'>
						<span className='h-2 w-2 shrink-0 rounded-full bg-emerald-600' />
						<span className='truncate tabular-nums'>
							{products.isLoading
								? '…'
								: `${total} produit${total > 1 ? 's' : ''}`}
						</span>
					</div>

					{filtresActifs && (
						<div className='flex min-w-0 flex-1 flex-wrap items-center gap-1.5'>
							{activeFilterTags.map((filter) => (
								<button
									type='button'
									key={filter.key}
									onClick={filter.clear}
									aria-label={`Retirer le filtre ${filter.label}`}
									className={cn(
										'inline-flex h-6 max-w-56 items-center gap-1 rounded-full border border-primary/20 px-2 font-medium text-[11px] text-primary transition-colors hover:border-primary/40',
										filterTagTone(filter.key),
									)}
								>
									<span className='truncate'>{filter.label}</span>
									<X className='h-3 w-3 shrink-0' />
								</button>
							))}
						</div>
					)}
				</div>
			</div>

			{/* `lg:grid-rows-[minmax(0,1fr)]` n'est pas décoratif : sans lui la
			    ligne se dimensionnerait sur son contenu, les deux panneaux
			    déborderaient du cadre — qui est en `overflow-hidden` — et le bas de
			    la table serait coupé au lieu de défiler. */}
			<div className='grid min-h-0 items-start gap-3 p-3 lg:flex-1 lg:grid-cols-[17rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch'>
				<div className='hidden lg:contents'>
					<ProductCategoryFilterTree
						categories={categories.data ?? []}
						brands={brands.data ?? []}
						suppliers={suppliers.data ?? []}
						counts={catalogCounts.data}
						categoryValue={categoryId}
						brandValue={brandId}
						supplierValue={supplierId}
						noneValue={NO_RELATION_FILTER}
						onCategoryChange={(value) => {
							setCategoryId(value)
							setPage(1)
						}}
						onBrandChange={(value) => {
							setBrandId(value)
							setPage(1)
						}}
						onSupplierChange={(value) => {
							setSupplierId(value)
							setPage(1)
						}}
						loading={{
							category: categories.isLoading || catalogCounts.isLoading,
							brand: brands.isLoading,
							supplier: suppliers.isLoading,
						}}
					/>
				</div>

				<Card className='flex min-h-0 min-w-0 flex-col overflow-hidden lg:h-full'>
					<CardContent
						// Aucun padding : la table prend toute la largeur de la carte, qui
						// lui sert de cadre. Et la page précédente reste lisible pendant le
						// chargement de la suivante, grisée — la table ne se vide pas.
						className={cn(
							'flex min-h-0 flex-1 flex-col p-0',
							products.isFetching && 'opacity-60',
						)}
					>
						{/* Un écran vide doit dire POURQUOI il est vide. Sans ces trois cas,
					    « aucune entreprise active », « lecture en cours » et « 0 résultat
					    pour ces filtres » se ressemblent tous : une table sans ligne. */}
						{!activeCompanyId ? (
							<p className='flex flex-1 items-center justify-center p-12 text-center text-muted-foreground'>
								Aucune entreprise active — sélectionnez-en une pour voir le
								catalogue.
							</p>
						) : products.isLoading ? (
							<div className='flex flex-1 items-center justify-center gap-3 p-12 text-muted-foreground'>
								<Loader2 className='h-5 w-5 animate-spin' />
								<span className='text-sm'>Lecture du catalogue…</span>
							</div>
						) : rows.length === 0 ? (
							<div className='flex flex-1 flex-col items-center justify-center p-12 text-center text-muted-foreground'>
								<p>Aucun produit ne correspond.</p>
								<p className='mt-1 text-sm'>
									{filtresActifs || debounced || status
										? 'Des filtres sont actifs.'
										: `Le catalogue en compte ${total}.`}
								</p>
							</div>
						) : (
							/* `paginated={false}` : la page vient du serveur. Paginer une
					   seconde fois en mémoire afficherait « 1–10 sur 25 » sous une
					   table qui en montre 25. */
							<ProductTable
								data={rows}
								paginated={false}
								sorting={sorting}
								onSortingChange={changeSorting}
								onRowClick={ouvrirFiche}
								onDelete={demanderSuppression}
							/>
						)}

						{/* Sous la zone défilante, donc toujours visible : c'est ce que
						    le cadre à hauteur fixe a rendu possible. Elle ne s'affiche
						    qu'avec des lignes — trois messages de vide n'ont pas de
						    « page 1 sur 1 » à annoncer. */}
						{activeCompanyId && !products.isLoading && rows.length > 0 && (
							<PaginationBar
								page={page}
								totalPages={totalPages}
								total={total}
								perPage={PER_PAGE}
								disabled={products.isFetching}
								onChange={setPage}
							/>
						)}
					</CardContent>
				</Card>
			</div>

			<CatalogProductDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				product={null}
			/>

			<DeleteProductDialog
				produit={produitASupprimer}
				onOpenChange={(ouvert) => !ouvert && setProduitASupprimer(null)}
			/>
		</div>
	)
}

const CATALOG_SORT_FIELDS: Record<string, string> = {
	created: 'created',
	// `name_sort`, pas `name` : SQLite trie en BINARY, donc majuscules d'abord
	// et accents après « Z ». La clé dérivée est calculée à l'écriture par
	// `backend/hooks/product_name_sort_hook.go`. La colonne AFFICHE toujours
	// `name` — la clé ne sert qu'à l'ORDER BY.
	name: 'name_sort',
	price_ttc: 'price_ttc',
	healthScore: 'health',
}

/** Traduit le tri de la table vers la syntaxe PocketBase. Le repli garde le
 * catalogue sur le plus récent même si la table retire momentanément son tri. */
function toCatalogSort(sorting: SortingState) {
	const current = sorting[0]
	const field = current && CATALOG_SORT_FIELDS[current.id]
	if (!current || !field) return '-created'
	return `${current.desc ? '-' : ''}${field}`
}

/** La version serrée du groupe de statut pour la barre de commande unique. */
function StatusChip({
	tone,
	active,
	onClick,
	children,
}: {
	tone: 'all' | 'published' | 'draft'
	active: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	const tones = {
		all: {
			idle: 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60',
		},
		published: {
			idle: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60',
		},
		draft: {
			idle: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60',
		},
	} as const

	return (
		<button
			type='button'
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				'h-8 rounded-md px-2.5 font-medium text-primary text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-foreground',
				active
					? 'bg-primary text-primary-foreground shadow-sm dark:text-primary-foreground'
					: tones[tone].idle,
			)}
		>
			{children}
		</button>
	)
}

/** Les filtres de même nature partagent une couleur, ce qui permet de repérer
 * leur famille sans transformer la barre en arc-en-ciel décoratif. */
function filterTagTone(key: string) {
	if (key === 'brand' || key === 'category' || key === 'supplier') {
		return 'bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/45'
	}
	if (key.startsWith('missing-') || key === 'empty-stock') {
		return 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/45'
	}
	if (key === 'health') {
		return 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/45'
	}
	if (key === 'commercial-state') {
		return 'bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/45'
	}
	return 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/45'
}

function CompactFilterField({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<div className='space-y-1'>
			<p className='px-0.5 font-medium text-muted-foreground text-xs'>
				{label}
			</p>
			{children}
		</div>
	)
}

function CompactBooleanFilter({
	checked,
	onChange,
	icon,
	label,
}: {
	checked: boolean
	onChange: (checked: boolean) => void
	icon: React.ReactNode
	label: string
}) {
	return (
		<button
			type='button'
			onClick={() => onChange(!checked)}
			aria-pressed={checked}
			className={cn(
				'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
				checked ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
			)}
		>
			{icon}
			<span className='flex-1'>{label}</span>
			{checked && <Check />}
		</button>
	)
}

function ChoiceFilter({
	value,
	onChange,
	ariaLabel,
	emptyLabel,
	options,
}: {
	value: string
	onChange: (value: string) => void
	ariaLabel: string
	emptyLabel: string
	options: readonly { value: string; label: string }[]
}) {
	return (
		<select
			value={value}
			onChange={(event) => onChange(event.target.value)}
			aria-label={ariaLabel}
			className='h-10 min-w-[190px] max-w-[260px] rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
		>
			<option value=''>{emptyLabel}</option>
			{options.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	)
}

// Un filtre par entité, sur les listes déjà en cache — 287 marques, 463
// catégories, 43 fournisseurs, toutes lues entières ailleurs. Le filtrage, lui,
// part au SERVEUR : filtrer en mémoire ne verrait que la page affichée.
function FilterSelect({
	value,
	onChange,
	vide,
	noneLabel,
	recherche,
	options,
	loading = false,
}: {
	value: string
	onChange: (value: string) => void
	vide: string
	noneLabel?: string
	recherche: string
	options: { id: string; name: string; depth?: number }[]
	loading?: boolean
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const selected = options.find((option) => option.id === value)
	const selectedLabel =
		value === NO_RELATION_FILTER ? noneLabel : (selected?.name ?? vide)

	const filteredOptions = useMemo(() => {
		const terme = normalizeFilterText(search.trim())
		if (!terme) return options

		// Quand une sous-catégorie correspond, ses parents restent visibles : la
		// recherche réduit l'arbre sans l'aplatir.
		const inclus = new Set<number>()
		const ancetres: number[] = []
		for (const [index, option] of options.entries()) {
			const depth = option.depth ?? 0
			ancetres.length = depth
			if (normalizeFilterText(option.name).includes(terme)) {
				inclus.add(index)
				for (const ancetre of ancetres) inclus.add(ancetre)
			}
			ancetres[depth] = index
		}
		return options.filter((_, index) => inclus.has(index))
	}, [options, search])

	const select = (nextValue: string) => {
		onChange(nextValue)
		setOpen(false)
		setSearch('')
	}

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen)
				if (!nextOpen) setSearch('')
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant='outline'
					aria-expanded={open}
					aria-haspopup='listbox'
					className='min-w-[190px] max-w-[260px] justify-between px-2 font-normal'
				>
					<span className='truncate'>{selectedLabel}</span>
					<ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align='start'
				className='w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0'
			>
				<div className='border-b p-2'>
					<div className='relative'>
						<Search className='-translate-y-1/2 absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground' />
						<Input
							autoFocus
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={recherche}
							className='h-8 pl-8'
						/>
					</div>
				</div>

				<div className='max-h-72 overflow-y-auto p-1'>
					<button
						type='button'
						onClick={() => select('')}
						className='flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent'
					>
						<Check
							className={cn(
								'mr-2 h-4 w-4 shrink-0',
								value ? 'opacity-0' : 'opacity-100',
							)}
						/>
						{vide}
					</button>
					{noneLabel && (
						<button
							type='button'
							onClick={() => select(NO_RELATION_FILTER)}
							className='flex w-full items-center rounded-sm border-b px-2 py-1.5 text-left text-sm hover:bg-accent'
						>
							<Check
								className={cn(
									'mr-2 h-4 w-4 shrink-0',
									value === NO_RELATION_FILTER ? 'opacity-100' : 'opacity-0',
								)}
							/>
							{noneLabel}
						</button>
					)}

					{loading ? (
						<p className='px-2 py-3 text-center text-muted-foreground text-sm'>
							Chargement…
						</p>
					) : filteredOptions.length === 0 ? (
						<p className='px-2 py-3 text-center text-muted-foreground text-sm'>
							Aucun résultat
						</p>
					) : (
						filteredOptions.map((option) => (
							<button
								type='button'
								key={option.id}
								onClick={() => select(option.id)}
								className='flex w-full items-center rounded-sm py-1.5 pr-2 text-left text-sm hover:bg-accent'
								style={{ paddingLeft: `${8 + (option.depth ?? 0) * 16}px` }}
							>
								<Check
									className={cn(
										'mr-2 h-4 w-4 shrink-0',
										value === option.id ? 'opacity-100' : 'opacity-0',
									)}
								/>
								<span className='truncate'>{option.name}</span>
							</button>
						))
					)}
				</div>
			</PopoverContent>
		</Popover>
	)
}

function normalizeFilterText(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLocaleLowerCase('fr')
}
