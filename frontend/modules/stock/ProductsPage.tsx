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
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBrands } from '@/lib/queries/brands'
import {
	type CatalogProductShape,
	type CatalogProductStatus,
	useCatalogProducts,
} from '@/lib/queries/catalog-products'
import { toStockRow } from '@/lib/queries/catalog-rows'
import { useCategories } from '@/lib/queries/categories'
import {
	collectBranchIds,
	toCategoryOptions,
} from '@/lib/queries/category-tree'
import { useSuppliers } from '@/lib/queries/suppliers'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import {
	AlertTriangle,
	ChevronLeft,
	ChevronRight,
	Loader2,
	Package,
	Plus,
	Search,
	X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { CatalogProductDialog } from './components/CatalogProductDialog'
import { ProductTable } from './components/ProductTable'

const PER_PAGE = 25

export function ProductsPage() {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase()

	const [search, setSearch] = useState('')
	const [debounced, setDebounced] = useState('')
	const [page, setPage] = useState(1)
	const [status, setStatus] = useState<CatalogProductStatus | undefined>()
	const [brandId, setBrandId] = useState<string>('')
	const [categoryId, setCategoryId] = useState<string>('')
	const [supplierId, setSupplierId] = useState<string>('')
	const [editing, setEditing] = useState<CatalogProductShape | null>(null)
	const [dialogOpen, setDialogOpen] = useState(false)

	const openCreate = () => {
		setEditing(null)
		setDialogOpen(true)
	}
	const openEdit = (product: CatalogProductShape) => {
		setEditing(product)
		setDialogOpen(true)
	}

	// La recherche part au serveur : la lancer à chaque frappe ferait 2999
	// produits interrogés une fois par lettre. 300 ms suffisent à ne plus le
	// sentir tout en n'envoyant qu'une requête par mot tapé.
	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(search), 300)
		return () => window.clearTimeout(timer)
	}, [search])

	const categories = useCategories({ companyId: activeCompanyId ?? undefined })

	// Filtrer sur une catégorie, c'est filtrer sur SA BRANCHE : les produits sont
	// rattachés aux feuilles, jamais aux ancêtres. Sans cela, « Guitares » ne
	// rendrait que les rares produits posés sur le nœud lui-même.
	//
	// Le repli sur `[categoryId]` n'est pas une précaution de style : une liste
	// VIDE serait comprise comme « pas de filtre » et afficherait les 2999
	// produits sous une catégorie qui n'en a aucun. Il sert deux fois — pendant
	// le chargement des catégories, et si la catégorie choisie a disparu.
	const categoryBranch = useMemo(() => {
		if (!categoryId) return undefined
		const branche = collectBranchIds(categories.data ?? [], categoryId)
		return branche.length ? branche : [categoryId]
	}, [categories.data, categoryId])

	// Les catégories dans l'ordre de l'arbre, avec leur profondeur : une liste
	// de 464 noms à plat ne dit pas laquelle est une racine.
	const categoryOptions = useMemo(
		() => toCategoryOptions(categories.data ?? []),
		[categories.data],
	)

	const products = useCatalogProducts({
		companyId: activeCompanyId ?? undefined,
		page,
		perPage: PER_PAGE,
		search: debounced || undefined,
		status,
		brandId: brandId || undefined,
		categoryIds: categoryBranch,
		supplierId: supplierId || undefined,
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

	// La ligne cliquée ouvre le dialogue d'édition. La table ne rend que des
	// lignes ; le produit complet se retrouve par son identifiant.
	const openRow = (rowId: string) => {
		const produit = products.data?.items.find((p) => p.id === rowId)
		if (produit) openEdit(produit)
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

	const filtresActifs = !!(brandId || categoryId || supplierId)
	const clearFilters = () => {
		setBrandId('')
		setCategoryId('')
		setSupplierId('')
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
					Le catalogue <strong>PocketBase</strong>, pas AppPos. Cliquez une
					ligne pour la modifier. La caisse et l’inventaire lisent encore
					l’autre base jusqu’à la prochaine version : les deux peuvent différer,
					et c’est attendu.
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
					options={brands.data ?? []}
				/>
				<FilterSelect
					value={categoryId}
					onChange={changeFilter(setCategoryId)}
					vide='Toutes les catégories'
					options={categoryOptions}
				/>
				<FilterSelect
					value={supplierId}
					onChange={changeFilter(setSupplierId)}
					vide='Tous les fournisseurs'
					options={suppliers.data ?? []}
				/>

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
					{/* `paginated={false}` : la page vient du serveur. Paginer une
					    seconde fois en mémoire afficherait « 1–10 sur 25 » sous une
					    table qui en montre 25. */}
					<ProductTable
						data={rows}
						paginated={false}
						onRowClick={(row) => openRow(row.id)}
					/>

					{products.isLoading && (
						<div className='flex items-center justify-center gap-3 py-12 text-muted-foreground'>
							<Loader2 className='h-5 w-5 animate-spin' />
							<span className='text-sm'>Lecture du catalogue…</span>
						</div>
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
					product={editing}
				/>
			</div>
		</div>
	)
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
	options,
}: {
	value: string
	onChange: (value: string) => void
	vide: string
	options: { id: string; name: string; depth?: number }[]
}) {
	return (
		<select
			className='h-9 rounded-md border border-input bg-background px-2 text-sm'
			value={value}
			onChange={(e) => onChange(e.target.value)}
		>
			<option value=''>{vide}</option>
			{options.map((o) => (
				<option key={o.id} value={o.id}>
					{/* Espaces insécables : un `<option>` mange les espaces ordinaires
					    en début de texte, et l'indentation de l'arbre disparaîtrait. */}
					{'  '.repeat(o.depth ?? 0)}
					{o.name}
				</option>
			))}
		</select>
	)
}
