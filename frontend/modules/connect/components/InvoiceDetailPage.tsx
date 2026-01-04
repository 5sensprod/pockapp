// frontend/modules/connect/components/InvoiceDetailPage.tsx
// ✅ AJOUT: affichage du vendeur/caissier dans "Détails généraux"

import { Badge, type BadgeProps } from '@/components/ui/badge'
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
import { useCreditNotesForInvoice, useInvoice } from '@/lib/queries/invoices'
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
	Pencil,
	RefreshCcw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type VatBreakdown = {
	rate: number
	base_ht: number
	vat: number
	total_ttc: number
}

// Helper pour afficher le libellé du moyen de remboursement
function getRefundMethodLabel(method?: string): string {
	switch (method) {
		case 'especes':
			return 'Espèces'
		case 'cb':
			return 'Carte bancaire'
		case 'cheque':
			return 'Chèque'
		case 'virement':
			return 'Virement'
		case 'autre':
			return 'Autre'
		default:
			return method || '-'
	}
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

function getLineDiscountLabel(item: any): {
	label: string
	hasDiscount: boolean
} {
	const mode = item?.line_discount_mode
	const value = item?.line_discount_value
	if (!mode || value == null) return { label: '-', hasDiscount: false }

	if (mode === 'percent') {
		const p = Math.max(0, Math.min(100, Number(value) || 0))
		if (p <= 0) return { label: '-', hasDiscount: false }
		return { label: `-${p}%`, hasDiscount: true }
	}

	// mode === 'amount'
	const beforeUnitTtc = Number(item?.unit_price_ttc_before_discount)
	if (Number.isFinite(beforeUnitTtc) && beforeUnitTtc > 0) {
		const unitTtcAfter = Number(value)
		if (Number.isFinite(unitTtcAfter)) {
			const diff = round2(Math.max(0, beforeUnitTtc - unitTtcAfter))
			if (diff <= 0) return { label: '-', hasDiscount: false }
			return { label: `-${diff.toFixed(2)} €/u`, hasDiscount: true }
		}
	}

	// fallback: afficher la valeur brute (peut représenter un montant)
	const v = round2(Math.max(0, Number(value) || 0))
	if (v <= 0) return { label: '-', hasDiscount: false }
	return { label: `-${v.toFixed(2)} €`, hasDiscount: true }
}

function getSoldByLabel(invoice: any): string {
	const soldBy = invoice?.expand?.sold_by
	return (
		soldBy?.name ||
		soldBy?.username ||
		soldBy?.email ||
		(invoice?.sold_by ? String(invoice.sold_by) : '-')
	)
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

	// Déterminer si c'est un avoir
	const isCreditNote = invoice?.invoice_type === 'credit_note'

	// ✅ AJOUT: Récupérer les avoirs liés (uniquement si ce n'est PAS un avoir)
	const { data: linkedCreditNotes } = useCreditNotesForInvoice(
		!isCreditNote ? invoiceId : undefined,
	)

	// ✅ AJOUT: Récupérer le numéro du document original (pour les avoirs)
	const originalDocument = (invoice as any)?.expand?.original_invoice_id
	const originalNumber = originalDocument?.number
	const originalId = (invoice as any)?.original_invoice_id

	// ============================================================================
	// LOAD COMPANY
	// ============================================================================

	useEffect(() => {
		const loadCompany = async () => {
			if (!activeCompanyId) return
			try {
				const c = await pb.collection('companies').getOne(activeCompanyId)
				setCompany(c)
			} catch (err) {
				console.error(err)
			}
		}
		void loadCompany()
	}, [activeCompanyId, pb])

	// ============================================================================
	// COMPUTATIONS
	// ============================================================================
	const vatBreakdown = useMemo<VatBreakdown[]>(() => {
		const inv = invoice as any
		const items = Array.isArray(inv?.items) ? inv.items : []
		const map = new Map<number, VatBreakdown>()

		for (const it of items) {
			const rate = Number(it?.tva_rate ?? 20)
			const ht = Number(it?.total_ht ?? 0)
			const ttc = Number(it?.total_ttc ?? 0)
			const vat = ttc - ht

			let entry = map.get(rate)
			if (!entry) {
				entry = { rate, base_ht: 0, vat: 0, total_ttc: 0 }
				map.set(rate, entry)
			}

			entry.base_ht = round2(entry.base_ht + ht)
			entry.vat = round2(entry.vat + vat)
			entry.total_ttc = round2(entry.total_ttc + ttc)
		}

		return Array.from(map.values()).sort((a, b) => a.rate - b.rate)
	}, [invoice])

	const customer = (invoice as any)?.expand?.customer ?? null
	const displayStatus = invoice
		? getDisplayStatus(invoice)
		: { label: '', variant: 'outline', isPaid: false }
	const badgeVariant = (displayStatus.variant ??
		'outline') as BadgeProps['variant']
	const overdue = invoice ? isOverdue(invoice) : false

	const discounts = useMemo(() => {
		const inv: any = invoice as any

		const totalTtc = Number(inv?.total_ttc ?? 0)
		const lineDiscountsTtc = Number(inv?.line_discounts_total_ttc ?? 0)
		const cartDiscountTtc = Number(inv?.cart_discount_ttc ?? 0)

		const subtotalAfterLine = round2(totalTtc + cartDiscountTtc)
		const grandSubtotal = round2(subtotalAfterLine + lineDiscountsTtc)

		const hasAnyDiscount = lineDiscountsTtc > 0 || cartDiscountTtc > 0

		let cartDiscountLabel = ''
		const mode = inv?.cart_discount_mode
		const value = inv?.cart_discount_value
		if (cartDiscountTtc > 0 && mode && value != null) {
			if (mode === 'percent') cartDiscountLabel = `(${Number(value) || 0}%)`
			else cartDiscountLabel = `(${round2(Number(value) || 0).toFixed(2)} €)`
		}

		return {
			hasAnyDiscount,
			totalTtc: round2(totalTtc),
			grandSubtotal,
			lineDiscountsTtc: round2(lineDiscountsTtc),
			cartDiscountTtc: round2(cartDiscountTtc),
			cartDiscountLabel,
		}
	}, [invoice])

	// ============================================================================
	// GUARDS
	// ============================================================================

	if (isLoading) {
		return (
			<div className='container mx-auto px-6 py-8 flex items-center justify-center'>
				<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
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

	// ============================================================================
	// ACTIONS
	// ============================================================================

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

	// ============================================================================
	// Fonction pour rendre le badge de statut approprié
	// ============================================================================
	const renderStatusBadges = () => {
		// Pour les avoirs (credit_notes)
		if (isCreditNote) {
			return (
				<>
					<Badge variant={badgeVariant}>{displayStatus.label}</Badge>
					<Badge className='bg-blue-600 hover:bg-blue-600'>
						<RefreshCcw className='h-3 w-3 mr-1' />
						Remboursé
					</Badge>
				</>
			)
		}

		// Pour les factures/tickets normaux
		return (
			<>
				<Badge variant={badgeVariant}>{displayStatus.label}</Badge>
				{invoice.is_paid ? (
					<Badge className='bg-emerald-600 hover:bg-emerald-600'>
						<CheckCircle className='h-3 w-3 mr-1' />
						Payée
					</Badge>
				) : displayStatus.isPaid ? (
					<Badge className='bg-emerald-600 hover:bg-emerald-600'>
						<CheckCircle className='h-3 w-3 mr-1' />
						Payée
					</Badge>
				) : overdue ? (
					<Badge className='bg-amber-600 hover:bg-amber-600'>
						<AlertTriangle className='h-3 w-3 mr-1' />
						En retard
					</Badge>
				) : (
					<Badge variant='secondary'>Non payée</Badge>
				)}
			</>
		)
	}

	// ============================================================================
	// UI
	// ============================================================================

	const soldByLabel = getSoldByLabel(invoice as any)

	return (
		<div className='container mx-auto px-6 py-8'>
			<div className='flex items-center justify-between gap-3 mb-6'>
				<Button
					variant='ghost'
					onClick={() => navigate({ to: '/connect/invoices' })}
				>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour
				</Button>

				<div className='flex items-center gap-2'>
					<Button
						variant='outline'
						onClick={() =>
							navigate({
								to: '/connect/invoices/$invoiceId/edit',
								params: { invoiceId },
							})
						}
						disabled={invoice.status !== 'draft'}
						title={
							invoice.status !== 'draft'
								? 'Seules les factures en brouillon peuvent être modifiées'
								: 'Modifier'
						}
					>
						<Pencil className='h-4 w-4 mr-2' />
						Modifier
					</Button>

					<Button variant='outline' onClick={() => setEmailDialogOpen(true)}>
						<Mail className='h-4 w-4 mr-2' />
						Envoyer
					</Button>

					<Button onClick={handleDownloadPdf} disabled={isDownloading}>
						{isDownloading ? (
							<Loader2 className='h-4 w-4 animate-spin mr-2' />
						) : (
							<Download className='h-4 w-4 mr-2' />
						)}
						Télécharger
					</Button>
				</div>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-4 gap-6'>
				<Card className='lg:col-span-1'>
					<CardHeader>
						<CardTitle>
							{isCreditNote
								? 'Avoir'
								: invoice.is_pos_ticket
									? 'Ticket'
									: 'Facture'}
						</CardTitle>
						<CardDescription>Détails généraux</CardDescription>
					</CardHeader>

					<CardContent className='space-y-4'>
						<div>
							<p className='text-sm text-muted-foreground'>Numéro</p>
							<p className='font-medium'>{invoice.number || '-'}</p>
						</div>

						<div>
							<p className='text-sm text-muted-foreground'>Date</p>
							<p className='text-sm'>{formatDate(invoice.date)}</p>
						</div>

						<div>
							<p className='text-sm text-muted-foreground'>Échéance</p>
							<p className='text-sm'>{formatDate(invoice.due_date)}</p>
						</div>

						{/* ✅ AJOUT: vendeur/caissier */}
						{!isCreditNote && (
							<div>
								<p className='text-sm text-muted-foreground'>
									{invoice.is_pos_ticket ? 'Vendeur / Caissier' : 'Vendeur'}
								</p>
								<p className='text-sm font-medium'>{soldByLabel}</p>
							</div>
						)}

						<div className='flex items-center gap-2'>
							{renderStatusBadges()}
						</div>

						{/* ════════════════════════════════════════════════════════════════
						    SECTION AVOIR: Infos de remboursement + document original
						    ════════════════════════════════════════════════════════════════ */}
						{isCreditNote && (
							<>
								{/* Moyen de remboursement */}
								{(invoice as any).refund_method && (
									<div>
										<p className='text-sm text-muted-foreground'>
											Moyen de remboursement
										</p>
										<p className='text-sm font-medium'>
											{getRefundMethodLabel((invoice as any).refund_method)}
										</p>
									</div>
								)}

								{/* Motif du remboursement */}
								{(invoice as any).cancellation_reason && (
									<div>
										<p className='text-sm text-muted-foreground'>
											Motif du remboursement
										</p>
										<p className='text-sm'>
											{(invoice as any).cancellation_reason}
										</p>
									</div>
								)}

								{/* ✅ Document original avec numéro affiché */}
								{originalId && (
									<div className='border-t pt-4'>
										<p className='text-sm text-muted-foreground mb-2'>
											Document original
										</p>
										<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3'>
											<div className='flex items-center gap-2'>
												<FileText className='h-4 w-4 text-muted-foreground' />
												<span className='font-medium text-sm'>
													{originalNumber || 'Document'}
												</span>
											</div>
											<Button
												variant='outline'
												size='sm'
												onClick={() => {
													navigate({
														to: '/connect/invoices/$invoiceId',
														params: { invoiceId: originalId },
													})
												}}
											>
												Voir
											</Button>
										</div>
									</div>
								)}
							</>
						)}

						{/* ════════════════════════════════════════════════════════════════
						    SECTION TICKET/FACTURE: Avoirs liés
						    ════════════════════════════════════════════════════════════════ */}
						{!isCreditNote &&
							linkedCreditNotes &&
							linkedCreditNotes.length > 0 && (
								<div className='border-t pt-4'>
									<p className='text-sm text-muted-foreground mb-2'>
										{linkedCreditNotes.length === 1
											? 'Avoir associé'
											: 'Avoirs associés'}
									</p>
									<div className='space-y-2'>
										{linkedCreditNotes.map((cn) => (
											<div
												key={cn.id}
												className='flex items-center justify-between bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-200 dark:border-red-900'
											>
												<div className='flex items-center gap-2'>
													<RefreshCcw className='h-4 w-4 text-red-600' />
													<div className='flex flex-col'>
														<span className='font-medium text-sm text-red-700 dark:text-red-400'>
															{cn.number}
														</span>
														<span className='text-xs text-muted-foreground'>
															{formatDate(cn.date)} •{' '}
															{formatCurrency(cn.total_ttc)}
														</span>
													</div>
												</div>
												<Button
													variant='outline'
													size='sm'
													onClick={() => {
														navigate({
															to: '/connect/invoices/$invoiceId',
															params: { invoiceId: cn.id },
														})
													}}
												>
													Voir
												</Button>
											</div>
										))}
									</div>
								</div>
							)}

						{/* Facture issue d'un ticket */}
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
							{invoice.items.length} ligne(s) dans{' '}
							{isCreditNote
								? 'cet avoir'
								: invoice.is_pos_ticket
									? 'ce ticket'
									: 'cette facture'}
						</CardDescription>
					</CardHeader>

					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Article</TableHead>
									<TableHead className='text-center w-20'>Qté</TableHead>
									<TableHead className='text-right'>P.U. HT</TableHead>
									<TableHead className='text-right'>Remise</TableHead>
									<TableHead className='text-right'>TVA</TableHead>
									<TableHead className='text-right'>Total TTC</TableHead>
								</TableRow>
							</TableHeader>

							<TableBody>
								{invoice.items.map((item: any, idx: number) => {
									const promo = getLineDiscountLabel(item)
									const beforeUnitTtc = Number(
										item?.unit_price_ttc_before_discount,
									)
									const hasBefore =
										Number.isFinite(beforeUnitTtc) && beforeUnitTtc > 0
									const coef = 1 + Number(item?.tva_rate ?? 20) / 100
									const unitTtcFromHt = round2(
										Number(item?.unit_price_ht ?? 0) * coef,
									)

									return (
										<TableRow key={`${item.name}-${idx}`}>
											<TableCell className='font-medium'>
												<div className='flex flex-col'>
													<span>{item.name}</span>
													{hasBefore && promo.hasDiscount && (
														<span className='text-xs text-muted-foreground'>
															<span className='line-through mr-2'>
																{round2(beforeUnitTtc).toFixed(2)} €
															</span>
															<span>{unitTtcFromHt.toFixed(2)} € TTC</span>
														</span>
													)}
												</div>
											</TableCell>

											<TableCell className='text-center'>
												{item.quantity}
											</TableCell>

											<TableCell className='text-right'>
												{Number(item.unit_price_ht ?? 0).toFixed(2)} €
											</TableCell>

											<TableCell className='text-right'>
												{promo.label}
											</TableCell>

											<TableCell className='text-right'>
												{item.tva_rate}%
											</TableCell>

											<TableCell className='text-right'>
												{Number(item.total_ttc ?? 0).toFixed(2)} €
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>

						<div className='mt-6 flex justify-end'>
							<div className='w-72 space-y-2 text-sm'>
								{discounts.hasAnyDiscount && (
									<>
										<div className='flex justify-between'>
											<span className='text-muted-foreground'>
												Sous-total TTC
											</span>
											<span>
												{formatCurrency(
													discounts.grandSubtotal,
													invoice.currency,
												)}
											</span>
										</div>

										{discounts.lineDiscountsTtc > 0 && (
											<div className='flex justify-between'>
												<span className='text-muted-foreground'>
													Remises lignes
												</span>
												<span>
													-
													{formatCurrency(
														discounts.lineDiscountsTtc,
														invoice.currency,
													)}
												</span>
											</div>
										)}

										{discounts.cartDiscountTtc > 0 && (
											<div className='flex justify-between'>
												<span className='text-muted-foreground'>
													Remise globale {discounts.cartDiscountLabel}
												</span>
												<span>
													-
													{formatCurrency(
														discounts.cartDiscountTtc,
														invoice.currency,
													)}
												</span>
											</div>
										)}

										<div className='border-t pt-2' />
									</>
								)}

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

								{vatBreakdown.length > 0 && (
									<div className='pt-1'>
										{vatBreakdown.map((vb) => (
											<div
												key={vb.rate}
												className='flex justify-between text-xs text-muted-foreground'
											>
												<span>
													TVA {vb.rate}% sur {vb.base_ht.toFixed(2)} € HT
												</span>
												<span>{vb.vat.toFixed(2)} €</span>
											</div>
										))}
									</div>
								)}

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
