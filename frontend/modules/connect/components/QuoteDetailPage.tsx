// frontend/modules/connect/components/QuoteDetailPage.tsx
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
import { useQuote } from '@/lib/queries/quotes'
import type { QuoteStatus } from '@/lib/types/invoice.types'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Edit, FileText } from 'lucide-react'

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

export function QuoteDetailPage() {
	const navigate = useNavigate()
	const { quoteId } = useParams({ from: '/connect/quotes/$quoteId/' })
	const { data: quote, isLoading } = useQuote(quoteId)

	if (isLoading) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<div className='text-muted-foreground'>Chargement...</div>
			</div>
		)
	}

	if (!quote) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<div className='text-muted-foreground'>Devis introuvable</div>
				<Button
					variant='outline'
					className='mt-4'
					onClick={() => navigate({ to: '/connect/quotes' })}
				>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour aux devis
				</Button>
			</div>
		)
	}

	const customer = quote.expand?.customer

	return (
		<div className='container mx-auto px-6 py-8'>
			{/* Header */}
			<div className='flex items-center justify-between mb-6'>
				<div className='flex items-center gap-4'>
					<Button
						variant='ghost'
						size='icon'
						onClick={() => navigate({ to: '/connect/quotes' })}
					>
						<ArrowLeft className='h-4 w-4' />
					</Button>
					<div>
						<h1 className='text-2xl font-bold flex items-center gap-2'>
							<FileText className='h-6 w-6' />
							Devis {quote.number}
						</h1>
						<p className='text-muted-foreground'>
							Créé le {formatDate(quote.created)}
						</p>
					</div>
				</div>
				<div className='flex items-center gap-2'>
					<Badge variant={getQuoteStatusVariant(quote.status)}>
						{getQuoteStatusLabel(quote.status)}
					</Badge>
					{quote.status === 'draft' && (
						<Button
							onClick={() =>
								navigate({
									to: '/connect/quotes/$quoteId/edit',
									params: { quoteId: quote.id },
								})
							}
						>
							<Edit className='h-4 w-4 mr-2' />
							Modifier
						</Button>
					)}
				</div>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
				{/* Informations principales */}
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
								<p className='font-medium'>
									{quote.valid_until ? formatDate(quote.valid_until) : '-'}
								</p>
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
									<TableHead className='text-right'>TVA</TableHead>
									<TableHead className='text-right'>Total HT</TableHead>
									<TableHead className='text-right'>Total TTC</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{quote.items.map((item) => (
									<TableRow key={`${item.name}-${item.quantity}`}>
										<TableCell className='font-medium'>{item.name}</TableCell>
										<TableCell className='text-right'>
											{item.quantity}
										</TableCell>
										<TableCell className='text-right'>
											{formatCurrency(item.unit_price_ht, quote.currency)}
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
								))}
							</TableBody>
						</Table>

						{/* Totaux */}
						<div className='mt-6 flex justify-end'>
							<div className='w-64 space-y-2'>
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
		</div>
	)
}
