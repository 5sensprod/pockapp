import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
// frontend/modules/site/AppSitePage.tsx
import { Outlet } from '@tanstack/react-router'

import { MenuTreeEditor } from './components/MenuTreeEditor'
import { manifest } from './index'

/**
 * Page du module PocketSite.
 *
 * Porte l'éditeur d'arbre (ticket 4). L'action « Publier le menu » arrive au
 * ticket 6 : **rien ici ne sort du poste**, l'éditeur écrit dans `site_menu`
 * et s'arrête là. Voir `PocketSite-docs/README.md` pour l'état des tickets.
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
						Édité ici, publié vers axemusique.shop dans un second temps. La
						publication n'est pas encore branchée : le site continue de servir
						le menu WordPress.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<MenuTreeEditor />
				</CardContent>
			</Card>

			<Outlet />
		</div>
	)
}
