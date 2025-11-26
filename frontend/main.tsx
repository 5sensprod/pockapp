// frontend/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { ActiveCompanyProvider } from '@/lib/ActiveCompanyProvider'
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
			<AuthProvider>
				<ActiveCompanyProvider>
					<RouterProvider router={router} />
					<Toaster richColors closeButton />
				</ActiveCompanyProvider>
			</AuthProvider>
		</QueryClientProvider>
	</StrictMode>,
)
