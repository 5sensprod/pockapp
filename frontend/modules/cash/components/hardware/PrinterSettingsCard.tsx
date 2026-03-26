// frontend/modules/cash/components/hardware/PrinterSettingsCard.tsx
import { ModuleCard } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Printer } from 'lucide-react'
import * as React from 'react'
import { PosPrinterConfigCard } from './PosPrinterConfigCard'

export function PrinterSettingsCard() {
	const [isDialogOpen, setIsDialogOpen] = React.useState(false)

	return (
		<>
			<ModuleCard icon={Printer} title='Imprimante POS'>
				<div className='space-y-3 text-sm'>
					<p className='text-xs text-muted-foreground'>
						Sélectionnez l'imprimante ticket et la largeur.
					</p>
					<Button
						variant='outline'
						size='sm'
						className='w-full'
						onClick={() => setIsDialogOpen(true)}
					>
						Configurer l'imprimante
					</Button>
				</div>
			</ModuleCard>

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
