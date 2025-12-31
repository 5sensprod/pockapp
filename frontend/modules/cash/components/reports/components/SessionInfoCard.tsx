// frontend/modules/cash/components/reports/components/SessionInfoCard.tsx

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateTime } from '../utils'

interface SessionInfoCardProps {
	cashRegister: string
	generatedAt: string
	openedAt: string
	closedAt?: string
	status?: 'open' | 'closed'
}

/**
 * Carte affichant les informations de session de caisse
 */
export function SessionInfoCard({
	cashRegister,
	generatedAt,
	openedAt,
	closedAt,
	status = 'closed',
}: SessionInfoCardProps) {
	return (
		<Card>
			<CardContent className='pt-6 space-y-2 text-sm'>
				<div className='flex justify-between'>
					<span className='text-muted-foreground'>Caisse :</span>
					<span className='font-medium'>{cashRegister}</span>
				</div>
				<div className='flex justify-between'>
					<span className='text-muted-foreground'>Générée le :</span>
					<span className='font-medium'>{formatDateTime(generatedAt)}</span>
				</div>
				<div className='flex justify-between'>
					<span className='text-muted-foreground'>Session ouverte :</span>
					<span className='font-medium'>{formatDateTime(openedAt)}</span>
				</div>
				{closedAt && (
					<div className='flex justify-between'>
						<span className='text-muted-foreground'>Session fermée :</span>
						<span className='font-medium'>{formatDateTime(closedAt)}</span>
					</div>
				)}
				<div className='flex justify-between'>
					<span className='text-muted-foreground'>Statut :</span>
					<Badge variant={status === 'open' ? 'default' : 'secondary'}>
						{status === 'open' ? 'Session ouverte' : 'Session fermée'}
					</Badge>
				</div>
			</CardContent>
		</Card>
	)
}
