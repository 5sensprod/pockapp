// PATCH: frontend/modules/connect/components/InvoiceDetailPage.tsx
// Ajoute l'affichage du "Vendeur" dans le bloc "Informations principales"

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { CompaniesResponse } from '@/lib/pocketbase-types'
import { useInvoice } from '@/lib/queries/invoices'
import {
	type InvoiceResponse,
	getDisplayStatus,
	isOverdue,
} from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { pdf } from '@react-pdf/renderer'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle,
	Download,
	FileText,
	Loader2,
	Mail,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { InvoicePdfDocument } from './InvoicePdf'
import { SendInvoiceEmailDialog } from './SendInvoiceEmailDialog'

// ============================================================================
// HELPERS
// ============================================================================

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

async function toPngDataUrl(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas')
				canvas.width = img.naturalWidth || img.width
				canvas.height = img.naturalHeight || img.height
				const ctx = canvas.getContext('2d')
				if (!ctx) {
					reject(new Error('Impossible de créer un contexte 2D'))
					return
				}
				ctx.drawImage(img, 0, 0)
				const dataUrl = canvas.toDataURL('image/png')
				resolve(dataUrl)
			} catch (err) {
				reject(err)
			}
		}
		img.onerror = (err) => reject(err)
		img.src = url
	})
}

// ============================================================================
// COMPONENT
// ============================================================================

