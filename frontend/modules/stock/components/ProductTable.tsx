// frontend/modules/stock/components/ProductTable.tsx
//
// Table du catalogue AppPos — LECTURE SEULE, et une seule provenance.
// L'édition d'un produit se fait sous `/stock/produits`, dans PocketBase
// (`CatalogProductDialog`). Ni « Modifier » ni « Supprimer » ici : le premier
// écrivait dans AppPos, ce que la migration interdit (`CLAUDE.md`), le second
// appelait `useDeleteProduct` — une suppression PocketBase avec un identifiant
// NeDB, qui ne pouvait rien supprimer.
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	type ColumnDef,
	type ColumnFiltersState,
	type PaginationState,
	type SortingState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from '@tanstack/react-table'
import {
	ArrowUpDown,
	Barcode,
	Building2,
	ImageIcon,
	MoreHorizontal,
	Tags,
	Truck,
} from 'lucide-react'
import { useState } from 'react'

import { APPPOS_ASSETS_BASE_URL } from '@/lib/apppos/apppos-config'

// ============================================================================
// CONFIGURATION
// ============================================================================
const APPPOS_BASE_URL = APPPOS_ASSETS_BASE_URL

// La ligne affichée, déclarée par ce que la table LIT — et rien d'autre.
// Elle ne dérive plus de `ProductsResponse` (`pocketbase-types.ts`) : ce type
// nommait PocketBase alors que les produits affichés ici viennent d'AppPos, et
// c'est ce mensonge qui a laissé cohabiter deux bases dans un même fichier.
// Le nom de la marque, du fournisseur et des catégories arrive DÉJÀ résolu dans
// `expand`, posé par `appPosTransformers.product()` : la table ne va plus le
// chercher elle-même.
export interface StockProductRow {
	id: string
	name: string
	barcode?: string | null
	price_ttc?: number | null
	cost_price?: number | null
	stock_quantity?: number | null
	active?: boolean
	images?: string | null
	expand?: {
		brand?: { id: string; name: string }
		supplier?: { id: string; name: string }
		categories?: Array<{ id: string; name: string; parent?: string }>
	}
}

interface ProductTableProps {
	data: StockProductRow[]
}

