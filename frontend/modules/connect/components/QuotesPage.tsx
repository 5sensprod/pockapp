// frontend/modules/connect/components/QuotesPage.tsx
// Page de gestion des devis — pagination serveur + debounce + recherche client

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
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useDebounce } from '@/lib/hooks/useDebounce'
import {
	useConvertQuoteToInvoice,
	useDeleteQuote,
	useQuotes,
} from '@/lib/queries/quotes'
import type { QuoteResponse, QuoteStatus } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { pdf } from '@react-pdf/renderer'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '../utils/formatters'
import { QuotePdfDocument } from './QuotePdf'
import { QuotesTable } from './QuotesTable'
import { SendQuoteEmailDialog } from './SendQuoteEmailDialog'

const PER_PAGE = 20

export function QuotesPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	// Filtres
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all')

	// Pagination
	const [page, setPage] = useState(1)
	// const prevDebouncedRef = useRef('')
	const debouncedSearch = useDebounce(searchTerm, 400)

	// Reset page via ref quand la recherche change — sans re-render supplémentaire
	// if (debouncedSearch !== prevDebouncedRef.current) {
	// 	prevDebouncedRef.current = debouncedSearch
	// 	if (page !== 1) setPage(1)
	// }

	// Résolution des IDs clients correspondant au terme recherché
	const { data: matchingCustomerIds } = useQuery({
		queryKey: ['customer-search-ids-quotes', activeCompanyId, debouncedSearch],
		queryFn: async () => {
			if (!debouncedSearch || !activeCompanyId) return []
			const result = await pb.collection('customers').getFullList({
				filter: `owner_company = "${activeCompanyId}" && name ~ "${debouncedSearch}"`,
				fields: 'id',
			})
			return result.map((c: any) => c.id as string)
		},
		enabled: !!debouncedSearch && !!activeCompanyId,
		staleTime: 10_000,
	})

	// Filtre combiné : numéro OU clients correspondants
	const searchFilter = useMemo(() => {
		if (!debouncedSearch) return undefined
		const parts: string[] = [`number ~ "${debouncedSearch}"`]
		if (matchingCustomerIds && matchingCustomerIds.length > 0) {
			const customerFilter = matchingCustomerIds
				.map((id: string) => `customer = "${id}"`)
				.join(' || ')
			parts.push(`(${customerFilter})`)
		}
		return `(${parts.join(' || ')})`
	}, [debouncedSearch, matchingCustomerIds])

	// Dialogs
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [quoteToDelete, setQuoteToDelete] = useState<QuoteResponse | null>(null)
	const [convertDialogOpen, setConvertDialogOpen] = useState(false)
	const [quoteToConvert, setQuoteToConvert] = useState<QuoteResponse | null>(
		null,
	)
	const [emailDialogOpen, setEmailDialogOpen] = useState(false)
	const [quoteToEmail, setQuoteToEmail] = useState<QuoteResponse | null>(null)
	const [downloadingQuoteId, setDownloadingQuoteId] = useState<string | null>(
		null,
	)

	// Query avec pagination serveur
	const { data: quotesData, isLoading } = useQuotes({
		companyId: activeCompanyId ?? undefined,
		status: statusFilter !== 'all' ? statusFilter : undefined,
		filter: searchFilter,
		page,
		perPage: PER_PAGE,
	})

	const quotes = (quotesData?.items ?? []) as QuoteResponse[]

	// Mutations
	const deleteQuote = useDeleteQuote()
	const convertQuoteToInvoice = useConvertQuoteToInvoice()

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
			await convertQuoteToInvoice.mutateAsync(quoteToConvert.id)
			toast.success(`Facture créée à partir du devis ${quoteToConvert.number}`)
			setConvertDialogOpen(false)
			setQuoteToConvert(null)
		} catch (error: any) {
			toast.error(error?.message || 'Erreur lors de la création de la facture')
		}
	}

	const handleOpenEmail = (quote: QuoteResponse) => {
		setQuoteToEmail(quote)
		setEmailDialogOpen(true)
	}

	const handleEmailSent = () => {
		toast.success('Email envoyé avec succès')
		setEmailDialogOpen(false)
		setQuoteToEmail(null)
	}

	const handleDownloadPdf = async (quote: QuoteResponse) => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}

		setDownloadingQuoteId(quote.id)
		try {
			const fullQuote = await pb.collection('quotes').getOne(quote.id, {
				expand: 'customer,issued_by',
			})

			let company: any
			try {
				company = await pb.collection('companies').getOne(activeCompanyId)
			} catch (err) {
				console.warn('Entreprise non trouvée:', err)
			}

			let customer = fullQuote.expand?.customer
			if (!customer && fullQuote.customer) {
				try {
					customer = await pb.collection('customers').getOne(fullQuote.customer)
				} catch (err) {
					console.warn('Client non trouvé:', err)
				}
			}

			let companyLogoUrl: string | null = null
			if (company?.logo) {
				companyLogoUrl = pb.files.getUrl(company, company.logo)
			}

			const blob = await pdf(
				<QuotePdfDocument
					quote={fullQuote as any}
					customer={customer}
					company={company}
					companyLogoUrl={companyLogoUrl}
				/>,
			).toBlob()

			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `Devis_${quote.number.replace(/\//g, '-')}.pdf`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)
			toast.success('PDF téléchargé')
		} catch (error) {
			toast.error('Erreur lors de la génération du PDF')
			console.error(error)
		} finally {
			setDownloadingQuoteId(null)
		}
	}

	return (
		<div className='container mx-auto py-6 space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-3xl font-bold tracking-tight'>Devis</h1>
					<p className='text-muted-foreground'>
						Gérez vos devis et convertissez-les en factures
					</p>
				</div>
				<Button onClick={() => navigate({ to: '/connect/quotes/new' })}>
					<Plus className='h-4 w-4 mr-2' />
					Nouveau devis
				</Button>
			</div>

			{/* Filtres — pas de early return sur isLoading, focus préservé */}
			<div className='flex gap-4'>
				<Input
					placeholder='Rechercher par numéro ou nom du client...'
					value={searchTerm}
					onChange={(e) => {
						setSearchTerm(e.target.value)
						setPage(1) // <-- Le retour instantané à la page 1 !
					}}
					className='max-w-sm'
				/>
				<Select
					value={statusFilter}
					onValueChange={(v) => {
						setStatusFilter(v as QuoteStatus | 'all')
						setPage(1)
					}}
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

			{/* Table — spinner géré dans QuotesTable, pas de early return */}
			<QuotesTable
				quotes={quotes}
				isLoading={isLoading}
				downloadingQuoteId={downloadingQuoteId}
				page={page}
				totalPages={quotesData?.totalPages ?? 1}
				totalItems={quotesData?.totalItems ?? 0}
				perPage={PER_PAGE}
				onPageChange={setPage}
				onDownloadPdf={handleDownloadPdf}
				onOpenEmail={handleOpenEmail}
				onOpenConvert={handleOpenConvert}
				onOpenDelete={handleOpenDelete}
				convertIsPending={convertQuoteToInvoice.isPending}
			/>

			{/* AlertDialog suppression */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Supprimer ce devis ?</AlertDialogTitle>
						<AlertDialogDescription>
							Cette action est irréversible. Le devis{' '}
							<strong>{quoteToDelete?.number}</strong> sera définitivement
							supprimé. Aucune écriture légale n&apos;est liée à un devis, donc
							cette opération ne crée pas de trou dans la numérotation de
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

			{/* Dialog envoi email */}
			<SendQuoteEmailDialog
				open={emailDialogOpen}
				onOpenChange={setEmailDialogOpen}
				quote={quoteToEmail}
				onSuccess={handleEmailSent}
			/>
		</div>
	)
}
