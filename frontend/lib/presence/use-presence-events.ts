// frontend/lib/presence/use-presence-events.ts
// ═══════════════════════════════════════════════════════════════════════════
// HOOK SSE — ÉVÉNEMENTS TEMPS RÉEL INTER-CLIENTS
// ═══════════════════════════════════════════════════════════════════════════
//
// Ouvre une connexion SSE persistante sur GET /api/presence/events.
// Dispatch les événements reçus :
//
//   "message"    → notification persistante (useNotifications) + toast
//   "task"       → toast persistant avec bouton accusé de réception
//   "invalidate" → queryClient.invalidateQueries({ queryKey: [...] })
//   "connected"  → log silencieux (confirmation de connexion)
//
// Reconnexion automatique exponentielle (1s → 2s → 4s → max 30s).
// Le hook est idempotent : appelez-le une seule fois dans Layout.
// ═══════════════════════════════════════════════════════════════════════════

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

// import { useNotifications } from '@/lib/notifications'
import { isWails } from '@/lib/wails-bridge'
import PocketBase from 'pocketbase'

// Dans Wails, window.location.origin = wails.localhost:34115 (proxy UI)
// Le serveur PocketBase tourne toujours sur 127.0.0.1:8090
// Les navigateurs distants accèdent via leur propre origine (ex: 192.168.1.10:8090)
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

import type { AppNotification } from '@/lib/notifications'

// ─── Types ──────────────────────────────────────────────────────────────────

export type SSEEventType = 'message' | 'task' | 'invalidate' | 'connected'

export interface SSEFrom {
	userId: string
	name: string
	role: string
}

export interface SSEMessagePayload {
	from: SSEFrom
	payload: { text: string }
}

export interface SSETaskPayload {
	from: SSEFrom
	payload: { text: string }
}

export interface SSEInvalidatePayload {
	from: SSEFrom
	payload: { queryKey: unknown[] }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UsePresenceEventsOptions {
	/** Activer le hook (false pendant le setup, logout, etc.) */
	enabled?: boolean
	/** Callback appelé quand une notification SSE arrive — pour upsert dans le state React */
	onNotification?: (notif: AppNotification) => void
}

export function usePresenceEvents({
	enabled = true,
	onNotification,
}: UsePresenceEventsOptions = {}) {
	const queryClient = useQueryClient()

	const onNotifRef = useRef(onNotification)
	useEffect(() => {
		onNotifRef.current = onNotification
	}, [onNotification])

	const retryDelay = useRef(1000)
	const esRef = useRef<EventSource | null>(null)
	const stopRef = useRef(false)

	useEffect(() => {
		if (!enabled) return

		stopRef.current = false

		function connect() {
			if (stopRef.current) return

			const token = pb.authStore.token
			if (!token) {
				// Pas encore authentifié — réessayer dans 2s
				window.setTimeout(connect, 2000)
				return
			}

			// EventSource ne supporte pas les headers custom → on passe le token en QS
			// (le backend PocketBase accepte ?token= comme fallback)
			const url = `${pb.baseUrl}/api/presence/events?token=${encodeURIComponent(token)}`
			const es = new EventSource(url)
			esRef.current = es

			// ── Connexion confirmée ────────────────────────────────────────
			es.addEventListener('connected', () => {
				retryDelay.current = 1000 // reset du backoff
				console.log('[SSE] connected')
			})

			// ── Message d'un autre client ──────────────────────────────────
			es.addEventListener('message', (e) => {
				try {
					const data = JSON.parse(e.data) as SSEMessagePayload

					// 1. Notification persistante dans la cloche
					const notif: AppNotification = {
						id: `sse:msg:${Date.now()}`,
						type: 'message',
						title: data.from?.name ?? 'Message',
						text: data.payload?.text ?? '',
						unread: true,
						createdAt: Date.now(),
						meta: { from: data.from },
					}
					// Upsert direct via callback (Layout → useNotifications)
					if (onNotifRef.current) {
						onNotifRef.current(notif)
					} else {
						// Fallback : localStorage + events
						const STORAGE_KEY = 'app_notifications_v1'
						const cur = safeParseNotifications(
							localStorage.getItem(STORAGE_KEY),
						)
						localStorage.setItem(STORAGE_KEY, JSON.stringify([notif, ...cur]))
						window.dispatchEvent(
							new CustomEvent('app:notification', { detail: notif }),
						)
						window.dispatchEvent(
							new StorageEvent('storage', { key: STORAGE_KEY }),
						)
					}

					toast.info(`💬 ${data.from?.name ?? "Quelqu'un"}`, {
						description: data.payload?.text,
						duration: 6000,
					})
				} catch (err) {
					console.warn('[SSE] message parse error', err)
				}
			})

			// ── Tâche assignée ─────────────────────────────────────────────
			es.addEventListener('task', (e) => {
				try {
					const data = JSON.parse(e.data) as SSETaskPayload

					toast.warning(`📋 Tâche de ${data.from?.name ?? "quelqu'un"}`, {
						description: data.payload?.text,
						duration: Number.POSITIVE_INFINITY, // persistant jusqu'à interaction
						action: {
							label: 'Accusé de réception',
							onClick: () => {
								// Broadcast de confirmation (best-effort)
								broadcastAck(data.from?.userId)
							},
						},
					})
				} catch (err) {
					console.warn('[SSE] task parse error', err)
				}
			})

			// ── Invalidation de cache ──────────────────────────────────────
			es.addEventListener('invalidate', (e) => {
				try {
					const data = JSON.parse(e.data) as SSEInvalidatePayload
					const queryKey = data.payload?.queryKey
					if (Array.isArray(queryKey)) {
						queryClient.invalidateQueries({ queryKey })
						console.log('[SSE] invalidate', queryKey)
					}
				} catch (err) {
					console.warn('[SSE] invalidate parse error', err)
				}
			})

			// ── Erreur / reconnexion ───────────────────────────────────────
			es.onerror = () => {
				es.close()
				esRef.current = null
				if (stopRef.current) return

				console.warn(`[SSE] disconnected — retry in ${retryDelay.current}ms`)
				window.setTimeout(() => {
					if (!stopRef.current) connect()
				}, retryDelay.current)

				// Backoff exponentiel plafonné à 30s
				retryDelay.current = Math.min(retryDelay.current * 2, 30_000)
			}
		}

		connect()

		return () => {
			stopRef.current = true
			esRef.current?.close()
			esRef.current = null
		}
	}, [enabled, queryClient])
}

// ─── Utilitaires internes ─────────────────────────────────────────────────────

function safeParseNotifications(raw: string | null): AppNotification[] {
	if (!raw) return []
	try {
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

/** Envoie un accusé de réception silencieux à l'expéditeur d'une tâche */
async function broadcastAck(targetUserId?: string) {
	if (!targetUserId) return
	try {
		const token = pb.authStore.token
		if (!token) return
		await fetch(`${pb.baseUrl}/api/presence/broadcast`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				type: 'message',
				targetUserId,
				from: {
					userId: pb.authStore.model?.id ?? '',
					name: pb.authStore.model?.name ?? '',
					role: pb.authStore.model?.role ?? '',
				},
				payload: { text: '✅ Tâche reçue et prise en compte.' },
			}),
		})
	} catch {
		// silencieux
	}
}
