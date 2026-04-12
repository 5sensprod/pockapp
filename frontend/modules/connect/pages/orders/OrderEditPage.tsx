// frontend/modules/connect/pages/orders/OrderEditPage.tsx
//
// Un bon de commande confirmé ne peut plus être modifié directement.
// Cette page est accessible uniquement depuis le statut `draft`.

import { ModulePageShell } from '@/components/module-ui/ModulePageShell'
import { Button } from '@/components/ui/button'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { manifest } from '../../manifest'

export function OrderEditPage() {
	const navigate = useNavigate()
	const { orderId } = useParams({ strict: false }) as { orderId: string }

	return (
		<ModulePageShell
			manifest={manifest}
			headerLeft={
				<Button
					variant='ghost'
					size='sm'
					onClick={() =>
						navigate({
							to: '/connect/orders/$orderId',
							params: { orderId },
						})
					}
				>
					<ArrowLeft className='h-4 w-4 mr-1.5' />
					Bon de commande
				</Button>
			}
		>
			<div className='max-w-4xl mx-auto'>
				<p className='text-muted-foreground text-sm'>
					{/* TODO: réutiliser le formulaire de OrderCreatePage en mode édition */}
					Formulaire d'édition — même structure que la création, initialisé avec
					les données du bon #{orderId}.
				</p>
				<p className='text-xs text-muted-foreground mt-2'>
					⚠️ Seuls les bons en statut <strong>Brouillon</strong> sont
					modifiables. Une fois confirmé, tout changement doit passer par un
					avenant.
				</p>
			</div>
		</ModulePageShell>
	)
}
