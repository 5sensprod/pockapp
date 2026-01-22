// frontend/modules/cash/components/reports/components/RefundsCard.tsx

import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '../utils'
import { PaymentMethodBreakdown } from '../utils/components'

interface RefundsCardProps {
	creditNotesCount: number
	totalTTC: number
	byMethod?: Record<string, number>
	byMethodLabels?: Record<string, string>
}

/**
 * Carte affichant les informations de remboursements
 */
export function RefundsCard({
	creditNotesCount,
	totalTTC,
	byMethod,
	byMethodLabels,
}: RefundsCardProps) {
	return (
		<Card>
			<CardContent className='pt-6 space-y-3'>
				<div className='flex justify-between text-sm'>
					<span>Nombre d'avoirs :</span>
					<span className='font-semibold'>{creditNotesCount}</span>
				</div>
				<div className='flex justify-between'>
					<span>Total remboursé TTC :</span>
					<span className='font-bold text-lg text-red-600'>
						-{formatCurrency(totalTTC)}
					</span>
				</div>

				{byMethod && Object.keys(byMethod).length > 0 && (
					<>
						<Separator />
						<PaymentMethodBreakdown
							byMethod={byMethod}
							byMethodLabels={byMethodLabels} // 🆕 AJOUTER
							label='Répartition par mode de remboursement'
							colorClass='font-medium text-red-600'
						/>
					</>
				)}
			</CardContent>
		</Card>
	)
}
