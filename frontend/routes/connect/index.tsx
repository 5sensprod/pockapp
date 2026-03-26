import { getLastRouteForModule } from '@/lib/stores/moduleNavigationStore'
// frontend/routes/connect/index.tsx
import { ConnectPage } from '@/modules/connect/ConnectPage'
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/')({
	beforeLoad: () => {
		const last = getLastRouteForModule('connect')
		if (last) {
			throw redirect({ to: last as any })
		}
	},
	component: ConnectPage,
})
