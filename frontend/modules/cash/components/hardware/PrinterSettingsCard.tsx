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
import { Printer } from 'lucide-react'
// frontend/modules/cash/components/hardware/PrinterSettingsCard.tsx
import * as React from 'react'
import { PosPrinterConfigCard } from './PosPrinterConfigCard'

/**
 * Carte de configuration de l'imprimante POS
 * Affiche un bouton pour ouvrir le dialog de configuration
 */
export function PrinterSettingsCard() {
	const [isDialogOpen, setIsDialogOpen] = React.useState(false)

	return (
		<>
			<Card className='border-slate-200'>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-sm'>
						<Printer className='h-4 w-4 text-slate-500' />
						Imprimante POS
					</CardTitle>
					<CardDescription>
						Sélectionnez l'imprimante ticket et la largeur.
					</CardDescription>
				</CardHeader>

				<CardContent className='space-y-3'>
					<Button
						variant='outline'
						size='sm'
						className='w-full'
						onClick={() => setIsDialogOpen(true)}
					>
						Configurer l'imprimante
					</Button>
				</CardContent>
			</Card>

			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogContent className='sm:max-w-lg'>
					<DialogHeader>
						<DialogTitle>Configuration imprimante POS</DialogTitle>
					</DialogHeader>

					<PosPrinterConfigCard />

					<div className='flex justify-end pt-2'>
						<Button onClick={() => setIsDialogOpen(false)}>Fermer</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}
