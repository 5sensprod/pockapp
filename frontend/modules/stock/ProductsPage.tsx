// frontend/modules/stock/ProductsPage.tsx
//
// LES PRODUITS POCKETBASE — EN LECTURE, 13 août 2026.
//
// Quatrième et dernière entité affichée depuis PocketBase. Elle est d'une autre
// nature que les trois précédentes, et l'écran le dit plutôt que de le cacher :
//
//   • le STOCK est modifié par la caisse, qui écrit dans NeDB ;
//   • le PRIX part sur le ticket ;
//   • ils sont 2999, donc la pagination est une contrainte de requête et non un
//     confort d'affichage — d'où `useCatalogProducts`, paginé côté serveur.
//
// ⚠️ AUCUNE ÉCRITURE ICI, ET CE N'EST PAS UN OUBLI. Éditer un produit demande
// de trancher où vit la vérité du prix et du stock tant que la caisse écrit
// ailleurs — §6 du rituel de migration AppStock. Le nom et la description, eux,
// s'éditent déjà depuis « Catalogue en ligne ».

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBrands } from '@/lib/queries/brands'
import {
	type CatalogProductStatus,
	useCatalogProducts,
} from '@/lib/queries/catalog-products'
import { useCategories } from '@/lib/queries/categories'
import { cn } from '@/lib/utils'
import {
	AlertTriangle,
	ChevronLeft,
	ChevronRight,
	Loader2,
	Package,
	Search,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const PER_PAGE = 25

const euros = new Intl.NumberFormat('fr-FR', {
	style: 'currency',
	currency: 'EUR',
})

export function ProductsPage() {
	const { activeCompanyId } = useActiveCompany()

	const [search, setSearch] = useState('')
	const [debounced, setDebounced] = useState('')
	const [page, setPage] = useState(1)
	const [status, setStatus] = useState<CatalogProductStatus | undefined>()

	// La recherche part au serveur : la lancer à chaque frappe ferait 2999
	// produits interrogés une fois par lettre. 300 ms suffisent à ne plus le
	// sentir tout en n'envoyant qu'une requête par mot tapé.
	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(search), 300)
		return () => window.clearTimeout(timer)
	}, [search])

	const products = useCatalogProducts({
		companyId: activeCompanyId ?? undefined,
		page,
		perPage: PER_PAGE,
		search: debounced || undefined,
		status,
	})

	const brands = useBrands({ companyId: activeCompanyId ?? undefined })
	const categories = useCategories({ companyId: activeCompanyId ?? undefined })

	const brandById = useMemo(
		() => new Map((brands.data ?? []).map((b) => [b.id, b.name])),
		[brands.data],
	)
	const categoryById = useMemo(
		() => new Map((categories.data ?? []).map((c) => [c.id, c.name])),
		[categories.data],
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
					Le catalogue <strong>PocketBase</strong>, pas AppPos. En lecture seule
					: le prix et le stock appartiennent à AppStock, et la caisse les
					modifie encore dans l’autre base. Le nom et la description s’éditent
					depuis « Catalogue en ligne ».
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

				<span className='text-muted-foreground text-sm tabular-nums'>
					{products.isLoading ? '…' : `${total} produit${total > 1 ? 's' : ''}`}
				</span>
			</div>

			<Card>
				<CardContent className='p-0'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Produit</TableHead>
								<TableHead>Référence</TableHead>
								<TableHead>Marque</TableHead>
								<TableHead className='text-right'>Prix TTC</TableHead>
								<TableHead className='text-right'>Stock</TableHead>
								<TableHead>Statut</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody
							// La page précédente reste lisible pendant le chargement de la
							// suivante, grisée : la table ne se vide pas et la page ne saute
							// pas d'un demi-écran.
							className={cn(products.isFetching && 'opacity-60')}
						>
							{products.data?.items.map((product) => {
								const categoryNames = (product.categories ?? [])
									.map((id) => categoryById.get(id))
									.filter(Boolean)

								return (
									<TableRow key={product.id}>
										<TableCell>
											<div className='font-medium'>{product.name}</div>
											{categoryNames.length > 0 && (
												<div className='text-muted-foreground text-xs'>
													{categoryNames.join(' · ')}
												</div>
											)}
										</TableCell>
										<TableCell className='font-mono text-xs'>
											{product.sku || (
												<span className='text-muted-foreground'>—</span>
											)}
										</TableCell>
										<TableCell className='text-sm'>
											{(product.brand && brandById.get(product.brand)) || (
												<span className='text-muted-foreground'>—</span>
											)}
										</TableCell>
										<TableCell className='text-right tabular-nums'>
											{typeof product.price_ttc === 'number'
												? euros.format(product.price_ttc)
												: '—'}
										</TableCell>
										{/* Le stock affiché vient de PocketBase. Tant que la caisse
										    écrit dans NeDB, il peut être en retard — c'est le point
										    dur de la migration, pas un défaut d'affichage. */}
										<TableCell
											className={cn(
												'text-right tabular-nums',
												(product.stock ?? 0) <= 0 && 'text-amber-600',
											)}
										>
											{product.stock ?? 0}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													product.status === 'published'
														? 'default'
														: 'secondary'
												}
											>
												{product.status === 'published'
													? 'Publié'
													: 'Brouillon'}
											</Badge>
										</TableCell>
									</TableRow>
								)
							})}

							{!products.isLoading && !products.data?.items.length && (
								<TableRow>
									<TableCell
										colSpan={6}
										className='py-12 text-center text-muted-foreground'
									>
										Aucun produit ne correspond.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>

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
