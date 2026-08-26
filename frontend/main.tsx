// frontend/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { ActiveCompanyProvider } from '@/lib/ActiveCompanyProvider'
import { AppPosSessionProvider } from '@/lib/apppos'
import { CatalogRealtimeMount } from '@/lib/realtime/CatalogRealtimeMount'
import { router } from '@/lib/router'
import { SyncQueueProvider } from '@/lib/sync/SyncQueueProvider'
import { AuthProvider } from '@/modules/auth/AuthProvider'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'

// Clear la session au démarrage (force login à chaque lancement)
localStorage.removeItem('pocketbase_auth')

const rootElement = document.getElementById('root')
const queryClient = new QueryClient()

// ═══════════════════════════════════════════════════════════════════════════
// LE CACHE SURVIT AU RECHARGEMENT — 25 août 2026
// ═══════════════════════════════════════════════════════════════════════════
// Un `new QueryClient()` nu garde tout en MÉMOIRE : un F5, une relance de
// l'application, et les écrans du module `stock` repartaient de zéro, quel que
// soit leur `staleTime`. C'est ce qui rendait /stock lent « alors que je l'ai
// déjà chargé une fois ».
//
// ⚠️ ON NE PERSISTE PAS TOUT, ET C'EST DÉLIBÉRÉ. Le catalogue seul : marques,
// catégories, fournisseurs et décomptes. Ni la caisse, ni les factures, ni les
// clients — ce sont des données commerciales et nominatives, et le poste est
// partagé. `main.tsx` efface d'ailleurs la session PocketBase à chaque
// démarrage (juste au-dessus) pour forcer l'identification : traîner sur le
// disque ce que la session refuse de garder serait incohérent.
//
// Ajouter une clé à cette liste, c'est décider d'écrire ces données sur le
// poste. Le faire sciemment.
const CLES_PERSISTEES = new Set([
	'brands',
	'categories',
	'suppliers',
	'catalog-counts',
])

const persister = createSyncStoragePersister({
	storage: window.localStorage,
	key: 'pocketapp-catalog-cache',
})

if (!rootElement) {
	throw Error(`Couldn't find #root in html`)
}

createRoot(rootElement).render(
	<StrictMode>
		<PersistQueryClientProvider
			client={queryClient}
			persistOptions={{
				persister,
				// Au-delà, ce qui a été écrit est trop vieux pour valoir mieux
				// qu'une requête : le cache est jeté au démarrage.
				maxAge: 24 * 60 * 60 * 1000,
				// `buster` invalide TOUT le cache écrit sous une version
				// précédente. À changer si la forme d'une de ces réponses change —
				// sinon un ancien objet serait rendu à du code qui ne l'attend
				// plus, et l'écran casserait sans requête réseau pour l'expliquer.
				buster: 'catalogue-v1',
				dehydrateOptions: {
					shouldDehydrateQuery: (query) =>
						query.state.status === 'success' &&
						CLES_PERSISTEES.has(String(query.queryKey[0])),
				},
			}}
		>
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
						{/* La synchronisation du catalogue vit ICI, et pas dans l'écran
						    qui la déclenche : quitter la page démontait le composant, et
						    la boucle de lots continuait en l'air sans que personne
						    n'affiche sa progression ni ses refus. Même endroit et même
						    raison que le temps réel ci-dessus. */}
						<SyncQueueProvider>
							<RouterProvider router={router} />
						</SyncQueueProvider>
						<Toaster richColors closeButton />
					</ActiveCompanyProvider>
				</AuthProvider>
			</AppPosSessionProvider>
		</PersistQueryClientProvider>
	</StrictMode>,
)
