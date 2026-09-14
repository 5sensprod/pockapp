import {
	CATEGORY_SELECTED_CLASS,
	CategoryTreeRow,
} from '@/components/catalog/CategoryTreeRow'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useDeleteBrand } from '@/lib/queries/brands'
import type {
	CatalogBrandShape,
	CatalogCategoryShape,
	CatalogSupplierShape,
} from '@/lib/queries/catalog-shapes'
import { useDeleteCategory, useUpdateCategory } from '@/lib/queries/categories'
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
import type { CatalogCategory } from '@/lib/queries/site-catalog'
import { useDeleteSupplier } from '@/lib/queries/suppliers'
import { useCategoryAutoSync } from '@/lib/sync/relation-auto-sync'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import {
	ArrowDown01,
	ArrowDownAZ,
	ArrowUp01,
	ArrowUpAZ,
	Building2,
	CalendarArrowDown,
	CalendarArrowUp,
	ChevronDown,
	ChevronRight,
	FolderOpen,
	FolderTree,
	Loader2,
	Plus,
	Search,
	Settings2,
	Star,
	Trash2,
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

// Création : l'onglet dit QUOI créer, `parentId` — posé par le « + » d'une
// ligne de catégorie — dit SOUS QUOI. Une modale de création est distincte de
// celle d'édition : la même instance recevrait tantôt un enregistrement,
// tantôt `null`, et son `reset` dépend de ce qu'elle reçoit.
type CreatingTarget = { kind: ExplorerView; parentId?: string }

/** Élément dont la corbeille a ouvert la demande de confirmation. */
type DeletingTarget = { kind: ExplorerView; id: string; name: string }

/** Critère de tri de la liste, commun aux trois onglets. */
type SortMode = 'name' | 'created' | 'products'
type SortDir = 'asc' | 'desc'

/**
 * Le sens « naturel » de chaque critère : celui qu'on obtient en le
 * choisissant, avant de l'inverser. Personne ne demande une date de création
 * en commençant par la plus ancienne.
 */
const SENS_PAR_DEFAUT: Record<SortMode, SortDir> = {
	name: 'asc',
	created: 'desc',
	products: 'asc',
}

const SORT_LABELS: Record<SortMode, Record<SortDir, string>> = {
	name: {
		asc: 'Ordre alphabétique (A → Z)',
		desc: 'Ordre alphabétique (Z → A)',
	},
	created: {
		asc: 'Date de création, la plus ancienne en tête',
		desc: 'Date de création, la plus récente en tête',
	},
	products: {
		asc: 'Nombre de produits, croissant',
		desc: 'Nombre de produits, décroissant',
	},
}

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

// `created` est posé par PocketBase et comparé comme une CHAÎNE : le format
// est « AAAA-MM-JJ hh:mm:ss.sssZ », déjà ordonnable tel quel. Les deux
// comparateurs sont ASCENDANTS ; le sens choisi est appliqué par-dessus, pour
// qu'un seul code décrive l'ordre et son inverse.
const parCreation = (a: { created?: string }, b: { created?: string }) =>
	(a.created ?? '').localeCompare(b.created ?? '')
const parNom = (a: { name: string }, b: { name: string }) =>
	a.name.localeCompare(b.name, 'fr')

// Teinte du bouton de tri. Une seule paire pour les trois critères : la même
// violette que la sélection de l'arbre (CATEGORY_SELECTED_CLASS), parce que ce
// qui distingue les boutons est leur icône, pas leur couleur. Chaque entrée la
// porte quand même séparément : si un critère doit un jour se démarquer, c'est
// ici, sans toucher au JSX.
const TRI_ACTIF =
	'bg-violet-100 text-primary dark:bg-violet-900/50 dark:text-foreground'
const TRI_SURVOL = 'hover:text-primary'

const SORT_BUTTONS = [
	{
		mode: 'name',
		Ascendant: ArrowDownAZ,
		Descendant: ArrowUpAZ,
		actif: TRI_ACTIF,
		survol: TRI_SURVOL,
	},
	{
		mode: 'created',
		Ascendant: CalendarArrowUp,
		Descendant: CalendarArrowDown,
		actif: TRI_ACTIF,
		survol: TRI_SURVOL,
	},
	{
		mode: 'products',
		Ascendant: ArrowDown01,
		Descendant: ArrowUp01,
		actif: TRI_ACTIF,
		survol: TRI_SURVOL,
	},
] as const satisfies readonly {
	mode: SortMode
	Ascendant: typeof ArrowDownAZ
	Descendant: typeof ArrowDownAZ
	actif: string
	survol: string
}[]

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
	const deleteCategory = useDeleteCategory()
	const deleteBrand = useDeleteBrand()
	const deleteSupplier = useDeleteSupplier()
	const [view, setView] = useState<ExplorerView>('category')
	// La mise en avant se bascule ICI, hors du formulaire : elle doit partir en
	// ligne comme le reste (14 septembre 2026). L'inventaire distant n'est lu
	// que dans la vue Catégories — une lecture par visite, `staleTime` 30 s,
	// la même requête que `/site/catalogue`.
	const publierCategorie = useCategoryAutoSync(view === 'category')
	const [search, setSearch] = useState('')
	const [featuredOnly, setFeaturedOnly] = useState(false)
	// Ne montrer QUE ce qui n'a aucun produit. L'arbre écarte les catégories
	// vides — sinon les 464 défilent pour rien —, or c'est précisément là qu'on
	// veut déposer des produits, et une catégorie neuve est vide par définition.
	// La bascule vaut pour les trois onglets : une marque ou un fournisseur sans
	// produit se cherche de la même façon.
	const [videsSeules, setVidesSeules] = useState(false)
	const [sortMode, setSortMode] = useState<SortMode>('name')
	const [sortDir, setSortDir] = useState<SortDir>(SENS_PAR_DEFAUT.name)
	// Un clic sur le critère actif l'inverse ; sur un autre, il l'adopte dans son
	// sens naturel.
	const choisirTri = (mode: SortMode) => {
		if (mode === sortMode) {
			setSortDir((sens) => (sens === 'asc' ? 'desc' : 'asc'))
			return
		}
		setSortMode(mode)
		setSortDir(SENS_PAR_DEFAUT[mode])
	}
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
	const [expandedSupplierIds, setExpandedSupplierIds] = useState<Set<string>>(
		() => new Set(),
	)
	const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(
		null,
	)
	// L'engrenage n'ouvre qu'une modale à la fois, quel que soit l'onglet.
	const [editing, setEditing] = useState<EditingTarget | null>(null)
	const [creating, setCreating] = useState<CreatingTarget | null>(null)
	const [deleting, setDeleting] = useState<DeletingTarget | null>(null)
	// Les catégories créées depuis ce panneau, tant que la page vit. L'arbre ne
	// montre que les catégories PEUPLÉES : une catégorie neuve est vide par
	// définition, elle disparaîtrait aussitôt créée. Elle reste donc visible
	// jusqu'au prochain chargement de la page, le temps d'y ranger des produits.
	const [categoriesCreees, setCategoriesCreees] = useState<Set<string>>(
		() => new Set(),
	)

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
	// Les catégories sans aucun produit, avec la branche qui les porte : une
	// sous-catégorie vide sous un parent peuplé doit rester atteignable, donc
	// visible, donc précédée de ses ancêtres.
	const videsVisibleIds = useMemo(() => {
		const included = new Set<string>()
		for (const category of categories) {
			if (countsOfCategory(counts, category.id).total > 0) continue
			const visited = new Set<string>()
			let current = category.id
			while (current && !visited.has(current)) {
				visited.add(current)
				included.add(current)
				current = parentById.get(current) || ''
			}
		}
		return included
	}, [categories, counts, parentById])

	// `total` est déjà remonté par le serveur. Les branches sans produit peuvent
	// disparaître sans calculer ni parcourir les produits dans le navigateur. Si
	// une ancienne réponse en cache n'a aucune ventilation par catégorie alors
	// que le catalogue est non vide, elle ne doit surtout pas vider l'arbre.
	const sens = sortDir === 'asc' ? 1 : -1
	const options = useMemo(() => {
		// Le classement par nombre de produits ne s'applique QU'AUX RACINES, et
		// sur leur `total` — celui qui couvre toute la branche, sous-catégories
		// comprises (`catalog_counts_routes.go`). Les fratries restent
		// alphabétiques : leurs totaux ne se comparent pas d'un niveau à l'autre.
		const treeOrder = toCategoryOptions(
			categories,
			sortMode === 'products'
				? {
						racines: (a, b) =>
							sens *
								(countsOfCategory(counts, a.id).total -
									countsOfCategory(counts, b.id).total) || parNom(a, b),
					}
				: sortMode === 'created'
					? {
							racines: (a, b) => sens * parCreation(a, b),
							fratries: (a, b) => sens * parCreation(a, b),
						}
					: sortDir === 'desc'
						? {
								racines: (a, b) => -parNom(a, b),
								fratries: (a, b) => -parNom(a, b),
							}
						: {},
		)
		// Pendant un déplacement, même une catégorie vide doit devenir une cible.
		// Le filtre « vides » ne s'ajoute pas au filtre « peuplées » : il le
		// remplace, les deux étant exactement contraires.
		if (videsSeules && categoryCountsAreUsable)
			return treeOrder.filter((category) => videsVisibleIds.has(category.id))
		const populated =
			!categoryCountsAreUsable || selectedProductCount > 0
				? treeOrder
				: treeOrder.filter(
						(category) =>
							countsOfCategory(counts, category.id).total > 0 ||
							categoriesCreees.has(category.id),
					)
		// Le glisser-déposer reste possible vers toutes les catégories, même si le
		// filtre visuel était actif avant de commencer la sélection.
		if (!featuredOnly || selectedProductCount > 0) return populated
		return populated.filter(
			(category) =>
				featuredVisibleIds.has(category.id) ||
				categoriesCreees.has(category.id),
		)
	}, [
		categories,
		categoriesCreees,
		categoryCountsAreUsable,
		counts,
		featuredOnly,
		featuredVisibleIds,
		selectedProductCount,
		sens,
		sortDir,
		sortMode,
		videsSeules,
		videsVisibleIds,
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

	// Même raison pour les vides : montrer la catégorie vide elle-même, et pas
	// seulement la racine qui la contient.
	useEffect(() => {
		if (!videsSeules) return
		setExpandedIds((current) => new Set([...current, ...videsVisibleIds]))
	}, [videsSeules, videsVisibleIds])

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
			brands
				.filter(
					(brand) =>
						normalizeSearch(brand.name).includes(normalizedSearch) &&
						(!videsSeules || (counts?.parMarque[brand.id] ?? 0) === 0),
				)
				.sort((a, b) =>
					sortMode === 'created'
						? parCreation(a, b)
						: sortMode === 'products'
							? (counts?.parMarque[a.id] ?? 0) -
									(counts?.parMarque[b.id] ?? 0) || parNom(a, b)
							: parNom(a, b),
				),
		[brands, counts, normalizedSearch, sortMode, videsSeules],
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
			suppliers
				.filter(
					(supplier) =>
						normalizeSearch(supplier.name).includes(normalizedSearch) &&
						(!videsSeules || (counts?.parFournisseur[supplier.id] ?? 0) === 0),
				)
				.sort((a, b) =>
					sortMode === 'created'
						? parCreation(a, b)
						: sortMode === 'products'
							? (counts?.parFournisseur[a.id] ?? 0) -
									(counts?.parFournisseur[b.id] ?? 0) || parNom(a, b)
							: parNom(a, b),
				),
		[counts, normalizedSearch, sortMode, suppliers, videsSeules],
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
			none: 'Produits sans catégorie',
			create: 'Créer une catégorie',
			emptyOn: 'Voir les catégories sans produit',
			emptyOff: 'Voir toutes les catégories',
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
			none: 'Produits sans marque',
			create: 'Créer une marque',
			emptyOn: 'Voir les marques sans produit',
			emptyOff: 'Voir toutes les marques',
			count: videsSeules ? filteredBrands.length : brands.length,
			value: brandValue,
			onChange: onBrandChange,
			Icon: Building2,
		},
		supplier: {
			label: 'Fournisseurs',
			search: 'Chercher un fournisseur…',
			all: 'Tous les fournisseurs',
			none: 'Produits sans fournisseur',
			create: 'Créer un fournisseur',
			emptyOn: 'Voir les fournisseurs sans produit',
			emptyOff: 'Voir tous les fournisseurs',
			count: videsSeules ? filteredSuppliers.length : suppliers.length,
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
			const enregistree = await updateCategory.mutateAsync({
				id: category.id,
				data: { is_featured: !category.is_featured },
			})
			// `is_featured` est un champ exporté, et une catégorie mise en avant
			// s'affiche SEULE sur le site (`catalog.php?action=featured-categories`,
			// sans jointure produit) : le geste doit atteindre la vitrine sans
			// passer par `/site/catalogue`.
			await publierCategorie(enregistree as unknown as CatalogCategory, {
				dataModified: true,
				imageModified: false,
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
	// Le « + » d'une ligne ne doit pas non plus sélectionner la catégorie.
	const openCreator = (
		event: ReactMouseEvent,
		kind: ExplorerView,
		parentId?: string,
	) => {
		event.stopPropagation()
		event.preventDefault()
		setCreating({ kind, parentId })
	}
	const closeCreator = (open: boolean) => {
		if (!open) setCreating(null)
	}
	// Rendre visible ce qui vient d'être créé : la garder dans l'arbre malgré
	// zéro produit, et déplier la branche qui la porte.
	const onCategoryCreated = (category: CatalogCategoryShape) => {
		setCategoriesCreees((current) => new Set(current).add(category.id))
		const parentId = category.parent || ''
		if (!parentId) return
		setExpandedIds((current) => {
			const next = new Set(current)
			const visited = new Set<string>()
			let parent = parentId
			while (parent && !visited.has(parent)) {
				visited.add(parent)
				next.add(parent)
				parent = parentById.get(parent) || ''
			}
			return next
		})
	}
	const editingCategory =
		editing?.kind === 'category' ? (categoryById.get(editing.id) ?? null) : null
	const editingBrand =
		editing?.kind === 'brand' ? (brandById.get(editing.id) ?? null) : null
	const editingSupplier =
		editing?.kind === 'supplier' ? (supplierById.get(editing.id) ?? null) : null

	const openDeletion = (
		event: ReactMouseEvent,
		kind: ExplorerView,
		id: string,
		name: string,
	) => {
		event.stopPropagation()
		event.preventDefault()
		setDeleting({ kind, id, name })
	}
	// Ce que la suppression emporte, dit avant de la faire. Les produits ne sont
	// pas supprimés : PocketBase retire la relation, le champ étant en
	// `CascadeDelete: false` (`backend/migrations/catalog_v2.go:439`). Une
	// catégorie parente ne détruit pas sa descendance non plus — ses enfants
	// remontent à la racine.
	const deletionSummary = useMemo(() => {
		if (!deleting) return null
		if (deleting.kind === 'category') {
			// `direct`, et surtout PAS `total` : seuls les produits rangés DANS
			// cette catégorie perdent le rattachement. Ceux des sous-catégories
			// gardent le leur — la branche remonte à la racine, elle ne se vide pas.
			// Annoncer le total de branche aurait fait renoncer devant un nombre
			// qui n'allait rien perdre.
			return {
				produits: countsOfCategory(counts, deleting.id).direct,
				enfants: categories.filter(
					(category) => category.parent === deleting.id,
				).length,
				relation: 'catégorie',
			}
		}
		return {
			produits:
				(deleting.kind === 'brand'
					? counts?.parMarque[deleting.id]
					: counts?.parFournisseur[deleting.id]) ?? 0,
			enfants: 0,
			relation: deleting.kind === 'brand' ? 'marque' : 'fournisseur',
		}
	}, [categories, counts, deleting])
	const deletionPending =
		deleteCategory.isPending ||
		deleteBrand.isPending ||
		deleteSupplier.isPending
	const confirmDeletion = async () => {
		if (!deleting) return
		const mutation =
			deleting.kind === 'category'
				? deleteCategory
				: deleting.kind === 'brand'
					? deleteBrand
					: deleteSupplier
		try {
			await mutation.mutateAsync(deleting.id)
			// Le filtre actif pointait peut-être ce qui vient de disparaître : le
			// laisser en place afficherait une grille vide sans rien pour en sortir.
			if (viewOptions[deleting.kind].value === deleting.id)
				viewOptions[deleting.kind].onChange('')
			toast.success(`« ${deleting.name} » supprimé`)
			setDeleting(null)
		} catch (error) {
			toast.error(`Suppression refusée : ${pocketbaseErrorMessage(error)}`)
		}
	}

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
							<button
								type='button'
								aria-pressed={videsSeules}
								aria-label={
									videsSeules ? currentView.emptyOff : currentView.emptyOn
								}
								title={videsSeules ? currentView.emptyOff : currentView.emptyOn}
								onClick={() => setVidesSeules((active) => !active)}
								className={cn(
									'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
									videsSeules
										? 'border-primary/40 bg-primary/10 text-primary shadow-sm'
										: 'border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground',
								)}
							>
								<FolderOpen className='h-4 w-4' />
							</button>
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
							<button
								type='button'
								aria-label={currentView.create}
								title={currentView.create}
								onClick={(event) => openCreator(event, view)}
								className='flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground'
							>
								<Plus className='h-4 w-4' />
							</button>
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
					{/* La ligne « tout » porte aussi l'ordre de la liste : c'est
					    l'en-tête de ce qui suit, et le seul endroit qui vaut pour les
					    trois onglets. Le déclencheur est un FRÈRE du bouton, pas un
					    bouton dans un bouton. */}
					<div
						className={cn(
							'group/all mb-1 flex items-center gap-1 rounded-md py-0.5 pr-1.5 transition-colors',
							currentView.value === ''
								? SELECTED_ITEM_CLASS
								: 'hover:bg-accent',
						)}
					>
						<button
							type='button'
							onClick={() => currentView.onChange('')}
							aria-pressed={currentView.value === ''}
							className='flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left font-medium text-sm'
						>
							<CurrentViewIcon className='h-4 w-4 shrink-0' />
							<span className='min-w-0 flex-1 truncate'>{currentView.all}</span>
						</button>
						{SORT_BUTTONS.map(
							({
								mode,
								Ascendant,
								Descendant,
								actif: classeActive,
								survol,
							}) => {
								const actif = sortMode === mode
								// Inactif : l'icône du critère dans son sens naturel, en gris.
								// Actif : la même, colorée, la flèche disant le sens réel.
								const Icone =
									(actif ? sortDir : SENS_PAR_DEFAUT[mode]) === 'asc'
										? Ascendant
										: Descendant
								return (
									<button
										key={mode}
										type='button'
										aria-pressed={actif}
										aria-label={
											SORT_LABELS[mode][actif ? sortDir : SENS_PAR_DEFAUT[mode]]
										}
										title={
											SORT_LABELS[mode][actif ? sortDir : SENS_PAR_DEFAUT[mode]]
										}
										onClick={() => choisirTri(mode)}
										className={cn(
											'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
											// Le critère actif reste visible hors survol : sinon la
											// liste serait triée sans que rien ne dise comment.
											actif
												? cn('opacity-100 shadow-sm', classeActive)
												: cn(
														'text-muted-foreground opacity-0 hover:bg-background/60 group-hover/all:opacity-100',
														survol,
													),
										)}
									>
										<Icone className='h-[18px] w-[18px]' />
									</button>
								)
							},
						)}
					</div>
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
									: videsSeules
										? 'Aucune catégorie sans produit'
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
													aria-label={`Créer une sous-catégorie de ${option.name}`}
													title='Créer une sous-catégorie'
													onClick={(event) =>
														openCreator(event, 'category', option.id)
													}
													className={GEAR_BUTTON_CLASS}
												>
													<Plus className='h-3.5 w-3.5' />
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
												<button
													type='button'
													aria-label={`Supprimer la catégorie ${option.name}`}
													title='Supprimer la catégorie'
													onClick={(event) =>
														openDeletion(
															event,
															'category',
															option.id,
															option.name,
														)
													}
													className={cn(
														GEAR_BUTTON_CLASS,
														'hover:bg-destructive/10 hover:text-destructive',
													)}
												>
													<Trash2 className='h-3.5 w-3.5' />
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
											<button
												type='button'
												aria-label={
													view === 'brand'
														? `Supprimer la marque ${option.name}`
														: `Supprimer le fournisseur ${option.name}`
												}
												title={
													view === 'brand'
														? 'Supprimer la marque'
														: 'Supprimer le fournisseur'
												}
												onClick={(event) =>
													openDeletion(event, view, option.id, option.name)
												}
												className={cn(
													GEAR_BUTTON_CLASS,
													'hover:bg-destructive/10 hover:text-destructive',
												)}
											>
												<Trash2 className='h-3.5 w-3.5' />
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

			{/* Création. La clé porte le parent : rouvrir le « + » d'une AUTRE
			    catégorie doit remonter un formulaire vierge sous ce parent-là. */}
			<CategoryDialog
				key={`creation-categorie-${creating?.parentId ?? 'racine'}`}
				open={creating?.kind === 'category'}
				onOpenChange={closeCreator}
				category={null}
				defaultParentId={creating?.parentId}
				onCreated={onCategoryCreated}
			/>
			<BrandDialog
				open={creating?.kind === 'brand'}
				onOpenChange={closeCreator}
				brand={null}
			/>
			<SupplierDialog
				open={creating?.kind === 'supplier'}
				onOpenChange={closeCreator}
				supplier={null}
			/>

			<Dialog
				open={deleting !== null}
				onOpenChange={(open) => {
					if (!open && !deletionPending) setDeleting(null)
				}}
			>
				<DialogContent className='max-w-md'>
					<DialogHeader>
						<DialogTitle>Supprimer « {deleting?.name} » ?</DialogTitle>
						<DialogDescription asChild>
							<div className='space-y-2 text-left'>
								<p>
									Cette suppression est définitive. Les produits, eux, ne sont
									pas supprimés.
								</p>
								{deletionSummary && deletionSummary.produits > 0 && (
									<p>
										<strong className='tabular-nums'>
											{deletionSummary.produits}
										</strong>{' '}
										produit{deletionSummary.produits > 1 ? 's' : ''} perdra
										{deletionSummary.produits > 1 ? 'ont' : ''} sa{' '}
										{deletionSummary.relation}.
									</p>
								)}
								{deletionSummary && deletionSummary.enfants > 0 && (
									<p>
										<strong className='tabular-nums'>
											{deletionSummary.enfants}
										</strong>{' '}
										sous-catégorie{deletionSummary.enfants > 1 ? 's' : ''}{' '}
										remontera{deletionSummary.enfants > 1 ? 'ont' : ''} à la
										racine.
									</p>
								)}
							</div>
						</DialogDescription>
					</DialogHeader>
					<div className='flex justify-end gap-2 pt-4'>
						<Button
							type='button'
							variant='outline'
							disabled={deletionPending}
							onClick={() => setDeleting(null)}
						>
							Annuler
						</Button>
						<Button
							type='button'
							variant='destructive'
							disabled={deletionPending}
							onClick={() => void confirmDeletion()}
						>
							{deletionPending && (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							)}
							Supprimer
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</Card>
	)
}
