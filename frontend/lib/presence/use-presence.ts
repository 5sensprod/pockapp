import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'

import { usePocketBase } from '@/lib/use-pocketbase'

function generateId(): string {
	// N'utilise PAS crypto.randomUUID() — indisponible sur HTTP en réseau local
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
}

function getOrCreateSessionId(): string | null {
	if (typeof window === 'undefined') return null

	let id = sessionStorage.getItem('presence_session_id')

	if (!id) {
		id = generateId()
		sessionStorage.setItem('presence_session_id', id)
	}

	return id
}

// ── Hook client : envoie les pings ──────────────────────────────────────────
// ⚠️ Pas de useAuth ici — appelé depuis AuthProvider, le contexte n'existe pas encore.
//    On lit pb.authStore directement.
export function usePresencePing() {
	const pb = usePocketBase()
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const sessionIdRef = useRef<string | null>(null)

	const getSessionId = useCallback(() => {
		if (!sessionIdRef.current) {
			sessionIdRef.current = getOrCreateSessionId()
		}

		return sessionIdRef.current
	}, [])

	const isDesktop =
		typeof window !== 'undefined' &&
		typeof (window as any).runtime !== 'undefined'

	const ping = useCallback(async () => {
		const sessionId = getSessionId()

		if (!sessionId || !pb.authStore.isValid) return

		try {
			await fetch('/api/presence/ping', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: pb.authStore.token,
				},
				body: JSON.stringify({ sessionId, isDesktop }),
			})
		} catch {
			// silencieux — non bloquant
		}
	}, [pb, getSessionId, isDesktop])

	const leave = useCallback(async () => {
		const sessionId = getSessionId()

		if (!sessionId || !pb.authStore.token) return

		try {
			await fetch('/api/presence/ping', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					Authorization: pb.authStore.token,
				},
				body: JSON.stringify({ sessionId }),
			})
		} catch {
			// silencieux
		}
	}, [pb, getSessionId])

	useEffect(() => {
		const clearPingInterval = () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current)
				intervalRef.current = null
			}
		}

		const startPingInterval = () => {
			clearPingInterval()

			void ping()
			intervalRef.current = setInterval(() => {
				void ping()
			}, 30_000)
		}

		const unsubscribe = pb.authStore.onChange((_token: string, model: any) => {
			if (model) {
				startPingInterval()
			} else {
				clearPingInterval()
				void leave()
			}
		})

		if (pb.authStore.isValid) {
			startPingInterval()
		}

		window.addEventListener('beforeunload', leave)

		return () => {
			unsubscribe()
			clearPingInterval()
			window.removeEventListener('beforeunload', leave)
		}
	}, [pb, ping, leave])
}

// ── Hook admin : lit la liste des sessions ──────────────────────────────────
export interface PresenceSession {
	sessionId: string
	userId: string
	name: string
	email: string
	role: string
	ip: string
	userAgent: string
	lastSeen: string
	connectedAt: string
	secondsAgo: number
	isDesktop: boolean
}

export function usePresenceSessions(enabled: boolean) {
	const pb = usePocketBase()

	return useQuery<PresenceSession[]>({
		queryKey: ['presence-sessions'],
		queryFn: async () => {
			const res = await fetch('/api/presence/sessions', {
				headers: { Authorization: pb.authStore.token },
			})

			if (!res.ok) throw new Error('Erreur récupération présence')

			return res.json()
		},
		enabled,
		refetchInterval: 10_000,
		staleTime: 0,
	})
}
