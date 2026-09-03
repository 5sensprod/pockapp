// frontend/modules/stock/components/ProductTable.tsx
//
// La table du catalogue. UNE seule provenance : PocketBase, par des lignes déjà
// résolues (`lib/queries/catalog-rows.ts`) — noms de marque, de fournisseur et
// de catégories, et l'URL de l'image.
//
// Elle ne fait aucune requête et ne construit aucune URL. Elle a porté les deux
// bases jusqu'au 18 août 2026 ; c'est ce qui a laissé « Supprimer » appeler une
// suppression PocketBase avec un identifiant NeDB.
//
// La PAGINATION est celle de l'appelant quand il en a une : le catalogue porte
// 2999 produits, la page vient du serveur, et paginer une deuxième fois en
// mémoire donnerait « 1–10 sur 25 » sous une table qui en montre 25.

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
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
	HeartPulse,
	ImageIcon,
	MoreHorizontal,
	Printer,
	Tags,
	Trash2,
	Truck,
} from 'lucide-react'
import { useState } from 'react'

import type { StockProductRow } from '@/lib/queries/catalog-rows'
import { PrintLabelDialog } from './PrintLabelDialog'

interface ProductTableProps {
	data: StockProductRow[]
	/** Cliquer une ligne. Absent = la table n'est pas cliquable. */
	onRowClick?: (product: StockProductRow) => void
	/** `false` quand l'appelant pagine côté serveur — c'est le cas du catalogue. */
	paginated?: boolean
	/** Demander la suppression d'une ligne. Absent = l'entrée n'est pas proposée.
	 *  La table ne supprime RIEN elle-même : elle a porté les deux bases jusqu'au
	 *  18 août 2026, et c'est ce qui a laissé « Supprimer » appeler une
	 *  suppression PocketBase avec un identifiant NeDB. Elle rend la ligne,
	 *  l'appelant confirme et écrit. */
	onDelete?: (product: StockProductRow) => void
	/** Tri contrôlé par l'appelant quand les pages sont chargées par le serveur. */
	sorting?: SortingState
	onSortingChange?: (sorting: SortingState) => void
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
	dateStyle: 'short',
	timeStyle: 'short',
})

export function ProductTable({
	data,
	onRowClick,
	onDelete,
	paginated = true,
	sorting: controlledSorting,
	onSortingChange,
}: ProductTableProps) {
	// La ligne dont on imprime l'étiquette. Une seule boîte pour toute la
	// table : chaque ligne n'a qu'à dire laquelle.
	const [labelRow, setLabelRow] = useState<StockProductRow | null>(null)
	const [localSorting, setLocalSorting] = useState<SortingState>([])
	const sorting = controlledSorting ?? localSorting
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	})

	const columns: ColumnDef<StockProductRow>[] = [
		// ✅ COLONNE IMAGE
		{
			id: 'image',
			header: '',
			size: 60,
			cell: ({ row }) => {
				const imageUrl = row.original.imageUrl

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
				const categoryPaths = product.categoryNames
				const brandName = product.brandName
				const supplierName = product.supplierName

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
				// Les valeurs arrivent typées depuis PocketBase. Les conversions
				// défensives d'avant venaient d'AppPos, qui rendait des chaînes.
				const price = row.getValue<number | null>('price_ttc') ?? undefined
				const cost = row.original.purchase_price_ht ?? undefined

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
			accessorKey: 'stock',
			header: 'Stock',
			cell: ({ row }) => {
				const stock = row.getValue<number | null>('stock') ?? undefined

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
			accessorKey: 'created',
			header: ({ column }) => (
				<Button
					variant='ghost'
					onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
				>
					Ajouté le
					<ArrowUpDown className='ml-2 h-4 w-4' />
				</Button>
			),
			cell: ({ row }) => {
				const created = row.getValue<string | null>('created')
				if (!created) return <span className='text-muted-foreground'>-</span>

				const date = new Date(created)
				return Number.isNaN(date.getTime()) ? (
					<span className='text-muted-foreground'>-</span>
				) : (
					<span className='whitespace-nowrap text-sm'>
						{dateFormatter.format(date)}
					</span>
				)
			},
		},
		{
			accessorKey: 'healthScore',
			header: ({ column }) => (
				<Button
					variant='ghost'
					onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
				>
					Santé
					<ArrowUpDown className='ml-2 h-4 w-4' />
				</Button>
			),
			cell: ({ row }) => {
				const score = row.original.healthScore
				const max = row.original.healthMax
				const missing = row.original.healthMissing
				const tone =
					score === max
						? 'bg-emerald-500'
						: score >= Math.ceil(max / 2)
							? 'bg-amber-500'
							: 'bg-destructive'
				return (
					<div
						className='inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-xs tabular-nums'
						title={
							missing.length
								? `À compléter : ${missing.join(', ')}`
								: 'Fiche prête pour le site'
						}
					>
						<HeartPulse className='h-3.5 w-3.5 text-muted-foreground' />
						<span className={`h-2 w-2 rounded-full ${tone}`} />
						{score}/{max}
					</div>
				)
			},
		},
		{
			accessorKey: 'status',
			header: 'Statut',
			cell: ({ row }) => {
				// L'intention de publication du catalogue en ligne — pas un « actif /
				// inactif », qui n'existe plus au schéma depuis `catalog_v2`.
				const publie = row.getValue<string>('status') === 'published'
				return (
					<Badge variant={publie ? 'default' : 'secondary'}>
						{publie ? 'Publié' : 'Brouillon'}
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
								onClick={(event) => {
									// La ligne est cliquable et ouvre la fiche : sans cela,
									// imprimer ouvrirait AUSSI le produit.
									event.stopPropagation()
									setLabelRow(product)
								}}
							>
								<Printer className='mr-2 h-4 w-4' />
								Imprimer l’étiquette…
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() =>
									navigator.clipboard.writeText(product.barcode || '')
								}
							>
								Copier le code-barres
							</DropdownMenuItem>
							{onDelete ? (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										className='text-destructive focus:text-destructive'
										onClick={(event) => {
											// La ligne est cliquable et ouvre la fiche : sans cela,
											// demander la suppression ouvrirait AUSSI le produit.
											event.stopPropagation()
											onDelete(product)
										}}
									>
										<Trash2 className='mr-2 h-4 w-4' />
										Supprimer…
									</DropdownMenuItem>
								</>
							) : null}
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
		...(paginated ? { getPaginationRowModel: getPaginationRowModel() } : {}),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onSortingChange: (updater) => {
			const nextSorting =
				typeof updater === 'function' ? updater(sorting) : updater
			if (onSortingChange) onSortingChange(nextSorting)
			else setLocalSorting(nextSorting)
		},
		manualSorting: controlledSorting !== undefined,
		onColumnFiltersChange: setColumnFilters,
		onPaginationChange: setPagination,
		state: { sorting, columnFilters, pagination },
	})
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
								<TableRow
									key={row.id}
									className={onRowClick ? 'cursor-pointer' : undefined}
									onClick={
										onRowClick ? () => onRowClick(row.original) : undefined
									}
								>
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

			{paginated && (
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
			)}

			<PrintLabelDialog
				product={{
					designation: labelRow?.designation ?? undefined,
					sku: labelRow?.sku ?? undefined,
					barcode: labelRow?.barcode ?? undefined,
					price_ttc: labelRow?.price_ttc ?? undefined,
				}}
				open={labelRow !== null}
				onOpenChange={(open) => {
					if (!open) setLabelRow(null)
				}}
			/>
		</div>
	)
}
