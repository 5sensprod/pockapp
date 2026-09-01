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
import {
	type CatalogProductStatus,
	useCatalogProducts,
} from '@/lib/queries/catalog-products'
import { toStockRow } from '@/lib/queries/catalog-rows'
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
	ChevronLeft,
	ChevronRight,
	ChevronsUpDown,
	FileText,
	ImageOff,
	Loader2,
	Package,
	Plus,
	Search,
	X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { CatalogProductDialog } from './components/CatalogProductDialog'
import { ProductTable } from './components/ProductTable'

const PER_PAGE = 25
const NO_RELATION_FILTER = '__none__'

export function ProductsPage() {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase()
	const navigate = useNavigate()

	const [search, setSearch] = useState('')
	const [debounced, setDebounced] = useState('')
	const [page, setPage] = useState(1)
	const [status, setStatus] = useState<CatalogProductStatus | undefined>()
	const [brandId, setBrandId] = useState<string>('')
	const [categoryId, setCategoryId] = useState<string>('')
	const [supplierId, setSupplierId] = useState<string>('')
	const [missingImage, setMissingImage] = useState(false)
	const [missingDescription, setMissingDescription] = useState(false)
	const [sorting, setSorting] = useState<SortingState>([
		{ id: 'created', desc: true },
	])
	const [dialogOpen, setDialogOpen] = useState(false)
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
		setPage(1)
	}, [activeCompanyId])

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

	// Les catégories dans l'ordre de l'arbre, sans les branches réellement
	// vides. Un parent sans produit direct reste visible dès qu'une feuille sous
	// lui en porte : masquer ce parent casserait le contexte de l'arbre.
	// `total` compte déjà toute la sous-arborescence : le serveur a remonté
	// l'arbre, il n'y a plus rien à remonter ici. Un parent sans produit direct
	// reste donc visible dès qu'une feuille sous lui en porte, ce qui était
	// exactement l'objet de `collectPopulatedCategoryIds`.
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
				? toCategoryOptions(categories.data ?? []).filter((categorie) =>
						populatedCategoryIds.has(categorie.id),
					)
				: [],
		[categories.data, populatedCategoryIds, catalogCounts.data],
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
	}, [categoryId, populatedCategoryIds, catalogCounts.data])

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
	const openRow = (rowId: string) => {
		void navigate({
			to: '/stock/produits/$productId',
			params: { productId: rowId },
		})
	}

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

	const changeSorting = (nextSorting: SortingState) => {
		setSorting(nextSorting)
		setPage(1)
	}

	const filtresActifs = !!(
		brandId ||
		categoryId ||
		supplierId ||
		missingImage ||
		missingDescription
	)
	const clearFilters = () => {
		setBrandId('')
		setCategoryId('')
		setSupplierId('')
		setMissingImage(false)
		setMissingDescription(false)
		setPage(1)
	}

	const total = products.data?.totalItems ?? 0
	const totalPages = products.data?.totalPages ?? 1

	return (
		<div className='container mx-auto px-6 py-8'>
			<div className='mb-6'>
				<div className='mb-2 flex items-center gap-3'>
					<div className='flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10'>
						<Package className='h-6 w-6 text-primary' />
					</div>
					<h1 className='font-bold text-3xl'>Produits</h1>
				</div>
				<p className='text-muted-foreground'>
					Le catalogue commun à la caisse, au stock et au site. Cliquez une
					ligne pour consulter ou modifier sa fiche.
				</p>
			</div>

			{products.error && (
				<Card className='mb-6 border-destructive'>
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

			<div className='mb-4 flex flex-wrap items-center gap-3'>
				<div className='relative min-w-[280px] flex-1'>
					<Search className='-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground' />
					<Input
						value={search}
						onChange={(e) => changeSearch(e.target.value)}
						placeholder='Nom, référence ou code-barres…'
						className='pl-9'
					/>
				</div>

				<div className='flex items-center gap-1'>
					<FilterButton
						active={status === undefined}
						onClick={() => changeStatus(undefined)}
					>
						Tous
					</FilterButton>
					<FilterButton
						active={status === 'published'}
						onClick={() => changeStatus('published')}
					>
						Publiés
					</FilterButton>
					<FilterButton
						active={status === 'draft'}
						onClick={() => changeStatus('draft')}
					>
						Brouillons
					</FilterButton>
				</div>

				<FilterSelect
					value={brandId}
					onChange={changeFilter(setBrandId)}
					vide='Toutes les marques'
					noneLabel='Aucune marque'
					recherche='Rechercher une marque…'
					options={brands.data ?? []}
				/>
				<FilterSelect
					value={categoryId}
					onChange={changeFilter(setCategoryId)}
					vide='Toutes les catégories'
					noneLabel='Aucune catégorie'
					recherche='Rechercher une catégorie…'
					options={categoryOptions}
					loading={categories.isLoading || catalogCounts.isLoading}
				/>
				<FilterSelect
					value={supplierId}
					onChange={changeFilter(setSupplierId)}
					vide='Tous les fournisseurs'
					noneLabel='Aucun fournisseur'
					recherche='Rechercher un fournisseur…'
					options={suppliers.data ?? []}
				/>

				<FilterButton
					active={missingImage}
					onClick={() => {
						setMissingImage((current) => !current)
						setPage(1)
					}}
				>
					<ImageOff className='mr-1.5 inline h-4 w-4' />
					Sans image
				</FilterButton>
				<FilterButton
					active={missingDescription}
					onClick={() => {
						setMissingDescription((current) => !current)
						setPage(1)
					}}
				>
					<FileText className='mr-1.5 inline h-4 w-4' />
					Sans description
				</FilterButton>

				{filtresActifs && (
					<Button variant='ghost' size='sm' onClick={clearFilters}>
						<X className='mr-1 h-4 w-4' />
						Retirer les filtres
					</Button>
				)}

				<span className='text-muted-foreground text-sm tabular-nums'>
					{products.isLoading ? '…' : `${total} produit${total > 1 ? 's' : ''}`}
				</span>

				<Button onClick={openCreate}>
					<Plus className='mr-2 h-4 w-4' />
					Nouveau produit
				</Button>
			</div>

			<Card>
				<CardContent
					// La page précédente reste lisible pendant le chargement de la
					// suivante, grisée : la table ne se vide pas et la page ne saute pas.
					className={cn('p-4', products.isFetching && 'opacity-60')}
				>
					{/* Un écran vide doit dire POURQUOI il est vide. Sans ces trois cas,
					    « aucune entreprise active », « lecture en cours » et « 0 résultat
					    pour ces filtres » se ressemblent tous : une table sans ligne. */}
					{!activeCompanyId ? (
						<p className='py-12 text-center text-muted-foreground'>
							Aucune entreprise active — sélectionnez-en une pour voir le
							catalogue.
						</p>
					) : products.isLoading ? (
						<div className='flex items-center justify-center gap-3 py-12 text-muted-foreground'>
							<Loader2 className='h-5 w-5 animate-spin' />
							<span className='text-sm'>Lecture du catalogue…</span>
						</div>
					) : rows.length === 0 ? (
						<div className='py-12 text-center text-muted-foreground'>
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
							onRowClick={(row) => openRow(row.id)}
						/>
					)}
				</CardContent>
			</Card>

			<div className='mt-4 flex items-center justify-between'>
				<span className='text-muted-foreground text-sm tabular-nums'>
					Page {page} sur {Math.max(totalPages, 1)}
				</span>
				<div className='flex gap-2'>
					<Button
						variant='outline'
						size='sm'
						disabled={page <= 1 || products.isFetching}
						onClick={() => setPage((p) => Math.max(1, p - 1))}
					>
						<ChevronLeft className='mr-1 h-4 w-4' />
						Précédent
					</Button>
					<Button
						variant='outline'
						size='sm'
						disabled={page >= totalPages || products.isFetching}
						onClick={() => setPage((p) => p + 1)}
					>
						Suivant
						<ChevronRight className='ml-1 h-4 w-4' />
					</Button>
				</div>

				<CatalogProductDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					product={null}
				/>
			</div>
		</div>
	)
}

const CATALOG_SORT_FIELDS: Record<string, string> = {
	created: 'created',
	name: 'name',
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

function FilterButton({
	active,
	onClick,
	children,
}: {
	active: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type='button'
			onClick={onClick}
			className={cn(
				'rounded-md border px-3 py-1.5 text-sm transition-colors',
				active ? 'border-primary bg-accent font-medium' : 'hover:bg-accent/50',
			)}
		>
			{children}
		</button>
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
