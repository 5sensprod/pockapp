// frontend/modules/cash/components/infos/StoreInfoCard.tsx
import { ModuleCard } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Store } from 'lucide-react'

interface StoreInfoCardProps {
	selectedStore?: string
}

export function StoreInfoCard({
	selectedStore = 'Axe Musique — Centre-ville',
}: StoreInfoCardProps) {
	return (
		<ModuleCard icon={Store} title='Point de vente'>
			<div className='space-y-4 text-sm'>
				<div className='space-y-1'>
					<div className='text-xs text-muted-foreground'>
						Magasin sélectionné
					</div>
					<div className='font-medium text-foreground'>{selectedStore}</div>
					<div className='text-xs text-muted-foreground'>
						ID interne : POS-001 · multi-caisses activé
					</div>
				</div>

				<Separator />

				<div className='grid grid-cols-2 gap-2 text-xs text-muted-foreground'>
					<div>
						<div className='font-medium text-foreground'>Profil fiscal</div>
						<div>France · TVA 20 %</div>
					</div>
					<div>
						<div className='font-medium text-foreground'>Ticket par défaut</div>
						<div>Format simplifié</div>
					</div>
				</div>

				<div className='flex gap-2 pt-1'>
					<Button variant='outline' size='sm' className='flex-1'>
						Gérer les magasins
					</Button>
					<Button variant='outline' size='sm' className='flex-1'>
						Paramètres POS
					</Button>
				</div>
			</div>
		</ModuleCard>
	)
}
