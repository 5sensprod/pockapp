// frontend/modules/connect/features/customers/CustomerTable.tsx

import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
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
	type SortingState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	useReactTable,
} from '@tanstack/react-table'
import {
	ArrowUpDown,
	Building2,
	ChevronLeft,
	ChevronRight,
	Eye,
	Landmark,
	Mail,
	Pencil,
	Phone,
	Trash2,
	User,
	Users,
} from 'lucide-react'
import type { Customer } from './CustomerDialog'

interface CustomerTableProps {
	data: Customer[]
	onEditCustomer: (customer: Customer) => void
	isLoading?: boolean
	page: number
	totalPages: number
	totalItems: number
	perPage: number
	onPageChange: (page: number) => void
}

const getCustomerTypeLabel = (type?: string) => {
	switch (type) {
		case 'individual':
			return 'Particulier'
		case 'professional':
			return 'Professionnel'
		case 'administration':
			return 'Administration'
		case 'association':
			return 'Association'
		default:
			return 'Particulier'
	}
}

const getCustomerTypeIcon = (type?: string) => {
	switch (type) {
		case 'professional':
			return <Building2 className='h-3 w-3' />
		case 'administration':
			return <Landmark className='h-3 w-3' />
		case 'association':
			return <Users className='h-3 w-3' />
		default:
			return <User className='h-3 w-3' />
	}
}

export function CustomerTable({
	data,
	onEditCustomer,
	isLoading = false,
	page,
	totalPages,
	totalItems,
	perPage,
	onPageChange,
}: CustomerTableProps) {
	const navigate = useNavigate()
	const [sorting, setSorting] = useState<SortingState>([])
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

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
				const customerType = row.original.customer_type
				return (
					<div>
						<div className='font-medium flex items-center gap-2'>
							{getCustomerTypeIcon(customerType)}
							{name}
						</div>
						{company && (
							<div className='text-sm text-muted-foreground'>{company}</div>
						)}
					</div>
				)
			},
		},
		{
			accessorKey: 'customer_type',
			header: 'Type',
			cell: ({ row }) => {
				const type = row.getValue<string | undefined>('customer_type')
				const typeColors: Record<string, string> = {
					individual: 'bg-blue-100 text-blue-800',
					professional: 'bg-purple-100 text-purple-800',
					administration: 'bg-green-100 text-green-800',
					association: 'bg-orange-100 text-orange-800',
				}
				return (
					<Badge
						variant='secondary'
						className={typeColors[type || 'individual'] || ''}
					>
						{getCustomerTypeLabel(type)}
					</Badge>
				)
			},
		},
		{
			accessorKey: 'email',
			header: 'Email',
			cell: ({ row }) => {
				const email = row.getValue<string | undefined>('email')
				return email ? (
					<span className='flex items-center gap-1 text-foreground'>
						<Mail className='h-3 w-3 text-muted-foreground' />
						{email}
					</span>
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
						onClick={(e) => e.stopPropagation()}
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
	]

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		state: { sorting, columnFilters },
	})

	const rangeStart = totalItems === 0 ? 0 : (page - 1) * perPage + 1
	const rangeEnd = Math.min(page * perPage, totalItems)

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
						{isLoading ? (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className='h-24 text-center'
								>
									<div className='flex items-center justify-center'>
										<div className='h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin' />
									</div>
								</TableCell>
							</TableRow>
						) : table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => {
								const customer = row.original
								return (
									<DropdownMenu key={row.id} modal={false}>
										<DropdownMenuTrigger asChild>
											<TableRow className='cursor-pointer hover:bg-muted/50 data-[state=open]:bg-muted transition-colors'>
												{row.getVisibleCells().map((cell) => (
													<TableCell key={cell.id}>
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext(),
														)}
													</TableCell>
												))}
											</TableRow>
										</DropdownMenuTrigger>

										<DropdownMenuContent align='center' className='w-48'>
											<DropdownMenuLabel>{customer.name}</DropdownMenuLabel>
											<DropdownMenuSeparator />

											<DropdownMenuItem
												onClick={() =>
													navigate({
														to: '/connect/customers/$customerId',
														params: { customerId: customer.id },
													})
												}
											>
												<Eye className='h-4 w-4 mr-2' />
												Voir
											</DropdownMenuItem>

											<DropdownMenuItem
												onClick={() => onEditCustomer(customer)}
											>
												<Pencil className='h-4 w-4 mr-2' />
												Modifier
											</DropdownMenuItem>

											<DropdownMenuSeparator />

											<DropdownMenuItem
												className='text-red-600 focus:text-red-700'
												onClick={() => askDelete(customer)}
											>
												<Trash2 className='h-4 w-4 mr-2' />
												Supprimer
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								)
							})
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

			{/* ── Pagination serveur ──────────────────────────────────────── */}
			<div className='flex items-center justify-between'>
				<div className='text-sm text-muted-foreground'>
					{totalItems === 0
						? '0 client'
						: `${rangeStart}–${rangeEnd} sur ${totalItems} client${totalItems > 1 ? 's' : ''}`}
				</div>
				<div className='flex items-center gap-1'>
					<Button
						variant='outline'
						size='sm'
						onClick={() => onPageChange(page - 1)}
						disabled={page <= 1}
					>
						<ChevronLeft className='h-4 w-4' />
						Précédent
					</Button>
					<span className='px-3 text-sm text-muted-foreground'>
						{page} / {totalPages}
					</span>
					<Button
						variant='outline'
						size='sm'
						onClick={() => onPageChange(page + 1)}
						disabled={page >= totalPages}
					>
						Suivant
						<ChevronRight className='h-4 w-4' />
					</Button>
				</div>
			</div>

			{/* ── Dialog confirmation suppression ─────────────────────────── */}
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
