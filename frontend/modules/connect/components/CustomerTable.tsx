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
import { useDeleteCustomer } from '@/lib/queries/customers'
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
	Mail,
	MoreHorizontal,
	Pencil,
	Phone,
	Trash2,
} from 'lucide-react'
// frontend/modules/connect/components/CustomerTable.tsx
import { useState } from 'react'
import { toast } from 'sonner'

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import type { Customer } from './CustomerDialog'

interface CustomerTableProps {
	data: Customer[]
	onEditCustomer: (customer: Customer) => void
}

export function CustomerTable({ data, onEditCustomer }: CustomerTableProps) {
	const [sorting, setSorting] = useState<SortingState>([])
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	})

	const deleteCustomer = useDeleteCustomer()

	const [confirmOpen, setConfirmOpen] = useState(false)
	const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(
		null,
	)

	const askDelete = (customer: Customer) => {
		setCustomerToDelete(customer)
		setConfirmOpen(true)
	}

	const confirmDelete = async () => {
		if (!customerToDelete) return

		try {
			await deleteCustomer.mutateAsync(customerToDelete.id)
			toast.success(`Client "${customerToDelete.name}" supprimé avec succès`)
		} catch (error) {
			toast.error('Erreur lors de la suppression')
			console.error(error)
		} finally {
			setConfirmOpen(false)
			setCustomerToDelete(null)
		}
	}

	const columns: ColumnDef<Customer>[] = [
		{
			accessorKey: 'name',
			header: ({ column }) => (
				<Button
					variant='ghost'
					onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
				>
					Nom
					<ArrowUpDown className='ml-2 h-4 w-4' />
				</Button>
			),
			cell: ({ row }) => {
				const name = row.getValue<string>('name')
				const company = row.original.company
				return (
					<div>
						<div className='font-medium'>{name}</div>
						{company && (
							<div className='text-sm text-muted-foreground'>{company}</div>
						)}
					</div>
				)
			},
		},
		{
			accessorKey: 'email',
			header: 'Email',
			cell: ({ row }) => {
				const email = row.getValue<string | undefined>('email')
				return email ? (
					<a
						href={`mailto:${email}`}
						className='text-blue-600 hover:underline flex items-center gap-1'
					>
						<Mail className='h-3 w-3' />
						{email}
					</a>
				) : (
					<span className='text-muted-foreground'>-</span>
				)
			},
		},
		{
			accessorKey: 'phone',
			header: 'Téléphone',
			cell: ({ row }) => {
				const phone = row.getValue<string | undefined>('phone')
				return phone ? (
					<a
						href={`tel:${phone}`}
						className='flex items-center gap-1 hover:underline'
					>
						<Phone className='h-3 w-3' />
						{phone}
					</a>
				) : (
					<span className='text-muted-foreground'>-</span>
				)
			},
		},
		{
			accessorKey: 'tags',
			header: 'Tags',
			cell: ({ row }) => {
				const raw = row.getValue<any>('tags')
				const tags: string[] = Array.isArray(raw)
					? raw
					: raw
						? [raw as string]
						: []

				const tagColors: Record<string, string> = {
					vip: 'bg-yellow-100 text-yellow-800',
					prospect: 'bg-blue-100 text-blue-800',
					actif: 'bg-green-100 text-green-800',
					inactif: 'bg-gray-100 text-gray-800',
				}
				return (
					<div className='flex gap-1 flex-wrap'>
						{tags.map((tag) => (
							<Badge
								key={tag}
								variant='secondary'
								className={tagColors[tag] || ''}
							>
								{tag}
							</Badge>
						))}
					</div>
				)
			},
		},
		{
			id: 'actions',
			cell: ({ row }) => {
				const customer = row.original
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='ghost' className='h-8 w-8 p-0'>
								<span className='sr-only'>Menu</span>
								<MoreHorizontal className='h-4 w-4' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end'>
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() =>
									navigator.clipboard.writeText(customer.email || '')
								}
							>
								Copier l&apos;email
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => onEditCustomer(customer)}>
								<Pencil className='h-4 w-4 mr-2' />
								Modifier
							</DropdownMenuItem>
							<DropdownMenuItem
								className='text-red-600'
								onClick={() => askDelete(customer)}
							>
								<Trash2 className='h-4 w-4 mr-2' />
								Supprimer
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
		state: {
			sorting,
			columnFilters,
			pagination,
		},
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
									data-state={row.getIsSelected() && 'selected'}
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
									Aucun résultat.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{/* Pagination */}
			<div className='flex items-center justify-between'>
				<div className='text-sm text-muted-foreground'>
					{table.getFilteredRowModel().rows.length} client(s) au total
				</div>
				<div className='flex items-center space-x-2'>
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
				</div>
			</div>

			{/* Boîte de dialogue de confirmation */}
			<Dialog
				open={confirmOpen}
				onOpenChange={(open) => {
					setConfirmOpen(open)
					if (!open) setCustomerToDelete(null)
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Supprimer ce client ?</DialogTitle>
						<DialogDescription>
							{customerToDelete
								? `Vous êtes sur le point de supprimer "${customerToDelete.name}". Cette action est définitive.`
								: 'Vous êtes sur le point de supprimer ce client.'}
						</DialogDescription>
					</DialogHeader>

					<div className='flex justify-end gap-2 pt-4'>
						<Button
							variant='outline'
							onClick={() => {
								setConfirmOpen(false)
								setCustomerToDelete(null)
							}}
						>
							Annuler
						</Button>
						<Button variant='destructive' onClick={confirmDelete}>
							Supprimer
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
