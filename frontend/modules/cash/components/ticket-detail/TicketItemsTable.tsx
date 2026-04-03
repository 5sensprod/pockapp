// frontend/modules/cash/components/ticket-detail/TicketItemsTable.tsx
//
// Affiche le tableau des articles + récapitulatif financier (HT, TVA, TTC, remises).
// 100% présentationnelle — reçoit invoice + discounts en props.

import { ModuleCard } from '@/components/module-ui/ModuleCard'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { formatCurrency } from '@/modules/connect/utils/formatters'
import { ShoppingCart } from 'lucide-react'
import type { DiscountSummary, VatBreakdown } from './useTicketDetail'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

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

	const beforeUnitTtc = Number(item?.unit_price_ttc_before_discount)
	const unitHt = Number(item?.unit_price_ht ?? 0)
	const tvaRate = Number(item?.tva_rate ?? 20)
	const effectiveUnitTtc = round2(unitHt * (1 + tvaRate / 100))

	if (Number.isFinite(beforeUnitTtc) && beforeUnitTtc > 0) {
		const diff = round2(Math.max(0, beforeUnitTtc - effectiveUnitTtc))
		if (diff <= 0) return { label: '-', hasDiscount: false }
		return { label: `-${diff.toFixed(2)} €/u`, hasDiscount: true }
	}

	const v = round2(Math.max(0, Number(value) || 0))
	if (v <= 0) return { label: '-', hasDiscount: false }
	return { label: `-${v.toFixed(2)} €`, hasDiscount: true }
}

interface TicketItemsTableProps {
	invoice: InvoiceResponse
	discounts: DiscountSummary
	vatBreakdown: VatBreakdown[]
	isTicket: boolean
	needsTicketSidebar: boolean
}

export function TicketItemsTable({
	invoice,
	discounts,
	vatBreakdown,
	isTicket,
	needsTicketSidebar,
}: TicketItemsTableProps) {
	const colSpanClass = isTicket
		? needsTicketSidebar
			? 'lg:col-span-8'
			: 'lg:col-span-12'
		: 'lg:col-span-6'

	return (
		<ModuleCard
			title='Articles'
			icon={ShoppingCart}
			className={colSpanClass}
			headerRight={
				<span className='text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded'>
					{invoice.items.length} ligne(s)
				</span>
			}
		>
			<div className='overflow-x-auto'>
				<Table>
					<TableHeader>
						<TableRow className='border-border/50'>
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
							const beforeUnitTtc = Number(item?.unit_price_ttc_before_discount)
							const hasBefore =
								Number.isFinite(beforeUnitTtc) && beforeUnitTtc > 0
							const coef = 1 + Number(item?.tva_rate ?? 20) / 100
							const unitTtcFromHt = round2(
								Number(item?.unit_price_ht ?? 0) * coef,
							)

							return (
								<TableRow
									key={`${item.name}-${idx}`}
									className='border-border/40'
								>
									<TableCell className='font-medium'>
										<div className='flex flex-col'>
											<span>{item.name}</span>
											{hasBefore && promo.hasDiscount && (
												<span className='text-xs text-muted-foreground mt-0.5'>
													<span className='line-through mr-2 opacity-70'>
														{round2(beforeUnitTtc).toFixed(2)} €
													</span>
													<span>{unitTtcFromHt.toFixed(2)} € TTC</span>
												</span>
											)}
										</div>
									</TableCell>
									<TableCell className='text-center'>{item.quantity}</TableCell>
									<TableCell className='text-right'>
										{Number(item.unit_price_ht ?? 0).toFixed(2)} €
									</TableCell>
									<TableCell className='text-right'>{promo.label}</TableCell>
									<TableCell className='text-right text-muted-foreground'>
										{item.tva_rate}%
									</TableCell>
									<TableCell className='text-right font-medium'>
										{Number(item.total_ttc ?? 0).toFixed(2)} €
									</TableCell>
								</TableRow>
							)
						})}
					</TableBody>
				</Table>
			</div>

			{/* Récapitulatif financier */}
			<div className='mt-8 flex justify-end'>
				<div className='w-72 space-y-2.5 text-sm'>
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
									<span className='text-muted-foreground'>Remises lignes</span>
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
							<div className='border-t border-border/50 pt-2.5' />
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
									className='flex justify-between text-[11px] text-muted-foreground/80'
								>
									<span>
										TVA {vb.rate}% sur {vb.base_ht.toFixed(2)} € HT
									</span>
									<span>{vb.vat.toFixed(2)} €</span>
								</div>
							))}
						</div>
					)}

					<div className='flex justify-between font-bold text-lg border-t border-border/50 pt-3 mt-1'>
						<span>Total TTC</span>
						<span>{formatCurrency(invoice.total_ttc, invoice.currency)}</span>
					</div>
				</div>
			</div>
		</ModuleCard>
	)
}
