import {
	isWails,
	tryWails,
	tryWailsSub,
	tryWailsVoid,
} from '@/lib/wails-bridge'
// frontend/lib/notifications.ts
import {
	CheckForUpdates,
	MarkRemoteNotificationRead,
} from '@/wailsjs/go/main/App'
import { EventsOn } from '@/wailsjs/runtime/runtime'
import { useEffect, useMemo, useRef, useState } from 'react'

export type AppNotificationType =
	| 'update'
	| 'info'
	| 'warning'
	| 'quota'
	| 'message'

export type AppNotification = {
	id: string
	type: AppNotificationType
	title: string
	text: string
	unread: boolean
	createdAt: number
	meta?: Record<string, unknown>
	remote?: boolean
	remoteId?: number
}

const STORAGE_KEY = 'app_notifications_v1'

function safeParse<T>(raw: string | null): T | null {
	if (!raw) return null
	try {
		return JSON.parse(raw) as T
	} catch {
		return null
	}
}

function loadNotifications(): AppNotification[] {
	const data = safeParse<AppNotification[]>(localStorage.getItem(STORAGE_KEY))
	return Array.isArray(data) ? data : []
}

function saveNotifications(items: AppNotification[]) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function upsert(items: AppNotification[], n: AppNotification) {
	const idx = items.findIndex((x) => x.id === n.id)
	if (idx === -1) return [n, ...items]
	const next = items.slice()
	next[idx] = n
	return next
}

function markAllRead(items: AppNotification[]) {
	return items.map((n) => ({ ...n, unread: false }))
}

function markRead(items: AppNotification[], id: string) {
	return items.map((n) => (n.id === id ? { ...n, unread: false } : n))
}

export function useNotifications(opts?: { enabled?: boolean }) {
	const enabled = opts?.enabled ?? true
	const [items, setItems] = useState<AppNotification[]>(() =>
		loadNotifications(),
	)

	const remoteSubStarted = useRef(false)

	useEffect(() => {
		if (!enabled) return
		const onStorage = (e: StorageEvent) => {
			if (e.key === STORAGE_KEY) setItems(loadNotifications())
		}
		window.addEventListener('storage', onStorage)
		return () => window.removeEventListener('storage', onStorage)
	}, [enabled])

	useEffect(() => {
		if (!enabled) return
		if (!isWails()) return

		const key = 'update_check_started_session'
		if (sessionStorage.getItem(key) === '1') return
		sessionStorage.setItem(key, '1')

		let stopped = false

		const run = async () => {
			const info = await tryWails<any>(() => CheckForUpdates(), null as any)
			if (stopped || !info) return

			if (info?.available) {
				const version = String(info.version || '')
				const id = `update:${version}`

				const notif: AppNotification = {
					id,
					type: 'update',
					title: 'Mise à jour disponible',
					text: `Version ${version} disponible. Cliquez pour installer.`,
					unread: true,
					createdAt: Date.now(),
					meta: info as unknown as Record<string, unknown>,
				}

				const current = loadNotifications()
				const next = upsert(current, notif)
				saveNotifications(next)
				setItems(next)
			}
		}

		const first = window.setTimeout(() => {
			tryWailsVoid(run)
		}, 10_000)
		const interval = window.setInterval(
			() => {
				tryWailsVoid(run)
			},
			60 * 60 * 1000,
		)

		return () => {
			stopped = true
			window.clearTimeout(first)
			window.clearInterval(interval)
		}
	}, [enabled])

	useEffect(() => {
		if (!enabled) return
		if (!isWails()) return
		if (remoteSubStarted.current) return
		remoteSubStarted.current = true

		const unsub = tryWailsSub(() =>
			EventsOn(
				'remote:notification',
				(data: {
					id: number
					type: string
					title: string
					message: string
					meta?: Record<string, unknown>
					createdAt: string
				}) => {
					const id = `remote:${data.id}`

					const createdAt = Number.isFinite(Date.parse(data.createdAt))
						? new Date(data.createdAt).getTime()
						: Date.now()

					const notif: AppNotification = {
						id,
						type: (data.type as AppNotificationType) || 'info',
						title: data.title || 'Notification',
						text: data.message || '',
						unread: true,
						createdAt,
						meta: data.meta,
						remote: true,
						remoteId: data.id,
					}

					const current = loadNotifications()
					if (current.some((n) => n.id === id)) return

					const next = upsert(current, notif)
					saveNotifications(next)
					setItems(next)
				},
			),
		)

		return () => {
			remoteSubStarted.current = false
			unsub()
		}
	}, [enabled])

	const unreadCount = useMemo(
		() => items.reduce((acc, n) => acc + (n.unread ? 1 : 0), 0),
		[items],
	)

	const api = useMemo(
		() => ({
			items,
			unreadCount,
			markAllRead: () => {
				const current = loadNotifications()

				for (const n of current) {
					if (!n.unread) continue
					if (n.remote !== true) continue

					const remoteId = n.remoteId
					if (remoteId === undefined) continue

					tryWailsVoid(() => MarkRemoteNotificationRead(remoteId))
				}

				const next = markAllRead(current)
				saveNotifications(next)
				setItems(next)
			},
			markRead: (id: string) => {
				const current = loadNotifications()
				const notif = current.find((n) => n.id === id)

				if (notif?.remote === true) {
					const remoteId = notif.remoteId
					if (remoteId !== undefined) {
						tryWailsVoid(() => MarkRemoteNotificationRead(remoteId))
					}
				}

				const next = markRead(current, id)
				saveNotifications(next)
				setItems(next)
			},
			clear: () => {
				saveNotifications([])
				setItems([])
			},
		}),
		[items, unreadCount],
	)

	return api
}
