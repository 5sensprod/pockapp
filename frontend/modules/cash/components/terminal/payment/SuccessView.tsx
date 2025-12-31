// frontend/modules/cash/components/terminal/payment/SuccessView.tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2 } from 'lucide-react'

interface SuccessViewProps {
	onNewSale: () => void
}

export function SuccessView({ onNewSale }: SuccessViewProps) {
	return (
		<div className='flex h-screen items-center justify-center'>
			<Card className='w-96'>
				<CardContent className='flex flex-col items-center justify-center p-8 space-y-4'>
					<div className='h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center'>
						<CheckCircle2 className='h-8 w-8 text-emerald-600' />
					</div>
					<div className='text-center space-y-2'>
						<h3 className='text-xl font-bold'>Paiement effectué !</h3>
						<p className='text-muted-foreground'>
							Le ticket a été créé avec succès
						</p>
					</div>
					<Button onClick={onNewSale} className='w-full'>
						Nouvelle vente
					</Button>
				</CardContent>
			</Card>
		</div>
	)
}
