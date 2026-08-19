// frontend/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { ActiveCompanyProvider } from '@/lib/ActiveCompanyProvider'
import { AppPosSessionProvider } from '@/lib/apppos'
import { CatalogRealtimeMount } from '@/lib/realtime/CatalogRealtimeMount'
import { AuthProvider } from '@/modules/auth/AuthProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { routeTree } from './routeTree.gen'

// Clear la session au démarrage (force login à chaque lancement)
localStorage.removeItem('pocketbase_auth')

const rootElement = document.getElementById('root')
const queryClient = new QueryClient()

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}

if (!rootElement) {
	throw Error(`Couldn't find #root in html`)
}

createRoot(rootElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			{/* Session AppPos ouverte une fois au lancement, sans bloquer le rendu.
			    Au-dessus d'AuthProvider : la requête part tout de suite et ne pèse
			    pas sur son `loading`. AppPos éteint reste un cas normal. */}
			<AppPosSessionProvider>
				<AuthProvider>
					<ActiveCompanyProvider>
						{/* Ventes, prix et stock d'un autre poste arrivent sans qu'on
						    recharge la page. Sous AuthProvider : la collection exige un
						    compte. Ne rend rien, ne bloque rien. */}
						<CatalogRealtimeMount />
						<RouterProvider router={router} />
						<Toaster richColors closeButton />
					</ActiveCompanyProvider>
				</AuthProvider>
			</AppPosSessionProvider>
		</QueryClientProvider>
	</StrictMode>,
)
