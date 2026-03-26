import { getLastRouteForModule } from '@/lib/stores/moduleNavigationStore'
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/cash/')({
	beforeLoad: () => {
		const last = getLastRouteForModule('cash')
		// Si une dernière route mémorisée existe (autre que /cash ou /cash/config), on y va
		if (
			last &&
			last !== '/cash' &&
			last !== '/cash/' &&
			last !== '/cash/config'
		) {
			throw redirect({ to: last as any })
		}
		// Sinon, toujours rediriger vers la page de config
		throw redirect({ to: '/cash/config' })
	},
})
