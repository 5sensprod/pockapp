import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
// frontend/modules/site/AppSitePage.tsx
import { Outlet } from '@tanstack/react-router'

import { manifest } from './index'

/**
 * Squelette du module AppSite (ticket 2).
 *
 * La page ne fait rien et c'est volontaire : l'éditeur d'arbre arrive au
 * ticket 4, l'action « Publier le menu » au ticket 6. Voir
 * `AppSite-docs/README.md` pour l'état des tickets.
 */
export function AppSitePage() {
	const Icon = manifest.icon

	return (
		<div className='container mx-auto px-6 py-8'>
			<div className='mb-8'>
				<div className='mb-2 flex items-center gap-3'>
					<div className='flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10'>
						<Icon className='h-6 w-6 text-primary' />
					</div>
					<h1 className='font-bold text-3xl'>{manifest.name}</h1>
				</div>
				<p className='text-muted-foreground'>{manifest.description}</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className='text-lg'>Menu de navigation</CardTitle>
					<CardDescription>
						Le menu du site sera édité ici, puis publié vers axemusique.shop.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className='text-muted-foreground text-sm'>
						Module en construction. L'éditeur d'arbre et la publication ne sont
						pas encore branchés — le site continue de servir le menu WordPress.
					</p>
				</CardContent>
			</Card>

			<Outlet />
		</div>
	)
}
