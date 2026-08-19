// frontend/lib/realtime/CatalogRealtimeMount.tsx
//
// Le point de montage, isolé pour lire `useAuth` : l'abonnement ne doit
// s'ouvrir qu'une fois connecté, et se rouvrir si la session change.

import { useCatalogRealtime } from '@/lib/realtime/use-catalog-realtime'
import { useAuth } from '@/modules/auth/AuthProvider'

export function CatalogRealtimeMount() {
	const { isAuthenticated } = useAuth()
	useCatalogRealtime(isAuthenticated)
	return null
}
