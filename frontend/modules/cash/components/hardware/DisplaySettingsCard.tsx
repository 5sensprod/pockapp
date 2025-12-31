import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Monitor } from 'lucide-react'
// frontend/modules/cash/components/hardware/DisplaySettingsCard.tsx
import * as React from 'react'
import { CustomerDisplayConfigCard } from './CustomerDisplayConfigCard'

/**
 * Carte de configuration de l'afficheur client
 * Affiche un bouton pour ouvrir le dialog de configuration
 */
export function DisplaySettingsCard() {
	const [isDialogOpen, setIsDialogOpen] = React.useState(false)

	return (
		<>
			<Card className='border-slate-200'>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-sm'>
						<Monitor className='h-4 w-4 text-slate-500' />
						Afficheur Client
					</CardTitle>
					<CardDescription>
						Écran VFD 20x2 pour affichage côté client.
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-3'>
					<Button
						variant='outline'
						size='sm'
						className='w-full'
						onClick={() => setIsDialogOpen(true)}
					>
						Configurer l'afficheur
					</Button>
				</CardContent>
			</Card>

			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogContent className='sm:max-w-lg'>
					<DialogHeader>
						<DialogTitle>Configuration afficheur client</DialogTitle>
					</DialogHeader>

					<CustomerDisplayConfigCard />

					<div className='flex justify-end pt-2'>
						<Button onClick={() => setIsDialogOpen(false)}>Fermer</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}
