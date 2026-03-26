import { getLastRouteForModule } from '@/lib/stores/moduleNavigationStore'
import { CashPage } from '@/modules/cash'
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/cash/')({
	beforeLoad: () => {
		const last = getLastRouteForModule('cash')
		if (last && last !== '/cash' && last !== '/cash/') {
			throw redirect({ to: last as any })
		}
	},
	component: CashPage,
})