export function InvoiceDetailPage() {
	const navigate = useNavigate()
	const { invoiceId } = useParams({ from: '/connect/invoices/$invoiceId/' })
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	const { data: invoice, isLoading } = useInvoice(invoiceId)
	const [company, setCompany] = useState<CompaniesResponse | null>(null)

	const [isDownloading, setIsDownloading] = useState(false)
	const [emailDialogOpen, setEmailDialogOpen] = useState(false)

	useEffect(() => {
		const loadCompany = async () => {
			if (!activeCompanyId) return
			try {
				const result = await pb.collection('companies').getOne(activeCompanyId)
				setCompany(result as CompaniesResponse)
			} catch (err) {
				console.error('Erreur chargement company', err)
			}
		}
		void loadCompany()
	}, [activeCompanyId, pb])

	const handleDownloadPdf = async () => {
		if (!invoice) {
			toast.error('Facture introuvable')
			return
		}
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}

		setIsDownloading(true)

		try {
			const customer = invoice.expand?.customer

			let logoDataUrl: string | null = null
			let currentCompany: CompaniesResponse | null = company

			if (!currentCompany) {
				try {
					const result = await pb
						.collection('companies')
						.getOne(activeCompanyId)
					currentCompany = result as CompaniesResponse
					setCompany(currentCompany)
				} catch (err) {
					console.warn('Entreprise non trouvée:', err)
				}
			}

			if (currentCompany && (currentCompany as any).logo) {
				const fileUrl = pb.files.getUrl(
					currentCompany,
					(currentCompany as any).logo,
				)
				try {
					logoDataUrl = await toPngDataUrl(fileUrl)
				} catch (err) {
					console.warn('Erreur conversion logo', err)
				}
			}

			const doc = (
				<InvoicePdfDocument
					invoice={invoice as InvoiceResponse}
					customer={customer as any}
					company={currentCompany || undefined}
					companyLogoUrl={logoDataUrl}
				/>
			)

			const blob = await pdf(doc).toBlob()
			const url = URL.createObjectURL(blob)

			const link = document.createElement('a')
			link.href = url
			link.download = `${invoice.number}.pdf`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)

			toast.success('Facture téléchargée')
		} catch (error) {
			console.error('Erreur génération PDF:', error)
			toast.error('Erreur lors de la génération du PDF')
		} finally {
			setIsDownloading(false)
		}
	}

	if (isLoading) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<div className='text-muted-foreground'>Chargement...</div>
			</div>
		)
	}

	if (!invoice) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<div className='text-muted-foreground'>Facture introuvable</div>
				<Button
					variant='outline'
					className='mt-4'
					onClick={() => navigate({ to: '/connect/invoices' })}
				>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour aux factures
				</Button>
			</div>
		)
	}

	const customer = invoice.expand?.customer
	const displayStatus = getDisplayStatus(invoice)
	const overdue = isOverdue(invoice)

	// ✅ Vendeur / Caissier
	const soldBy = (invoice as any).expand?.sold_by
	const sellerName =
		soldBy?.name ||
		soldBy?.username ||
		soldBy?.email ||
		((invoice as any).sold_by ? String((invoice as any).sold_by) : '—')

	return (
		<div className='container mx-auto px-6 py-8'>
			<div className='flex items-center justify-between mb-6'>
				<div className='flex items-center gap-4'>
					<Button
						variant='ghost'
						size='icon'
						onClick={() => navigate({ to: '/connect/invoices' })}
					>
						<ArrowLeft className='h-4 w-4' />
					</Button>
					<div>
						<h1 className='text-2xl font-bold flex items-center gap-2'>
							<FileText className='h-6 w-6' />
							{invoice.is_pos_ticket
								? 'Ticket'
								: invoice.invoice_type === 'credit_note'
									? 'Avoir'
									: 'Facture'}{' '}
							{invoice.number}
						</h1>
						<p className='text-muted-foreground'>
							Émise le {formatDate(invoice.date)}
						</p>
					</div>
				</div>

				<div className='flex items-center gap-2'>
					<div className='flex items-center gap-2'>
						<Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>
						{displayStatus.isPaid && (
							<CheckCircle className='h-4 w-4 text-green-600' />
						)}
						{overdue && !invoice.is_paid && (
							<AlertTriangle className='h-4 w-4 text-red-500' />
						)}
					</div>

					<Button
						variant='outline'
						size='sm'
						onClick={handleDownloadPdf}
						disabled={isDownloading}
					>
						{isDownloading ? (
							<Loader2 className='h-4 w-4 animate-spin mr-2' />
						) : (
							<Download className='h-4 w-4 mr-2' />
						)}
						PDF
					</Button>

					<Button
						variant='outline'
						size='sm'
						onClick={() => setEmailDialogOpen(true)}
						disabled={invoice.status === 'draft'}
					>
						<Mail className='h-4 w-4 mr-2' />
						Envoyer
					</Button>
				</div>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
				<Card className='lg:col-span-2'>
					<CardHeader>
						<CardTitle>
							{invoice.is_pos_ticket
								? 'Détails du ticket'
								: 'Détails de la facture'}
						</CardTitle>
						<CardDescription>
							{invoice.is_pos_ticket
								? 'Ticket de caisse'
								: invoice.invoice_type === 'credit_note'
									? 'Avoir'
									: 'Facture classique'}{' '}
							— statut&nbsp;: {displayStatus.label}
						</CardDescription>
					</CardHeader>

					<CardContent className='space-y-4'>
						<div className='grid grid-cols-2 gap-4'>
							<div>
								<p className='text-sm text-muted-foreground'>Date</p>
								<p className='font-medium'>{formatDate(invoice.date)}</p>
							</div>

							{invoice.is_pos_ticket ? (
								<div>
									<p className='text-sm text-muted-foreground'>
										Heure de vente
									</p>
									<p className='font-medium'>
										{new Date(invoice.created).toLocaleTimeString('fr-FR', {
											hour: '2-digit',
											minute: '2-digit',
										})}
									</p>
								</div>
							) : (
								<div>
									<p className='text-sm text-muted-foreground'>Échéance</p>
									<p
										className={`font-medium ${overdue && !invoice.is_paid ? 'text-red-600' : ''}`}
									>
										{invoice.due_date ? formatDate(invoice.due_date) : '-'}
									</p>
								</div>
							)}

							<div>
								<p className='text-sm text-muted-foreground'>Type</p>
								<p className='font-medium'>
									{invoice.is_pos_ticket
										? 'Ticket'
										: invoice.invoice_type === 'credit_note'
											? 'Avoir'
											: 'Facture'}
								</p>
							</div>

							{/* ✅ Nouveau: vendeur */}
							<div>
								<p className='text-sm text-muted-foreground'>Vendeur</p>
								<p className='font-medium'>{sellerName}</p>
							</div>

							<div>
								<p className='text-sm text-muted-foreground'>
									Paiement / statut
								</p>
								<p className='font-medium'>
									{invoice.is_paid
										? 'Payée'
										: invoice.status === 'draft'
											? 'Brouillon'
											: 'En attente de paiement'}
								</p>
								{invoice.is_paid && (
									<p className='text-xs text-muted-foreground mt-1'>
										Payée le{' '}
										{invoice.paid_at
											? formatDate(invoice.paid_at)
											: '(date non renseignée)'}{' '}
										par {invoice.payment_method || 'méthode inconnue'}.
									</p>
								)}
							</div>
						</div>

						{invoice.is_pos_ticket &&
							invoice.converted_to_invoice &&
							invoice.converted_invoice_id && (
								<div className='border-t pt-4'>
									<p className='text-sm text-muted-foreground mb-2'>
										Facture associée
									</p>
									<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3'>
										<div className='flex items-center gap-2'>
											<FileText className='h-4 w-4 text-muted-foreground' />
											<span className='font-medium'>Converti en facture</span>
										</div>
										<Button
											variant='outline'
											size='sm'
											onClick={() => {
												const facId = invoice.converted_invoice_id
												if (facId) {
													navigate({
														to: '/connect/invoices/$invoiceId',
														params: { invoiceId: facId },
													})
												}
											}}
										>
											Voir la facture
										</Button>
									</div>
								</div>
							)}

						{invoice.notes && (
							<div>
								<p className='text-sm text-muted-foreground'>Notes</p>
								<p className='text-sm'>{invoice.notes}</p>
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Client</CardTitle>
					</CardHeader>
					<CardContent>
						{customer ? (
							<div className='space-y-2'>
								<p className='font-medium'>{customer.name}</p>
								{customer.company && (
									<p className='text-sm text-muted-foreground'>
										{customer.company}
									</p>
								)}
								{customer.email && (
									<p className='text-sm text-muted-foreground'>
										{customer.email}
									</p>
								)}
								{customer.phone && (
									<p className='text-sm text-muted-foreground'>
										{customer.phone}
									</p>
								)}
								{customer.address && (
									<p className='text-sm text-muted-foreground'>
										{customer.address}
									</p>
								)}
							</div>
						) : (
							<p className='text-muted-foreground'>Client inconnu</p>
						)}
					</CardContent>
				</Card>

				<Card className='lg:col-span-3'>
					<CardHeader>
						<CardTitle>Articles</CardTitle>
						<CardDescription>
							{invoice.items.length} ligne(s) dans cette facture
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Article</TableHead>
									<TableHead className='text-center w-20'>Qté</TableHead>
									<TableHead className='text-right'>P.U. HT</TableHead>
									<TableHead className='text-right'>TVA</TableHead>
									<TableHead className='text-right'>Total TTC</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{invoice.items.map((item, idx) => (
									<TableRow key={`${item.name}-${idx}`}>
										<TableCell className='font-medium'>{item.name}</TableCell>
										<TableCell className='text-center'>
											{item.quantity}
										</TableCell>
										<TableCell className='text-right'>
											{item.unit_price_ht.toFixed(2)} €
										</TableCell>
										<TableCell className='text-right'>
											{item.tva_rate}%
										</TableCell>
										<TableCell className='text-right'>
											{item.total_ttc.toFixed(2)} €
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>

						<div className='mt-6 flex justify-end'>
							<div className='w-64 space-y-2 text-sm'>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>Total HT</span>
									<span>
										{formatCurrency(invoice.total_ht, invoice.currency)}
									</span>
								</div>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>TVA</span>
									<span>
										{formatCurrency(invoice.total_tva, invoice.currency)}
									</span>
								</div>
								<div className='flex justify-between font-bold text-lg border-t pt-2'>
									<span>Total TTC</span>
									<span>
										{formatCurrency(invoice.total_ttc, invoice.currency)}
									</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<SendInvoiceEmailDialog
				open={emailDialogOpen}
				onOpenChange={setEmailDialogOpen}
				invoice={invoice}
				onSuccess={() => setEmailDialogOpen(false)}
			/>
		</div>
	)
}
