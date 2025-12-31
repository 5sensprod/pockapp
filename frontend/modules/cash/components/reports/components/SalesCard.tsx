// frontend/modules/cash/components/reports/components/SalesCard.tsx

import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '../utils'
import { PaymentMethodBreakdown } from '../utils/components'

interface SalesCardProps {
	invoiceCount: number
	totalTTC: number
	byMethod?: Record<string, number>
	netByMethod?: Record<string, number>
}

/**
 * Carte affichant les informations de ventes
 */
export function SalesCard({
	invoiceCount,
	totalTTC,
	byMethod,
	netByMethod,
}: SalesCardProps) {
	return (
		<Card>
			<CardContent className='pt-6 space-y-3'>
				<div className='flex justify-between text-sm'>
					<span>Nombre de tickets :</span>
					<span className='font-semibold'>{invoiceCount}</span>
				</div>
				<div className='flex justify-between'>
					<span>Total TTC :</span>
					<span className='font-bold text-lg'>{formatCurrency(totalTTC)}</span>
				</div>

				{byMethod && Object.keys(byMethod).length > 0 && (
					<>
						<Separator />
						<PaymentMethodBreakdown
							byMethod={byMethod}
							label='Répartition par mode de paiement'
						/>
					</>
				)}

				{netByMethod && Object.keys(netByMethod).length > 0 && (
					<>
						<Separator />
						<PaymentMethodBreakdown
							byMethod={netByMethod}
							label='Résultat financier par mode (ventes - remboursements)'
						/>
					</>
				)}
			</CardContent>
		</Card>
	)
}
