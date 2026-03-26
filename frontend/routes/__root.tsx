import { Layout } from '@/layout'
import { useSaveModuleRoute } from '@/lib/hooks/useModuleNavigation'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import * as React from 'react'

function RootComponent() {
	useSaveModuleRoute()

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
