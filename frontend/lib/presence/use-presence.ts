import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'
// frontend/lib/presence/use-presence.ts
import { useCallback, useEffect, useRef } from 'react'

function generateId(): string {
	// N'utilise PAS crypto.randomUUID() — indisponible sur HTTP en réseau local
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
}

function getOrCreateSessionId(): string {
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
	const sessionId = getOrCreateSessionId()
	const isDesktop = typeof (window as any).runtime !== 'undefined'
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const ping = useCallback(async () => {
		if (!pb.authStore.isValid) return
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
	}, [pb, sessionId])

	const leave = useCallback(async () => {
		if (!pb.authStore.token) return
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
	}, [pb, sessionId])

	useEffect(() => {
		// S'abonner aux changements d'auth — démarre/arrête le ping selon l'état
		const unsubscribe = pb.authStore.onChange((_token: string, model: any) => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current)
				intervalRef.current = null
			}

			if (model) {
				// Vient de se connecter → ping immédiat + interval
				ping()
				intervalRef.current = setInterval(ping, 30_000)
			} else {
				// Vient de se déconnecter → retrait immédiat
				leave()
			}
		})

		// Si déjà authentifié au montage (token persisté)
		if (pb.authStore.isValid) {
			ping()
			intervalRef.current = setInterval(ping, 30_000)
		}

		window.addEventListener('beforeunload', leave)

		return () => {
			unsubscribe()
			if (intervalRef.current) clearInterval(intervalRef.current)
			window.removeEventListener('beforeunload', leave)
		}
	}, [ping, leave, pb])
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
