import { CheckForUpdates } from '@/wailsjs/go/main/App'
// frontend/lib/notifications.ts
import { useEffect, useMemo, useState } from 'react'

export type AppNotificationType = 'update'

export type AppNotification = {
	id: string
	type: AppNotificationType
	title: string
	text: string
	unread: boolean
	createdAt: number
	meta?: Record<string, unknown>
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

		const key = 'update_check_started_session'
		if (sessionStorage.getItem(key) === '1') return
		sessionStorage.setItem(key, '1')

		let stopped = false

		const run = async () => {
			try {
				const info = await CheckForUpdates()
				if (stopped) return

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
			} catch {
				// silent
			}
		}

		const first = window.setTimeout(run, 10_000)

		// ✅ 5 minutes (test)
		const interval = window.setInterval(run, 5 * 60 * 1000)

		return () => {
			stopped = true
			window.clearTimeout(first)
			window.clearInterval(interval)
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
				const next = markAllRead(loadNotifications())
				saveNotifications(next)
				setItems(next)
			},
			markRead: (id: string) => {
				const next = markRead(loadNotifications(), id)
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
