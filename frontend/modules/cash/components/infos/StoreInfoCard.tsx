// frontend/modules/cash/components/infos/StoreInfoCard.tsx
import { Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface StoreInfoCardProps {
	/**
	 * Nom du magasin sélectionné
	 * TODO: À connecter au backend - actuellement mockée
	 */
	selectedStore?: string
}

/**
 * Carte d'information sur le point de vente
 * ⚠️ MOCK : Toutes les données sont actuellement en dur
 * TODO: Connecter au backend pour récupérer les vraies données du magasin
 */
export function StoreInfoCard({
	selectedStore = 'Axe Musique — Centre-ville',
}: StoreInfoCardProps) {
	return (
		<Card className='border-slate-200'>
			<CardHeader className='pb-3'>
				<CardTitle className='flex items-center gap-2 text-sm'>
					<Store className='h-4 w-4 text-slate-500' />
					Point de vente
				</CardTitle>
				<CardDescription>
					Sélectionnez le magasin et paramétrez ses options.
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-4 text-sm'>
				<div className='space-y-1'>
					<div className='text-xs text-muted-foreground'>
						Magasin sélectionné
					</div>
					<div className='font-medium text-slate-900'>{selectedStore}</div>
					<div className='text-xs text-muted-foreground'>
						{/* TODO: Remplacer par les vraies données */}
						ID interne : POS-001 • multi-caisses activé
					</div>
				</div>

				<Separator />

				<div className='grid grid-cols-2 gap-2 text-xs text-muted-foreground'>
					<div>
						<div className='font-medium text-slate-900'>Profil fiscal</div>
						{/* TODO: Récupérer depuis le backend */}
						<div>France • TVA 20 %</div>
					</div>
					<div>
						<div className='font-medium text-slate-900'>Ticket par défaut</div>
						{/* TODO: Récupérer depuis le backend */}
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
			</CardContent>
		</Card>
	)
}
