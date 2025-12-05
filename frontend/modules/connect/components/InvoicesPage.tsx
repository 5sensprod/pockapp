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
import type { CompaniesResponse } from '@/lib/pocketbase-types'
import { useInvoices } from '@/lib/queries/invoices'
import type { InvoiceResponse, InvoiceStatus } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { pdf } from '@react-pdf/renderer'
import { useNavigate } from '@tanstack/react-router'
import {
	CheckCircle,
	Download,
	Eye,
	FileText,
	MoreHorizontal,
	Plus,
	Send,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { InvoicePdfDocument } from './InvoicePdf'

// ============================================================================
// HELPERS
// ============================================================================

const statusConfig: Record<
	InvoiceStatus,
	{
		label: string
		variant: 'default' | 'secondary' | 'destructive' | 'outline'
	}
> = {
	draft: { label: 'Brouillon', variant: 'secondary' },
	validated: { label: 'Validée', variant: 'outline' },
	sent: { label: 'Envoyée', variant: 'outline' },
	paid: { label: 'Payée', variant: 'default' },
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

// ⚙️ Conversion image -> dataURL PNG pour react-pdf (supporte pas webp)
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

export function InvoicesPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
	const [infoDialogOpen, setInfoDialogOpen] = useState(false)

	const [company, setCompany] = useState<CompaniesResponse | null>(null)

	const {
		data: invoicesData,
		isLoading,
		refetch: refetchInvoices,
	} = useInvoices({
		companyId: activeCompanyId ?? undefined,
		status: statusFilter !== 'all' ? statusFilter : undefined,
		filter: searchTerm ? `number ~ "${searchTerm}"` : undefined,
	})

	const invoices = (invoicesData?.items ?? []) as InvoiceResponse[]

	// Charger la société active pour afficher ses infos (et logo) dans le PDF
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

	// Stats
	const stats = invoices.reduce(
		(acc, inv) => {
			acc.total++
			acc.totalTTC += inv.total_ttc
			if (inv.status === 'paid') acc.paid += inv.total_ttc
			if (inv.status === 'validated' || inv.status === 'sent') {
				acc.pending += inv.total_ttc
			}
			return acc
		},
		{ total: 0, totalTTC: 0, paid: 0, pending: 0 },
	)

	const handleMarkAsPaid = async (invoice: InvoiceResponse) => {
		try {
			await pb.collection('invoices').update(invoice.id, {
				status: 'paid',
				paid_at: new Date().toISOString(),
			})
			toast.success(`Facture ${invoice.number} marquée comme payée`)
			await refetchInvoices()
		} catch (error) {
			console.error(error)
			toast.error('Erreur lors de la mise à jour')
		}
	}

	const handleDownloadPdf = async (invoice: InvoiceResponse) => {
		try {
			const customer = invoice.expand?.customer

			let logoDataUrl: string | null = null

			// Si la société a un logo, on le convertit en PNG dataURL pour react-pdf
			if (company && (company as any).logo) {
				const fileUrl = pb.files.getUrl(company, (company as any).logo)

				try {
					// react-pdf ne supporte pas webp, donc conversion en PNG
					logoDataUrl = await toPngDataUrl(fileUrl)
				} catch (err) {
					console.warn(
						'Erreur lors de la conversion du logo en PNG pour le PDF',
						err,
					)
					logoDataUrl = null
				}
			}

			const doc = (
				<InvoicePdfDocument
					invoice={invoice}
					customer={customer as any}
					company={company || undefined}
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
		} catch (error) {
			console.error('Erreur génération PDF', error)
			toast.error('Erreur lors de la génération du PDF')
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
				<Select
					value={statusFilter}
					onValueChange={(value) =>
						setStatusFilter(value as InvoiceStatus | 'all')
					}
				>
					<SelectTrigger className='w-[220px]'>
						<SelectValue placeholder='Statut' />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='all'>Tous les statuts</SelectItem>
						<SelectItem value='draft'>Brouillon</SelectItem>
						<SelectItem value='validated'>Validée</SelectItem>
						<SelectItem value='sent'>Envoyée</SelectItem>
						<SelectItem value='paid'>Payée</SelectItem>
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
									statusConfig[invoice.status as InvoiceStatus] ||
									statusConfig.draft
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
													<DropdownMenuItem
														onClick={() => handleDownloadPdf(invoice)}
													>
														<Download className='h-4 w-4 mr-2' />
														Télécharger PDF
													</DropdownMenuItem>
													{invoice.status === 'draft' && (
														<DropdownMenuItem
															onClick={() => setInfoDialogOpen(true)}
														>
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
														onClick={() => setInfoDialogOpen(true)}
													>
														Limiter les modifications
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

			{/* Dialog d'info (ex-clôture/suppression) */}
			<Dialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Action restreinte</DialogTitle>
						<DialogDescription>
							Les suppressions directes ou certaines modifications sont
							désactivées pour respecter la législation. Utilisez les avoirs et
							les clôtures pour corriger ou annuler des factures.
						</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</div>
	)
}
