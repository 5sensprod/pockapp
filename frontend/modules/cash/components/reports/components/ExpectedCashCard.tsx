// frontend/modules/cash/components/reports/components/ExpectedCashCard.tsx

import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '../utils'

interface ExpectedCashCardProps {
	openingFloat: number
	movements: number
	total: number
	salesCash?: number
	showSalesInfo?: boolean
}

/**
 * Carte affichant les espèces attendues en caisse
 */
export function ExpectedCashCard({
	openingFloat,
	movements,
	total,
	salesCash,
	showSalesInfo = false,
}: ExpectedCashCardProps) {
	return (
		<div className='space-y-3'>
			{/* Bloc principal : calcul caisse */}
			<Card className='border-2 border-primary'>
				<CardContent className='pt-6 space-y-2 text-sm'>
					<div className='flex justify-between'>
						<span>Fonds de caisse :</span>
						<span className='font-medium'>{formatCurrency(openingFloat)}</span>
					</div>

					<div className='flex justify-between'>
						<span>Impact caisse (journal) :</span>
						<span className='font-medium'>{formatCurrency(movements)}</span>
					</div>

					<Separator />

					<div className='flex justify-between text-xl font-bold'>
						<span>Total attendu :</span>
						<span className='text-primary'>{formatCurrency(total)}</span>
					</div>

					<div className='pt-2 text-xs text-muted-foreground leading-relaxed'>
						Le total attendu est calculé à partir du <b>journal de caisse</b>{' '}
						(entrées, sorties, remboursements, dépôts).
					</div>
				</CardContent>
			</Card>

			{/* Bloc info ventes (optionnel) */}
			{showSalesInfo && salesCash !== undefined && (
				<Card>
					<CardContent className='pt-6 space-y-2 text-sm'>
						<div className='flex justify-between'>
							<span className='text-muted-foreground'>Information ventes :</span>
							<span className='text-muted-foreground'>—</span>
						</div>

						<div className='flex justify-between'>
							<span>Ventes espèces (info) :</span>
							<span className='font-medium'>{formatCurrency(salesCash)}</span>
						</div>

						<div className='pt-2 text-xs text-muted-foreground leading-relaxed'>
							Ce montant est une statistique commerciale. Il peut être inclus
							dans l'impact caisse si les ventes espèces sont journalisées en
							mouvements.
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
