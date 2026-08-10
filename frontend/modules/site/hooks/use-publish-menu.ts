// frontend/modules/site/hooks/use-publish-menu.ts
// ═══════════════════════════════════════════════════════════════════════════
// PUBLICATION DU MENU  (ticket 6)
// ═══════════════════════════════════════════════════════════════════════════
// Envoie le document composé à la couche Go, qui y ajoute la clé X-API-Key et
// le poste au serveur mutualisé.
//
// **La clé ne passe pas par ici.** Ce hook ne la lit pas, ne la connaît pas, et
// aucune route ne la rend lisible. Voir docs/DECISIONS.md, bloc « Clé de
// publication dédiée… ».
// ═══════════════════════════════════════════════════════════════════════════

import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation } from '@tanstack/react-query'
import type { PublishedMenuDocument } from '../lib/publish-menu'

/** Réponse de l'endpoint PHP en cas de succès (§ « Vérification » de
 *  server/README.md). */
export interface PublishSuccess {
	ok: true
	bytes: number
	items: number
	publishedAt: string
	receivedAt: string
}

/**
 * Refus de l'endpoint PHP. `errors` porte **toutes** les divergences trouvées,
 * pas seulement la première — c'est ce qu'il faut montrer à l'opérateur.
 */
export interface PublishRejection {
	ok: false
	error: string
	errors?: string[]
}

/** Échec côté PocketApp ou réseau : le document n'a jamais atteint le PHP. */
export class PublishTransportError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message)
		this.name = 'PublishTransportError'
	}
}

/** Refus du contrat par l'endpoint. Distinct du transport : ici le serveur a
 *  répondu, et il dit précisément quoi corriger. */
export class PublishRejected extends Error {
	constructor(
		message: string,
		readonly errors: string[],
	) {
		super(message)
		this.name = 'PublishRejected'
	}
}

export function usePublishMenu() {
	const pb = usePocketBase() as { authStore: { token: string } }

	return useMutation<PublishSuccess, Error, PublishedMenuDocument>({
		mutationFn: async (document) => {
			const token = pb.authStore.token
			if (!token) {
				throw new PublishTransportError('Non authentifié', 401)
			}

			const response = await fetch('/api/site/publish-menu', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: token,
				},
				body: JSON.stringify(document),
			})

			const raw = await response.text()
			let payload: unknown
			try {
				payload = JSON.parse(raw)
			} catch {
				throw new PublishTransportError(
					raw || `Erreur ${response.status}`,
					response.status,
				)
			}

			if (response.ok) {
				return payload as PublishSuccess
			}

			// 422 : l'endpoint PHP a refusé le document. On remonte la liste
			// entière plutôt que le seul message d'entête.
			const rejection = payload as PublishRejection & { errors?: string[] }
			if (rejection?.errors?.length) {
				throw new PublishRejected(
					rejection.error ?? 'Document refusé',
					rejection.errors,
				)
			}

			throw new PublishTransportError(
				rejection?.error ?? `Erreur ${response.status}`,
				response.status,
			)
		},
	})
}
