// frontend/modules/connect/pages/quotes/QuoteDetailPage.tsx

import { EmptyState } from '@/components/module-ui'
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
import { useQuote } from '@/lib/queries/quotes'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	ArrowLeft,
	Download,
	Edit,
	FileText,
	Loader2,
	Mail,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConnectModuleShell } from '../../ConnectModuleShell'
import { SendQuoteEmailDialog } from '../../dialogs/SendQuoteEmailDialog'
import { useDocumentNavigation } from '../../hooks/useDocumentNavigation'
import { QuotePdfDocument } from '../../pdf/QuotePdf'
import { downloadQuotePdf } from '../../utils/downloadPdf'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { getQuoteStatus } from '../../utils/statusConfig'

export function QuoteDetailPage() {
	const navigate = useNavigate()
	const { quoteId } = useParams({ from: '/connect/quotes/$quoteId/' })
	const { goBack } = useDocumentNavigation('quote') // ← correct
	const { data: quote, isLoading } = useQuote(quoteId)
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	const [isDownloading, setIsDownloading] = useState(false)
	const [emailDialogOpen, setEmailDialogOpen] = useState(false)

	const handleDownloadPdf = async () => {
		if (!quote || !activeCompanyId) {
			toast.error('Données manquantes')
			return
		}
		setIsDownloading(true)
		const result = await downloadQuotePdf({
			pb,
			quote,
			activeCompanyId,
			PdfDocument: QuotePdfDocument,
		})
		if (!result.ok) toast.error('Erreur lors de la génération du PDF')
		else toast.success('Devis téléchargé')
		setIsDownloading(false)
	}

	// ── Header gauche ─────────────────────────────────────────────────────
	const makeHeaderLeft = (title: string) => (
		<div className='flex items-center gap-3'>
			<Button
				variant='ghost'
				size='icon'
				className='-ml-2 text-muted-foreground hover:text-foreground shrink-0'
				onClick={goBack}
			>
				<ArrowLeft className='h-4 w-4' />
			</Button>
			<div className='flex items-center gap-2'>
				<FileText className='h-5 w-5 text-muted-foreground' />
				<h1 className='text-xl font-bold tracking-tight'>{title}</h1>
			</div>
		</div>
	)

	// ── Guards ────────────────────────────────────────────────────────────
	if (isLoading) {
		return (
			<ConnectModuleShell
				hideTitle
				hideIcon
				hideBadge
				headerLeft={makeHeaderLeft('Devis')}
				primaryAction={null}
			>
				<EmptyState icon={FileText} title='Chargement...' fullPage />
			</ConnectModuleShell>
		)
	}

	if (!quote) {
		return (
			<ConnectModuleShell
				hideTitle
				hideIcon
				hideBadge
				headerLeft={makeHeaderLeft('Devis introuvable')}
				primaryAction={null}
			>
				<EmptyState
					icon={FileText}
					title='Devis introuvable'
					description="Ce devis n'existe pas ou a été supprimé."
					actions={[
						{
							label: 'Retour aux devis',
							onClick: goBack,
							variant: 'secondary',
						},
					]}
					fullPage
				/>
			</ConnectModuleShell>
		)
	}

	// ── Données dérivées ──────────────────────────────────────────────────
	const customer = quote.expand?.customer
	const issuedBy = (quote as any).expand?.issued_by
	const sellerName =
		issuedBy?.name ||
		issuedBy?.username ||
		issuedBy?.email ||
		(quote as any).issued_by ||
		'—'

	const cartDiscountTtc = (quote as any).cart_discount_ttc || 0
	const lineDiscountsTotalTtc = (quote as any).line_discounts_total_ttc || 0
	const hasDiscounts = cartDiscountTtc > 0 || lineDiscountsTotalTtc > 0
	const subTotalBeforeDiscounts =
		quote.total_ttc + cartDiscountTtc + lineDiscountsTotalTtc
	const cartDiscountMode = (quote as any).cart_discount_mode || 'percent'
	const cartDiscountValue = (quote as any).cart_discount_value || 0

	const statusInfo = getQuoteStatus(quote.status)

	return (
		<ConnectModuleShell
			hideTitle
			hideIcon
			hideBadge
			headerLeft={
				<div className='flex items-center gap-3'>
					<Button
						variant='ghost'
						size='icon'
						className='-ml-2 text-muted-foreground hover:text-foreground shrink-0'
						onClick={goBack}
					>
						<ArrowLeft className='h-4 w-4' />
					</Button>
					<div className='flex items-center gap-2'>
						<FileText className='h-5 w-5 text-muted-foreground' />
						<h1 className='text-xl font-bold tracking-tight'>
							Devis {quote.number}
						</h1>
						<Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
					</div>
				</div>
			}
			headerRight={
				<div className='flex items-center gap-2'>
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
					>
						<Mail className='h-4 w-4 mr-2' />
						Envoyer
					</Button>
				</div>
			}
			primaryAction={
				quote.status === 'draft' ? (
					<Button
						size='sm'
						onClick={() =>
							navigate({
								to: '/connect/quotes/$quoteId/edit',
								params: { quoteId: quote.id },
							})
						}
					>
						<Edit className='h-4 w-4 mr-1.5' />
						Modifier
					</Button>
				) : null
			}
		>
			<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
				{/* Détails */}
				<Card className='lg:col-span-2'>
					<CardHeader>
						<CardTitle>Détails du devis</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<div className='grid grid-cols-2 gap-4'>
							<div>
								<p className='text-sm text-muted-foreground'>Date</p>
								<p className='font-medium'>{formatDate(quote.date)}</p>
							</div>
							<div>
								<p className='text-sm text-muted-foreground'>Valide jusqu'au</p>
								<p className='font-medium'>{formatDate(quote.valid_until)}</p>
							</div>
							<div>
								<p className='text-sm text-muted-foreground'>Vendeur</p>
								<p className='font-medium'>{sellerName}</p>
							</div>
						</div>
						{quote.notes && (
							<div>
								<p className='text-sm text-muted-foreground'>Notes</p>
								<p className='text-sm'>{quote.notes}</p>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Client */}
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

				{/* Articles */}
				<Card className='lg:col-span-3'>
					<CardHeader>
						<CardTitle>Articles</CardTitle>
						<CardDescription>
							{quote.items.length} article(s) dans ce devis
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Désignation</TableHead>
									<TableHead className='text-right'>Quantité</TableHead>
									<TableHead className='text-right'>Prix unitaire HT</TableHead>
									<TableHead className='text-right'>Remise</TableHead>
									<TableHead className='text-right'>TVA</TableHead>
									<TableHead className='text-right'>Total HT</TableHead>
									<TableHead className='text-right'>Total TTC</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{quote.items.map((item, index) => {
									const lineDiscountValue =
										(item as any).line_discount_value || 0
									const lineDiscountMode =
										(item as any).line_discount_mode || 'percent'
									const discountText =
										lineDiscountValue > 0
											? `${lineDiscountValue.toFixed(2)}${lineDiscountMode === 'percent' ? '%' : '€'}`
											: '-'
									return (
										// biome-ignore lint/suspicious/noArrayIndexKey: liste statique en lecture seule
										<TableRow key={index}>
											<TableCell className='font-medium'>
												<div>{item.name}</div>
												{(item as any).brand_name && (
													<div className='text-xs text-muted-foreground'>
														{(item as any).brand_name}
													</div>
												)}
											</TableCell>
											<TableCell className='text-right'>
												{item.quantity}
											</TableCell>
											<TableCell className='text-right'>
												{formatCurrency(item.unit_price_ht, quote.currency)}
											</TableCell>
											<TableCell className='text-right text-green-600'>
												{discountText}
											</TableCell>
											<TableCell className='text-right'>
												{item.tva_rate}%
											</TableCell>
											<TableCell className='text-right'>
												{formatCurrency(item.total_ht, quote.currency)}
											</TableCell>
											<TableCell className='text-right'>
												{formatCurrency(item.total_ttc, quote.currency)}
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>

						{/* Totaux */}
						<div className='mt-6 flex justify-end'>
							<div className='w-80 space-y-2'>
								{hasDiscounts && (
									<div className='flex justify-between text-muted-foreground'>
										<span>Sous-total TTC</span>
										<span>
											{formatCurrency(subTotalBeforeDiscounts, quote.currency)}
										</span>
									</div>
								)}
								{lineDiscountsTotalTtc > 0 && (
									<div className='flex justify-between text-green-600 italic'>
										<span>Remises lignes</span>
										<span>
											-{formatCurrency(lineDiscountsTotalTtc, quote.currency)}
										</span>
									</div>
								)}
								{cartDiscountTtc > 0 && (
									<div className='flex justify-between text-green-600 italic'>
										<span>
											Remise globale
											{cartDiscountMode === 'percent' &&
												cartDiscountValue > 0 &&
												` (${cartDiscountValue}%)`}
										</span>
										<span>
											-{formatCurrency(cartDiscountTtc, quote.currency)}
										</span>
									</div>
								)}
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>Total HT</span>
									<span>{formatCurrency(quote.total_ht, quote.currency)}</span>
								</div>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>TVA</span>
									<span>{formatCurrency(quote.total_tva, quote.currency)}</span>
								</div>
								<div className='flex justify-between font-bold text-lg border-t pt-2'>
									<span>Total TTC</span>
									<span>{formatCurrency(quote.total_ttc, quote.currency)}</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<SendQuoteEmailDialog
				open={emailDialogOpen}
				onOpenChange={setEmailDialogOpen}
				quote={quote}
				onSuccess={() => setEmailDialogOpen(false)}
			/>
		</ConnectModuleShell>
	)
}