export function ProductTable({ data }: ProductTableProps) {
	const [sorting, setSorting] = useState<SortingState>([])
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	})

	const getBrandName = (product: StockProductRow): string | null =>
		product.expand?.brand?.name ?? null

	const getSupplierName = (product: StockProductRow): string | null =>
		product.expand?.supplier?.name ?? null

	const getProductCategoryPaths = (product: StockProductRow): string[] =>
		product.expand?.categories?.map((cat) => cat.name) ?? []

	// Helper pour construire l'URL de l'image
	const getImageUrl = (imagePath: string | null | undefined): string | null => {
		if (!imagePath) return null
		// Si c'est déjà une URL complète
		if (imagePath.startsWith('http')) return imagePath
		// Sinon, préfixer avec l'URL AppPOS
		return `${APPPOS_BASE_URL}${imagePath}`
	}

	const columns: ColumnDef<StockProductRow>[] = [
		// ✅ COLONNE IMAGE
		{
			id: 'image',
			header: '',
			size: 60,
			cell: ({ row }) => {
				const imagePath = row.original.images
				const imageUrl = getImageUrl(imagePath)

				return (
					<div className='w-12 h-12 rounded-md overflow-hidden bg-muted flex items-center justify-center flex-shrink-0'>
						{imageUrl ? (
							<img
								src={imageUrl}
								alt={row.original.name}
								className='w-full h-full object-cover'
								onError={(e) => {
									e.currentTarget.style.display = 'none'
									const parent = e.currentTarget.parentElement
									if (parent) {
										parent.innerHTML =
											'<svg class="h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'
									}
								}}
							/>
						) : (
							<ImageIcon className='h-5 w-5 text-muted-foreground' />
						)}
					</div>
				)
			},
		},
		{
			accessorKey: 'name',
			header: ({ column }) => (
				<Button
					variant='ghost'
					onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
				>
					Produit
					<ArrowUpDown className='ml-2 h-4 w-4' />
				</Button>
			),
			cell: ({ row }) => {
				const name = row.getValue<string>('name')
				const product = row.original

				// ✅ Utilise les nouvelles fonctions qui gèrent AppPOS et PocketBase
				const categoryPaths = getProductCategoryPaths(product)
				const brandName = getBrandName(product)
				const supplierName = getSupplierName(product)

				const hasCategories = categoryPaths.length > 0
				const hasBrandOrSupplier = brandName || supplierName

				return (
					<div className='space-y-0.5'>
						<div className='font-medium'>{name}</div>

						{hasCategories && (
							<div className='flex items-center gap-1 text-xs text-muted-foreground'>
								<Tags className='h-3 w-3 flex-shrink-0' />
								<span>{categoryPaths.join(' • ')}</span>
							</div>
						)}

						{hasBrandOrSupplier && (
							<div className='flex items-center gap-3 text-xs'>
								{brandName && (
									<div className='flex items-center gap-1 text-blue-600'>
										<Building2 className='h-3 w-3' />
										<span>{brandName}</span>
									</div>
								)}
								{supplierName && (
									<div className='flex items-center gap-1 text-orange-600'>
										<Truck className='h-3 w-3' />
										<span>{supplierName}</span>
									</div>
								)}
							</div>
						)}
					</div>
				)
			},
		},
		{
			accessorKey: 'barcode',
			header: 'Code-barres',
			cell: ({ row }) => {
				const barcode = row.getValue<string>('barcode')
				return barcode ? (
					<span className='flex items-center gap-1 font-mono text-sm'>
						<Barcode className='h-3 w-3' />
						{barcode}
					</span>
				) : (
					<span className='text-muted-foreground'>-</span>
				)
			},
		},
		{
			accessorKey: 'price_ttc',
			header: ({ column }) => (
				<Button
					variant='ghost'
					onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
				>
					Prix
					<ArrowUpDown className='ml-2 h-4 w-4' />
				</Button>
			),
			cell: ({ row }) => {
				const rawPrice = row.getValue<any>('price_ttc')
				const price =
					rawPrice == null || rawPrice === ''
						? undefined
						: typeof rawPrice === 'number'
							? rawPrice
							: Number(rawPrice)

				const rawCost = row.original.cost_price as any
				const cost =
					rawCost == null || rawCost === ''
						? undefined
						: typeof rawCost === 'number'
							? rawCost
							: Number(rawCost)

				if (price == null || Number.isNaN(price)) {
					return (
						<div>
							<div className='text-muted-foreground'>-</div>
							{cost != null && !Number.isNaN(cost) && cost > 0 && (
								<div className='text-xs text-muted-foreground'>
									Achat: {cost.toFixed(2)} €
								</div>
							)}
						</div>
					)
				}

				return (
					<div>
						<div className='font-medium'>{price.toFixed(2)} €</div>
						{cost != null && !Number.isNaN(cost) && cost > 0 && (
							<div className='text-xs text-muted-foreground'>
								Achat: {cost.toFixed(2)} €
							</div>
						)}
					</div>
				)
			},
		},
		{
			accessorKey: 'stock_quantity',
			header: 'Stock',
			cell: ({ row }) => {
				const rawStock = row.getValue<any>('stock_quantity')
				const stock =
					rawStock == null || rawStock === ''
						? undefined
						: typeof rawStock === 'number'
							? rawStock
							: Number(rawStock)

				if (stock == null || Number.isNaN(stock)) {
					return <span className='text-muted-foreground'>-</span>
				}

				return (
					<Badge
						variant={
							stock > 10 ? 'default' : stock > 0 ? 'secondary' : 'destructive'
						}
					>
						{stock}
					</Badge>
				)
			},
		},
		{
			accessorKey: 'active',
			header: 'Statut',
			cell: ({ row }) => {
				const active = row.getValue<boolean>('active')
				return (
					<Badge variant={active !== false ? 'default' : 'secondary'}>
						{active !== false ? 'Actif' : 'Inactif'}
					</Badge>
				)
			},
		},
		{
			id: 'actions',
			cell: ({ row }) => {
				const product = row.original
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='ghost' className='h-8 w-8 p-0'>
								<MoreHorizontal className='h-4 w-4' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end'>
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() =>
									navigator.clipboard.writeText(product.barcode || '')
								}
							>
								Copier le code-barres
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)
			},
		},
	]

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onPaginationChange: setPagination,
		state: { sorting, columnFilters, pagination },
	})
	console.log('expand[0]:', JSON.stringify(data[0]?.expand))
	return (
		<div className='space-y-4'>
			<div className='rounded-md border'>
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow key={row.id}>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className='h-24 text-center'
								>
									Aucun produit.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<div className='flex items-center justify-between'>
				<div className='text-sm text-muted-foreground'>
					{(() => {
						const total = table.getFilteredRowModel().rows.length
						const { pageIndex, pageSize } = table.getState().pagination
						const from = total === 0 ? 0 : pageIndex * pageSize + 1
						const to = Math.min((pageIndex + 1) * pageSize, total)
						return `${from}–${to} sur ${total} produit${total > 1 ? 's' : ''}`
					})()}
				</div>
				<div className='flex items-center gap-4'>
					<div className='flex items-center gap-2 text-sm'>
						<span className='text-muted-foreground'>Lignes&nbsp;:</span>
						<select
							className='h-8 rounded-md border border-input bg-background px-2 text-sm'
							value={pagination.pageSize}
							onChange={(e) =>
								setPagination((p) => ({
									...p,
									pageIndex: 0,
									pageSize: Number(e.target.value),
								}))
							}
						>
							{[10, 25, 50, 100].map((size) => (
								<option key={size} value={size}>
									{size}
								</option>
							))}
						</select>
					</div>
					<div className='flex items-center gap-1 text-sm text-muted-foreground'>
						Page {table.getState().pagination.pageIndex + 1} /{' '}
						{table.getPageCount()}
					</div>
					<div className='flex items-center space-x-2'>
						<Button
							variant='outline'
							size='sm'
							onClick={() => table.setPageIndex(0)}
							disabled={!table.getCanPreviousPage()}
						>
							«
						</Button>
						<Button
							variant='outline'
							size='sm'
							onClick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
						>
							Précédent
						</Button>
						<Button
							variant='outline'
							size='sm'
							onClick={() => table.nextPage()}
							disabled={!table.getCanNextPage()}
						>
							Suivant
						</Button>
						<Button
							variant='outline'
							size='sm'
							onClick={() => table.setPageIndex(table.getPageCount() - 1)}
							disabled={!table.getCanNextPage()}
						>
							»
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
