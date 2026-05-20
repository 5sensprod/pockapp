// frontend/modules/cash/components/reports/components/SalesCard.tsx

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
	CUSTOMER_TYPE_EREPORTING,
	CUSTOMER_TYPE_LABELS,
	type CustomerType,
	type CustomerTypeSummary,
} from '@/lib/types/cash.types'
import { formatCurrency } from '../utils'
import { PaymentMethodBreakdown } from '../utils/components'

interface SalesCardProps {
	invoiceCount: number
	totalTTC: number
	netTTC?: number
	byMethod?: Record<string, number>
	netByMethod?: Record<string, number>
	byMethodLabels?: Record<string, string>
	byCustomerType?: Record<string, CustomerTypeSummary>
	depositsCount?: number
	depositsTTC?: number
}

const CUSTOMER_TYPE_ORDER: CustomerType[] = [
	'individual',
	'professional',
	'administration',
	'association',
]

export function SalesCard({
	invoiceCount,
	totalTTC,
	netTTC,
	byMethod,
	netByMethod,
	byMethodLabels,
	byCustomerType,
	depositsCount,
	depositsTTC,
}: SalesCardProps) {
	const hasCustomerTypes =
		byCustomerType && Object.keys(byCustomerType).length > 0
	const hasDeposits = depositsCount && depositsCount > 0
	const showNet = netTTC !== undefined && netTTC !== totalTTC

	return (
		<Card>
			<CardContent className='pt-6 space-y-3'>
				{/* Totaux principaux */}
				<div className='flex justify-between text-sm'>
					<span className='text-muted-foreground'>Tickets / factures :</span>
					<span className='font-semibold'>{invoiceCount}</span>
				</div>
				<div className='flex justify-between'>
					<span className='text-sm'>Total TTC :</span>
					<span className='font-bold text-lg'>{formatCurrency(totalTTC)}</span>
				</div>

				{showNet && netTTC !== undefined && (
					<div className='flex justify-between text-sm'>
						<span className='text-muted-foreground'>Net après avoirs :</span>
						<span className='font-semibold text-emerald-700'>
							{formatCurrency(netTTC)}
						</span>
					</div>
				)}

				{/* Acomptes si présents */}
				{hasDeposits && depositsTTC !== undefined && (
					<div className='flex justify-between text-sm'>
						<span className='text-muted-foreground'>
							dont acomptes ({depositsCount}) :
						</span>
						<span className='font-medium text-amber-700'>
							{formatCurrency(depositsTTC)}
						</span>
					</div>
				)}

				{/* Ventilation par type de client (e-reporting) */}
				{hasCustomerTypes && (
					<>
						<Separator />
						<div className='space-y-1'>
							<p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'>
								Ventes par nature (e-reporting)
							</p>
							{CUSTOMER_TYPE_ORDER.filter((ct) => byCustomerType[ct]).map(
								(ct) => {
									const s = byCustomerType[ct]
									const tag = CUSTOMER_TYPE_EREPORTING[ct]
									return (
										<div
											key={ct}
											className='flex items-center justify-between text-sm py-0.5'
										>
											<div className='flex items-center gap-2'>
												<Badge
													variant='outline'
													className={
														tag === 'B2C'
															? 'text-xs px-1.5 py-0 text-blue-700 border-blue-200'
															: 'text-xs px-1.5 py-0 text-violet-700 border-violet-200'
													}
												>
													{tag}
												</Badge>
												<span className='text-muted-foreground'>
													{CUSTOMER_TYPE_LABELS[ct]}
												</span>
											</div>
											<div className='flex items-center gap-3'>
												<span className='text-xs text-muted-foreground'>
													{s.count} doc.
												</span>
												<span className='font-medium w-24 text-right'>
													{formatCurrency(s.total_ttc)}
												</span>
											</div>
										</div>
									)
								},
							)}
						</div>
					</>
				)}

				{/* Encaissements par moyen */}
				{byMethod && Object.keys(byMethod).length > 0 && (
					<>
						<Separator />
						<PaymentMethodBreakdown
							byMethod={byMethod}
							byMethodLabels={byMethodLabels}
							label='Répartition par mode de paiement'
						/>
					</>
				)}

				{/* Net par moyen */}
				{netByMethod && Object.keys(netByMethod).length > 0 && (
					<>
						<Separator />
						<PaymentMethodBreakdown
							byMethod={netByMethod}
							byMethodLabels={byMethodLabels}
							label='Résultat financier par mode (ventes - remboursements)'
						/>
					</>
				)}
			</CardContent>
		</Card>
	)
}
