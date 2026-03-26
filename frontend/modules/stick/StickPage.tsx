// frontend/modules/stick/StickPage.tsx
//
// Page placeholder — cards mockées remplacées par EmptyState mutualisé.
// Prête à recevoir les vraies fonctionnalités sans refacto supplémentaire.

import { EmptyState, ModulePageShell } from '@/components/module-ui'
import { Outlet } from '@tanstack/react-router'
import { Image } from 'lucide-react'
import { manifest } from './index'

export function StickPage() {
	return (
		<ModulePageShell manifest={manifest}>
			<EmptyState
				icon={Image}
				title='Module en cours de développement'
				description='Les fonctionnalités Affiches & visuels arrivent bientôt. Revenez dans une prochaine version.'
				fullPage
			/>

			{/* Sous-routes Stick éventuelles */}
			<Outlet />
		</ModulePageShell>
	)
}
