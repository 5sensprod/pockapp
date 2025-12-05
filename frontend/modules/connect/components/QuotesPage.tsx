// frontend/modules/connect/components/QuotesPage.tsx
// Page de gestion des devis (quotes)

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useDeleteQuote, useQuotes } from '@/lib/queries/quotes'
import type { QuoteResponse, QuoteStatus } from '@/lib/types/invoice.types'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import {
	ArrowRight,
	CheckCircle,
	FileText,
	MoreHorizontal,
	Plus,
	Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

function formatDate(dateStr?: string) {
	if (!dateStr) return '-'
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
}

function formatCurrency(amount: number, currency = 'EUR') {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency,
	}).format(amount)
}

function getQuoteStatusLabel(status: QuoteStatus) {
	const map: Record<QuoteStatus, string> = {
		draft: 'Brouillon',
		sent: 'Envoyé',
		accepted: 'Accepté',
		rejected: 'Refusé',
	}
	return map[status]
}

function getQuoteStatusVariant(
	status: QuoteStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
	switch (status) {
		case 'draft':
			return 'secondary'
		case 'sent':
			return 'outline'
		case 'accepted':
			return 'default'
		case 'rejected':
			return 'destructive'
	}
}

export function QuotesPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	// Filtres
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all')

	// Dialogs suppression
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [quoteToDelete, setQuoteToDelete] = useState<QuoteResponse | null>(null)

	// Dialog transformation en facture
	const [convertDialogOpen, setConvertDialogOpen] = useState(false)
	const [quoteToConvert, setQuoteToConvert] = useState<QuoteResponse | null>(
		null,
	)

	// Queries
	const { data: quotesData, isLoading } = useQuotes({
		companyId: activeCompanyId ?? undefined,
		status: statusFilter !== 'all' ? statusFilter : undefined,
		filter: searchTerm ? `number ~ "${searchTerm}"` : undefined,
	})

	const quotes = (quotesData?.items ?? []) as QuoteResponse[]

	// Mutations
	const deleteQuote = useDeleteQuote()

	const convertQuoteToInvoice = useMutation({
		mutationFn: async (quote: QuoteResponse) => {
			if (!activeCompanyId) {
				throw new Error('Aucune entreprise active')
			}

			// 1️⃣ Générer un numéro de facture (logique proche de InvoiceCreatePage / useGenerateInvoiceNumber)
			const year = new Date().getFullYear()
			const prefix = `FAC-${year}-`

			let nextNumber = 1
			try {
				const lastInvoice = await pb.collection('invoices').getList(1, 1, {
					filter: `owner_company = "${activeCompanyId}" && invoice_type = "invoice" && number ~ "${prefix}"`,
					sort: '-sequence_number',
				})

				if (lastInvoice.items.length > 0) {
					const lastNumber = (lastInvoice.items[0] as InvoiceResponse).number
					const match = lastNumber.match(/FAC-\d{4}-(\d+)/)
					if (match) {
						nextNumber = Number.parseInt(match[1], 10) + 1
					}
				}
			} catch (err) {
				console.error('Erreur lors de la génération du numéro de facture', err)
			}

			const invoiceNumber = `${prefix}${String(nextNumber).padStart(6, '0')}`

			// 2️⃣ Créer la facture officielle à partir du devis
			const invoicePayload = {
				number: invoiceNumber,
				invoice_type: 'invoice' as const,
				date: new Date().toISOString(), // ou quote.date si tu préfères
				due_date: undefined,
				customer: quote.customer,
				owner_company: quote.owner_company,
				status: 'validated' as const,
				is_paid: false,
				items: quote.items,
				total_ht: quote.total_ht,
				total_tva: quote.total_tva,
				total_ttc: quote.total_ttc,
				currency: quote.currency,
				notes: quote.notes,
			}

			const createdInvoice = (await pb
				.collection('invoices')
				.create(invoicePayload)) as InvoiceResponse

			// 3️⃣ Marquer le devis comme accepté + lien vers la facture
			await pb.collection('quotes').update(quote.id, {
				status: 'accepted',
				generated_invoice_id: createdInvoice.id,
			})

			return createdInvoice
		},
		onSuccess: async (invoice, quote) => {
			toast.success(
				`Facture ${invoice.number} créée à partir du devis ${quote.number}`,
			)
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ['quotes'] }),
				queryClient.invalidateQueries({ queryKey: ['invoices'] }),
			])
		},
		onError: (error: any) => {
			toast.error(error?.message || 'Erreur lors de la création de la facture')
		},
	})

	// Handlers
	const handleOpenDelete = (quote: QuoteResponse) => {
		setQuoteToDelete(quote)
		setDeleteDialogOpen(true)
	}

	const handleConfirmDelete = async () => {
		if (!quoteToDelete) return

		try {
			await deleteQuote.mutateAsync(quoteToDelete.id)
			toast.success(`Devis ${quoteToDelete.number} supprimé`)
		} catch (error: any) {
			toast.error(error?.message || 'Erreur lors de la suppression du devis')
		} finally {
			setDeleteDialogOpen(false)
			setQuoteToDelete(null)
		}
	}

	const handleOpenConvert = (quote: QuoteResponse) => {
		setQuoteToConvert(quote)
		setConvertDialogOpen(true)
	}

	const handleConfirmConvert = async () => {
		if (!quoteToConvert) return
		try {
			await convertQuoteToInvoice.mutateAsync(quoteToConvert)
			setConvertDialogOpen(false)
			setQuoteToConvert(null)
		} catch {
			// OnError géré dans la mutation
		}
	}

	return (
		<div className='container mx-auto px-6 py-8'>
			{/* Header */}
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold flex items-center gap-2'>
						<FileText className='h-6 w-6' />
						Devis
					</h1>
					<p className='text-muted-foreground'>
						Gérez vos devis clients et transformez-les en factures.
					</p>
				</div>
				<Button
					onClick={() => navigate({ to: '/connect/quotes/new' })}
					className='gap-2'
				>
					<Plus className='h-4 w-4' />
					Nouveau devis
				</Button>
			</div>

			{/* Filtres */}
			<div className='flex gap-4 mb-6 flex-wrap'>
				<div className='flex-1 max-w-sm'>
					<Input
						placeholder='Rechercher par numéro...'
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
					/>
				</div>

				<Select
					value={statusFilter}
					onValueChange={(value) =>
						setStatusFilter(value as QuoteStatus | 'all')
					}
				>
					<SelectTrigger className='w-[200px]'>
						<SelectValue placeholder='Statut' />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='all'>Tous les statuts</SelectItem>
						<SelectItem value='draft'>Brouillons</SelectItem>
						<SelectItem value='sent'>Envoyés</SelectItem>
						<SelectItem value='accepted'>Acceptés</SelectItem>
						<SelectItem value='rejected'>Refusés</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Table */}
			{isLoading ? (
				<div className='text-center py-12 text-muted-foreground'>
					Chargement...
				</div>
			) : quotes.length === 0 ? (
				<div className='text-center py-12'>
					<FileText className='h-12 w-12 mx-auto text-muted-foreground/50 mb-4' />
					<p className='text-muted-foreground'>Aucun devis pour le moment</p>
					<Button
						className='mt-4'
						onClick={() => navigate({ to: '/connect/quotes/new' })}
					>
						Créer mon premier devis
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
								<TableHead>Montant TTC</TableHead>
								<TableHead>Statut</TableHead>
								<TableHead>Facture liée</TableHead>
								<TableHead className='w-10' />
							</TableRow>
						</TableHeader>
						<TableBody>
							{quotes.map((quote) => {
								const customer = quote.expand?.customer
								const linkedInvoice = quote.expand?.generated_invoice_id as
									| InvoiceResponse
									| undefined

								return (
									<TableRow key={quote.id}>
										<TableCell className='font-mono font-medium'>
											{quote.number}
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
										<TableCell>{formatDate(quote.date)}</TableCell>
										<TableCell className='font-medium'>
											{formatCurrency(quote.total_ttc, quote.currency)}
										</TableCell>
										<TableCell>
											<Badge variant={getQuoteStatusVariant(quote.status)}>
												{getQuoteStatusLabel(quote.status)}
											</Badge>
										</TableCell>
										<TableCell>
											{linkedInvoice ? (
												<div className='flex items-center gap-2 text-sm text-green-700'>
													<CheckCircle className='h-4 w-4' />
													<span>Facture {linkedInvoice.number}</span>
												</div>
											) : (
												<span className='text-xs text-muted-foreground'>
													Pas encore transformé
												</span>
											)}
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

													<DropdownMenuItem
														onClick={() =>
															navigate({
																to: '/connect/quotes/$quoteId',
																params: { quoteId: quote.id },
															})
														}
													>
														<FileText className='h-4 w-4 mr-2' />
														Voir
													</DropdownMenuItem>

													<DropdownMenuItem
														onClick={() =>
															navigate({
																to: '/connect/quotes/$quoteId/edit',
																params: { quoteId: quote.id },
															})
														}
													>
														<FileText className='h-4 w-4 mr-2' />
														Modifier
													</DropdownMenuItem>

													<DropdownMenuSeparator />

													<DropdownMenuItem
														disabled={
															!!quote.generated_invoice_id ||
															convertQuoteToInvoice.isPending
														}
														onClick={() => handleOpenConvert(quote)}
													>
														<ArrowRight className='h-4 w-4 mr-2' />
														Transformer en facture
													</DropdownMenuItem>

													<DropdownMenuSeparator />

													<DropdownMenuItem
														onClick={() => handleOpenDelete(quote)}
														className='text-red-600'
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

			{/* AlertDialog suppression devis */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Supprimer ce devis ?</AlertDialogTitle>
						<AlertDialogDescription>
							Cette action est irréversible. Le devis{' '}
							<strong>{quoteToDelete?.number}</strong> sera définitivement
							supprimé. Aucune écriture légale n&apos;est liée à un devis, donc
							cette operation ne crée pas de trou dans la numérotation de
							factures.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Annuler</AlertDialogCancel>
						<AlertDialogAction
							className='bg-red-600 hover:bg-red-700'
							onClick={handleConfirmDelete}
						>
							Supprimer
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Dialog transformation en facture */}
			<Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Transformer en facture</DialogTitle>
						<DialogDescription>
							Vous allez créer une facture officielle à partir du devis{' '}
							<strong>{quoteToConvert?.number}</strong>. La facture sera
							numérotée, chaînée et ne pourra plus être supprimée (seule une
							annulation par avoir sera possible).
						</DialogDescription>
					</DialogHeader>

					{quoteToConvert && (
						<div className='mt-4 space-y-1 text-sm'>
							<p>
								<strong>Client :</strong>{' '}
								{quoteToConvert.expand?.customer?.name}
							</p>
							<p>
								<strong>Montant TTC :</strong>{' '}
								{formatCurrency(
									quoteToConvert.total_ttc,
									quoteToConvert.currency,
								)}
							</p>
						</div>
					)}

					<DialogFooter className='mt-4'>
						<Button
							variant='outline'
							onClick={() => setConvertDialogOpen(false)}
							disabled={convertQuoteToInvoice.isPending}
						>
							Annuler
						</Button>
						<Button
							onClick={handleConfirmConvert}
							disabled={convertQuoteToInvoice.isPending}
						>
							{convertQuoteToInvoice.isPending
								? 'Création...'
								: 'Créer la facture'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
