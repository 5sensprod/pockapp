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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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
import { useQuote } from '@/lib/queries/quotes'
import { navigationActions } from '@/lib/stores/navigationStore'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	ArrowLeft,
	ArrowRight,
	ChevronDown,
	Download,
	Edit,
	FileText,
	Loader2,
	Mail,
	Trash2,
} from 'lucide-react'
import { ConnectModuleShell } from '../../ConnectModuleShell'
import { SendQuoteEmailDialog } from '../../dialogs/SendQuoteEmailDialog'
import { useDocumentNavigation } from '../../hooks/useDocumentNavigation'
import { useQuoteActions } from '../../hooks/useQuoteActions'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { getQuoteStatus } from '../../utils/statusConfig'

export function QuoteDetailPage() {
	const navigate = useNavigate()
	const { quoteId } = useParams({ from: '/connect/quotes/$quoteId/' })
	const { goBack, search } = useDocumentNavigation('quote')
	const { data: quote, isLoading } = useQuote(quoteId)

	const actions = useQuoteActions(quote)

	// ── Header gauche ─────────────────────────────────────────────────────
	const backButton = (title: string) => (
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
				headerLeft={backButton('Devis')}
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
				headerLeft={backButton('Devis introuvable')}
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
	const alreadyConverted = !!quote.generated_invoice_id

	// ── Dropdown Actions ──────────────────────────────────────────────────
	const dropdownItems: React.ReactNode[] = []

	// Email
	dropdownItems.push(
		<DropdownMenuItem
			key='email'
			onClick={() => actions.setEmailDialogOpen(true)}
		>
			<Mail className='h-4 w-4 mr-2' />
			Envoyer par email
		</DropdownMenuItem>,
	)

	// Modifier (brouillon ou envoyé)
	if (quote.status === 'draft' || quote.status === 'sent') {
		dropdownItems.push(
			<DropdownMenuItem
				key='modifier'
				onClick={() =>
					navigate({
						to: '/connect/quotes/$quoteId/edit',
						params: { quoteId: quote.id },
						search:
							Object.keys(search).length > 0 ? (search as any) : undefined,
					})
				}
			>
				<Edit className='h-4 w-4 mr-2' />
				Modifier
			</DropdownMenuItem>,
		)
	}

	// Transformer en facture
	dropdownItems.push(<DropdownMenuSeparator key='sep-convert' />)
	dropdownItems.push(
		<DropdownMenuItem
			key='convert'
			onClick={actions.handleOpenConvert}
			disabled={alreadyConverted || actions.isConverting}
		>
			<ArrowRight className='h-4 w-4 mr-2' />
			{alreadyConverted
				? 'Déjà transformé en facture'
				: 'Transformer en facture'}
		</DropdownMenuItem>,
	)

	// Supprimer
	dropdownItems.push(<DropdownMenuSeparator key='sep-delete' />)
	dropdownItems.push(
		<DropdownMenuItem
			key='delete'
			onClick={actions.handleOpenDelete}
			className='text-red-600'
		>
			<Trash2 className='h-4 w-4 mr-2' />
			Supprimer
		</DropdownMenuItem>,
	)

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
				<div className='flex items-center gap-1.5'>
					{/* Dropdown Actions */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='outline' size='sm' className='gap-1.5'>
								<ChevronDown className='h-4 w-4 shrink-0' />
								<span className='hidden lg:inline'>Actions</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end' className='w-52'>
							{dropdownItems}
						</DropdownMenuContent>
					</DropdownMenu>

					{/* PDF */}
					<Button
						size='sm'
						onClick={actions.handleDownloadPdf}
						disabled={actions.isDownloading}
						className='gap-1.5'
					>
						{actions.isDownloading ? (
							<Loader2 className='h-4 w-4 animate-spin shrink-0' />
						) : (
							<Download className='h-4 w-4 shrink-0' />
						)}
						<span className='hidden lg:inline'>PDF</span>
					</Button>
				</div>
			}
			primaryAction={null}
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

						{/* Facture générée */}
						{alreadyConverted && quote.generated_invoice_id && (
							<div className='border-t pt-4'>
								<p className='text-sm text-muted-foreground mb-2'>
									Facture générée
								</p>
								<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3'>
									<div className='flex items-center gap-2'>
										<FileText className='h-4 w-4 text-muted-foreground' />
										<span className='font-medium text-sm'>
											Voir la facture associée
										</span>
									</div>
									<Button
										variant='outline'
										size='sm'
										onClick={() => {
											navigationActions.push({
												path: `/connect/quotes/${quoteId}`,
												label: `Devis ${quote.number}`,
												params: { quoteId },
												search:
													Object.keys(search).length > 0
														? (search as Record<string, string>)
														: undefined,
											})
											navigate({
												to: '/connect/invoices/$invoiceId',
												params: { invoiceId: quote.generated_invoice_id ?? '' },
											})
										}}
									>
										Voir
									</Button>
								</div>
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

			{/* ── Dialogs ──────────────────────────────────────────────────────── */}

			{/* Email */}
			<SendQuoteEmailDialog
				open={actions.emailDialogOpen}
				onOpenChange={actions.setEmailDialogOpen}
				quote={quote}
				onSuccess={() => actions.setEmailDialogOpen(false)}
			/>

			{/* Transformer en facture */}
			<Dialog
				open={actions.convertDialogOpen}
				onOpenChange={actions.setConvertDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Transformer en facture</DialogTitle>
						<DialogDescription>
							Vous allez créer une facture officielle à partir du devis{' '}
							<strong>{quote.number}</strong>. La facture sera numérotée,
							chaînée et ne pourra plus être supprimée.
						</DialogDescription>
					</DialogHeader>
					<div className='mt-4 space-y-1 text-sm'>
						<p>
							<strong>Client :</strong> {customer?.name}
						</p>
						<p>
							<strong>Montant TTC :</strong>{' '}
							{formatCurrency(quote.total_ttc, quote.currency)}
						</p>
					</div>
					<DialogFooter className='mt-4'>
						<Button
							variant='outline'
							onClick={() => actions.setConvertDialogOpen(false)}
							disabled={actions.isConverting}
						>
							Annuler
						</Button>
						<Button
							onClick={actions.handleConfirmConvert}
							disabled={actions.isConverting}
						>
							{actions.isConverting ? 'Création...' : 'Créer la facture'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Supprimer */}
			<Dialog
				open={actions.deleteDialogOpen}
				onOpenChange={actions.setDeleteDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Supprimer ce devis ?</DialogTitle>
						<DialogDescription>
							Cette action est irréversible. Le devis{' '}
							<strong>{quote.number}</strong> sera définitivement supprimé.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => actions.setDeleteDialogOpen(false)}
							disabled={actions.isDeleting}
						>
							Annuler
						</Button>
						<Button
							variant='destructive'
							onClick={actions.handleConfirmDelete}
							disabled={actions.isDeleting}
						>
							{actions.isDeleting ? 'Suppression...' : 'Supprimer'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</ConnectModuleShell>
	)
}
