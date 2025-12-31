// frontend/modules/cash/components/reports/components/CashMovementsCard.tsx

import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '../utils'

interface CashMovementsCardProps {
	cashIn: number
	cashOut: number
	safeDrop: number
	total: number
}

/**
 * Carte affichant les mouvements de caisse (entrées/sorties/dépôts)
 */
export function CashMovementsCard({
	cashIn,
	cashOut,
	safeDrop,
	total,
}: CashMovementsCardProps) {
	return (
		<Card>
			<CardContent className='pt-6 space-y-2 text-sm'>
				<div className='flex justify-between'>
					<span>Entrées espèces :</span>
					<span className='text-green-600 font-medium'>
						+{formatCurrency(cashIn)}
					</span>
				</div>
				<div className='flex justify-between'>
					<span>Sorties espèces :</span>
					<span className='text-red-600 font-medium'>
						-{formatCurrency(cashOut)}
					</span>
				</div>
				<div className='flex justify-between'>
					<span>Dépôts en coffre :</span>
					<span className='text-red-600 font-medium'>
						-{formatCurrency(safeDrop)}
					</span>
				</div>
				<Separator />
				<div className='flex justify-between font-semibold'>
					<span>Total mouvements :</span>
					<span>{formatCurrency(total)}</span>
				</div>
			</CardContent>
		</Card>
	)
}
