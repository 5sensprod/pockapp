// frontend/lib/presence/broadcast.ts
// ═══════════════════════════════════════════════════════════════════════════
// HELPER BROADCAST
// ═══════════════════════════════════════════════════════════════════════════
//
// Utilisé par :
//   - ActionModal (handleSend) pour les messages/tâches manuels
//   - Les mutations TanStack Query pour les invalidations automatiques
//
// Exemple d'injection dans une mutation :
//
//   const mutation = useMutation({
//     mutationFn: saveInvoice,
//     onSuccess: () => {
//       broadcastInvalidate(['invoices'])
//     },
//   })
// ═══════════════════════════════════════════════════════════════════════════

import { isWails } from '@/lib/wails-bridge'
import PocketBase from 'pocketbase'

function getPocketBaseUrl(): string {
	if (isWails()) return 'http://127.0.0.1:8090'
	return window.location.origin
}

function getPb(): PocketBase {
	if ((window as any).__pb) return (window as any).__pb
	const pb = new PocketBase(getPocketBaseUrl())
	const raw = localStorage.getItem('pocketbase_auth')
	if (raw) {
		try {
			const { token, model } = JSON.parse(raw)
			pb.authStore.save(token, model)
		} catch {
			/* ignore */
		}
	}
	return pb
}

const pb = getPb()

// ─── Types ──────────────────────────────────────────────────────────────────

interface BroadcastFrom {
	userId: string
	name: string
	role: string
}

interface BroadcastOptions {
	/** null = tous les clients connectés */
	targetUserId?: string | null
}

// ─── Helpers internes ────────────────────────────────────────────────────────

function currentUser(): BroadcastFrom {
	return {
		userId: pb.authStore.model?.id ?? '',
		name: pb.authStore.model?.name ?? '',
		role: pb.authStore.model?.role ?? '',
	}
}

async function broadcast(body: object): Promise<void> {
	const token = pb.authStore.token
	if (!token) return

	try {
		const res = await fetch(`${pb.baseUrl}/api/presence/broadcast`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(body),
		})
		if (!res.ok) {
			console.warn('[broadcast] HTTP', res.status)
		}
	} catch (err) {
		// Ne jamais faire planter l'appelant à cause du broadcast
		console.warn('[broadcast] error', err)
	}
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Envoie un message texte à un utilisateur (ou à tous si targetUserId omis).
 * Utilisé par ActionModal pour les messages manuels.
 */
export async function broadcastMessage(
	text: string,
	{ targetUserId = null }: BroadcastOptions = {},
): Promise<void> {
	await broadcast({
		type: 'message',
		targetUserId,
		from: currentUser(),
		payload: { text },
	})
}

/**
 * Envoie une tâche (toast persistant + accusé de réception) à un utilisateur.
 * Utilisé par ActionModal pour les tâches manuelles.
 */
export async function broadcastTask(
	text: string,
	{ targetUserId = null }: BroadcastOptions = {},
): Promise<void> {
	await broadcast({
		type: 'task',
		targetUserId,
		from: currentUser(),
		payload: { text },
	})
}

/**
 * Demande à tous les clients (ou un seul) d'invalider une query TanStack.
 *
 * @example
 * // Après un encaissement
 * broadcastInvalidate(['invoices'])
 * broadcastInvalidate(['pos', 'orders'])
 */
export async function broadcastInvalidate(
	queryKey: unknown[],
	{ targetUserId = null }: BroadcastOptions = {},
): Promise<void> {
	await broadcast({
		type: 'invalidate',
		targetUserId,
		from: currentUser(),
		payload: { queryKey },
	})
}
