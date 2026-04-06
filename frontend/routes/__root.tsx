import { Layout } from '@/layout'
import { useSaveModuleRoute } from '@/lib/hooks/useModuleNavigation'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Outlet, createRootRoute, useLocation } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import * as React from 'react'

function RootComponent() {
	useSaveModuleRoute()

	// Scroll en haut à chaque changement de route
	const location = useLocation()
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll to top on route change
	React.useEffect(() => {
		window.scrollTo(0, 0)
	}, [location.pathname])

	return (
		<React.Fragment>
			<Layout>
				<Outlet />
			</Layout>
			{import.meta.env.PROD ? null : (
				<>
					<TanStackRouterDevtools />
					<ReactQueryDevtools />
				</>
			)}
		</React.Fragment>
	)
}

export const Route = createRootRoute({
	component: RootComponent,
})
