// frontend/modules/connect/pages/invoices/sections/InvoiceLinesCard.tsx
//
// Les lignes du document et ses totaux fiscaux. Extrait tel quel de
// InvoiceDetailPage : aucun changement de rendu, aucun calcul ici — tout vient
// de `invoice-detail.presenters`.
//
// C'est une zone de CONSULTATION : elle ne porte aucune action.

import { Card, CardContent } from '@/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import type { InvoiceItem, InvoiceResponse } from '@/lib/types/invoice.types'
import {
	formatCurrency,
	getUnitPriceTtcBeforeDiscount,
	round2,
} from '../../../utils/formatters'
import type {
	DiscountSummary,
	VatBreakdown,
} from '../invoice-detail.presenters'
import { getLineDiscountLabel } from '../invoice-detail.presenters'

interface Props {
	invoice: InvoiceResponse
	vatBreakdown: VatBreakdown[]
	discounts: DiscountSummary
}

export function InvoiceLinesCard({ invoice, vatBreakdown, discounts }: Props) {
	return (
		<Card className='lg:col-span-3'>
			<CardContent className='p-6'>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Article</TableHead>
							<TableHead className='text-center w-20'>Qté</TableHead>
							<TableHead className='text-right'>P.U. TTC</TableHead>
							<TableHead className='text-right'>Remise</TableHead>
							<TableHead className='text-right'>TVA</TableHead>
							<TableHead className='text-right'>Total TTC</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{invoice.items.map((item: InvoiceItem, idx: number) => {
							const promo = getLineDiscountLabel(item)
							// P.U. TTC d'origine (avant remise ligne) : champ
							// persiste, ou reconstruction pour les documents legacy
							const unitTtcBefore = getUnitPriceTtcBeforeDiscount(item)
							const coef = 1 + Number(item?.tva_rate ?? 20) / 100
							const unitTtcNet = round2(Number(item?.unit_price_ht ?? 0) * coef)
							return (
								<TableRow key={`${item.name}-${idx}`}>
									<TableCell className='font-medium'>{item.name}</TableCell>
									<TableCell className='text-center'>{item.quantity}</TableCell>
									<TableCell className='text-right'>
										{promo.hasDiscount ? (
											<div className='flex flex-col items-end'>
												<span className='text-xs text-muted-foreground line-through'>
													{unitTtcBefore.toFixed(2)} €
												</span>
												<span>{unitTtcNet.toFixed(2)} €</span>
											</div>
										) : (
											<span>{unitTtcNet.toFixed(2)} €</span>
										)}
									</TableCell>
									<TableCell className='text-right'>{promo.label}</TableCell>
									<TableCell className='text-right'>{item.tva_rate}%</TableCell>
									<TableCell className='text-right'>
										{Number(item.total_ttc ?? 0).toFixed(2)} €
									</TableCell>
								</TableRow>
							)
						})}
					</TableBody>
				</Table>

				{/* Totaux */}
				<div className='mt-6 flex justify-end'>
					<div className='w-72 space-y-2 text-sm'>
						{discounts.hasAnyDiscount && (
							<>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>Sous-total TTC</span>
									<span>
										{formatCurrency(discounts.grandSubtotal, invoice.currency)}
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
							<span>{formatCurrency(invoice.total_ht, invoice.currency)}</span>
						</div>
						<div className='flex justify-between'>
							<span className='text-muted-foreground'>TVA</span>
							<span>{formatCurrency(invoice.total_tva, invoice.currency)}</span>
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
							<span>{formatCurrency(invoice.total_ttc, invoice.currency)}</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}
