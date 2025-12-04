// frontend/modules/connect/components/InvoicesPage.tsx
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
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import {
	type InvoiceResponse,
	useDeleteInvoice,
	useInvoices,
	useMarkInvoiceAsPaid,
} from '@/lib/queries/invoices'
import { useNavigate } from '@tanstack/react-router'
import {
	CheckCircle,
	Download,
	Eye,
	FileText,
	MoreHorizontal,
	Plus,
	Send,
	Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

// ============================================================================
// HELPERS
// ============================================================================

const statusConfig: Record<
	string,
	{
		label: string
		variant: 'default' | 'secondary' | 'destructive' | 'outline'
	}
> = {
	draft: { label: 'Brouillon', variant: 'secondary' },
	sent: { label: 'Envoyée', variant: 'outline' },
	paid: { label: 'Payée', variant: 'default' },
	cancelled: { label: 'Annulée', variant: 'destructive' },
}

function formatDate(dateStr: string) {
	if (!dateStr) return '-'
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
}

function formatCurrency(amount: number) {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(amount)
}

// ============================================================================
// COMPONENT
// ============================================================================

export function InvoicesPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()

	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<string>('all')
	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
	const [invoiceToDelete, setInvoiceToDelete] =
		useState<InvoiceResponse | null>(null)

	const { data: invoicesData, isLoading } = useInvoices({
		companyId: activeCompanyId ?? undefined,
		status: statusFilter !== 'all' ? statusFilter : undefined,
		filter: searchTerm ? `number ~ "${searchTerm}"` : undefined,
	})

	const deleteInvoice = useDeleteInvoice()
	const markAsPaid = useMarkInvoiceAsPaid()

	const invoices = (invoicesData?.items ?? []) as InvoiceResponse[]

	// Stats
	const stats = invoices.reduce(
		(acc, inv) => {
			acc.total++
			acc.totalTTC += inv.total_ttc
			if (inv.status === 'paid') acc.paid += inv.total_ttc
			if (inv.status === 'sent') acc.pending += inv.total_ttc
			return acc
		},
		{ total: 0, totalTTC: 0, paid: 0, pending: 0 },
	)

	const handleDelete = async () => {
		if (!invoiceToDelete) return
		try {
			await deleteInvoice.mutateAsync(invoiceToDelete.id)
			toast.success(`Facture ${invoiceToDelete.number} supprimée`)
		} catch (error) {
			toast.error('Erreur lors de la suppression')
		} finally {
			setConfirmDeleteOpen(false)
			setInvoiceToDelete(null)
		}
	}

	const handleMarkAsPaid = async (invoice: InvoiceResponse) => {
		try {
			await markAsPaid.mutateAsync({ id: invoice.id })
			toast.success(`Facture ${invoice.number} marquée comme payée`)
		} catch (error) {
			toast.error('Erreur lors de la mise à jour')
		}
	}

	return (
		<div className='container mx-auto px-6 py-8'>
			{/* Header */}
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold flex items-center gap-2'>
						<FileText className='h-6 w-6' />
						Factures
					</h1>
					<p className='text-muted-foreground'>Gérez vos factures clients</p>
				</div>
				<Button
					onClick={() => navigate({ to: '/connect/invoices/new' })}
					className='gap-2'
				>
					<Plus className='h-4 w-4' />
					Nouvelle facture
				</Button>
			</div>

			{/* Stats */}
			<div className='grid sm:grid-cols-4 gap-4 mb-6'>
				<div className='bg-muted/30 rounded-lg p-4'>
					<p className='text-sm text-muted-foreground'>Total factures</p>
					<p className='text-2xl font-bold'>{stats.total}</p>
				</div>
				<div className='bg-muted/30 rounded-lg p-4'>
					<p className='text-sm text-muted-foreground'>Montant total</p>
					<p className='text-2xl font-bold'>{formatCurrency(stats.totalTTC)}</p>
				</div>
				<div className='bg-green-50 rounded-lg p-4'>
					<p className='text-sm text-green-600'>Encaissé</p>
					<p className='text-2xl font-bold text-green-700'>
						{formatCurrency(stats.paid)}
					</p>
				</div>
				<div className='bg-orange-50 rounded-lg p-4'>
					<p className='text-sm text-orange-600'>En attente</p>
					<p className='text-2xl font-bold text-orange-700'>
						{formatCurrency(stats.pending)}
					</p>
				</div>
			</div>

			{/* Filtres */}
			<div className='flex gap-4 mb-6'>
				<div className='flex-1 max-w-sm'>
					<Input
						placeholder='Rechercher par numéro...'
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
					/>
				</div>
				<Select value={statusFilter} onValueChange={setStatusFilter}>
					<SelectTrigger className='w-[180px]'>
						<SelectValue placeholder='Statut' />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='all'>Tous les statuts</SelectItem>
						<SelectItem value='draft'>Brouillon</SelectItem>
						<SelectItem value='sent'>Envoyée</SelectItem>
						<SelectItem value='paid'>Payée</SelectItem>
						<SelectItem value='cancelled'>Annulée</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Table */}
			{isLoading ? (
				<div className='text-center py-12 text-muted-foreground'>
					Chargement...
				</div>
			) : invoices.length === 0 ? (
				<div className='text-center py-12'>
					<FileText className='h-12 w-12 mx-auto text-muted-foreground/50 mb-4' />
					<p className='text-muted-foreground'>Aucune facture</p>
					<Button
						className='mt-4'
						onClick={() => navigate({ to: '/connect/invoices/new' })}
					>
						Créer ma première facture
					</Button>
				</div>
			) : (
				<div className='rounded-md border'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Numéro</TableHead>
								<TableHead>Client</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>Échéance</TableHead>
								<TableHead>Statut</TableHead>
								<TableHead className='text-right'>Montant TTC</TableHead>
								<TableHead className='w-10' />
							</TableRow>
						</TableHeader>
						<TableBody>
							{invoices.map((invoice) => {
								const status =
									statusConfig[invoice.status] || statusConfig.draft
								const customer = invoice.expand?.customer

								return (
									<TableRow key={invoice.id}>
										<TableCell className='font-mono font-medium'>
											{invoice.number}
										</TableCell>
										<TableCell>
											<div>
												<p className='font-medium'>
													{customer?.name || 'Client inconnu'}
												</p>
												{customer?.email && (
													<p className='text-xs text-muted-foreground'>
														{customer.email}
													</p>
												)}
											</div>
										</TableCell>
										<TableCell>{formatDate(invoice.date)}</TableCell>
										<TableCell>
											{invoice.due_date ? formatDate(invoice.due_date) : '-'}
										</TableCell>
										<TableCell>
											<Badge variant={status.variant}>{status.label}</Badge>
										</TableCell>
										<TableCell className='text-right font-medium'>
											{formatCurrency(invoice.total_ttc)}
										</TableCell>
										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant='ghost' className='h-8 w-8 p-0'>
														<MoreHorizontal className='h-4 w-4' />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align='end'>
													<DropdownMenuLabel>Actions</DropdownMenuLabel>
													<DropdownMenuItem>
														<Eye className='h-4 w-4 mr-2' />
														Voir
													</DropdownMenuItem>
													<DropdownMenuItem>
														<Download className='h-4 w-4 mr-2' />
														Télécharger PDF
													</DropdownMenuItem>
													{invoice.status === 'draft' && (
														<DropdownMenuItem>
															<Send className='h-4 w-4 mr-2' />
															Envoyer
														</DropdownMenuItem>
													)}
													{invoice.status === 'sent' && (
														<DropdownMenuItem
															onClick={() => handleMarkAsPaid(invoice)}
														>
															<CheckCircle className='h-4 w-4 mr-2' />
															Marquer payée
														</DropdownMenuItem>
													)}
													<DropdownMenuSeparator />
													<DropdownMenuItem
														className='text-red-600'
														onClick={() => {
															setInvoiceToDelete(invoice)
															setConfirmDeleteOpen(true)
														}}
													>
														<Trash2 className='h-4 w-4 mr-2' />
														Supprimer
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Dialog de confirmation */}
			<Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Supprimer cette facture ?</DialogTitle>
						<DialogDescription>
							{invoiceToDelete
								? `La facture ${invoiceToDelete.number} sera définitivement supprimée.`
								: 'Cette action est irréversible.'}
						</DialogDescription>
					</DialogHeader>
					<div className='flex justify-end gap-2 pt-4'>
						<Button
							variant='outline'
							onClick={() => setConfirmDeleteOpen(false)}
						>
							Annuler
						</Button>
						<Button variant='destructive' onClick={handleDelete}>
							Supprimer
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
