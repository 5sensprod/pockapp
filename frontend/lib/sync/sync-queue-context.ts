// frontend/lib/sync/sync-queue-context.ts
//
// Le contexte seul, dans son propre fichier : le provider exporte un
// composant, et mêler les deux fait perdre l'état à chaque Fast Refresh.

import { createContext, useContext } from 'react'
import { ETAT_INITIAL, type SyncQueueValue } from './sync-queue.types'

/**
 * Valeur par défaut NEUTRE plutôt qu'`undefined` : un écran monté hors du
 * provider — un test, une story — doit rendre, pas exploser. `enqueue` ne fait
 * alors rien et le dit dans la console ; c'est visible sans être fatal.
 */
export const SyncQueueContext = createContext<SyncQueueValue>({
	etat: ETAT_INITIAL,
	actif: false,
	enqueue: () => {
		console.warn('[sync] enqueue hors SyncQueueProvider : ignoré.')
	},
	annuler: () => {},
})

export function useSyncQueue(): SyncQueueValue {
	return useContext(SyncQueueContext)
}
