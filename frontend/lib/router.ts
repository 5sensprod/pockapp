// frontend/lib/router.ts
//
// L'instance de routeur, sortie de `main.tsx` le 26 août 2026.
//
// Raison unique : la file de synchronisation (`frontend/lib/sync/`) est montée
// À CÔTÉ de `<RouterProvider>`, pas dedans — comme `CatalogRealtimeMount`, et
// pour la même raison : elle doit vivre quelle que soit la route. Elle n'a donc
// aucun `useNavigate` à sa disposition, et son toast doit pouvoir renvoyer vers
// l'écran du catalogue. Un `window.location.assign` ferait un rechargement
// complet, et `main.tsx` efface la session PocketBase au démarrage : la
// navigation déconnecterait l'utilisateur.

import { createRouter } from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
