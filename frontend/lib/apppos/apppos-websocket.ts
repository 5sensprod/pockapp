// frontend/lib/apppos/apppos-websocket.ts

import { getAppPosApiBaseUrl } from './apppos-config'
import type { AppPosProduct } from './apppos-types'

export type AppPosProductsUpdatedPayload = {
	entityId: string
	data: AppPosProduct
}

export type AppPosWebSocketEvent =
	| { type: 'products.updated'; data: AppPosProductsUpdatedPayload }
	| { type: 'products.created'; data: AppPosProductsUpdatedPayload }
	| { type: 'products.deleted'; data: { entityId: string } }
	| { type: 'stock.updated'; data: { productId: string; newStock: number } }
	| { type: 'server.time.update'; data: { timestamp: number; iso: string } }
	| { type: 'connection.opened'; data: { clientId: string } }
	| { type: 'connection.closed'; data: { reason: string } }

export type AppPosWebSocketCallback = (event: AppPosWebSocketEvent) => void

class AppPosWebSocketManager {
	private ws: WebSocket | null = null
	private callbacks = new Set<AppPosWebSocketCallback>()
	private isManualClose = false

	private reconnectTimer: number | null = null
	private reconnectAttempts = 0
	private maxReconnectAttempts = 5
	private reconnectDelay = 3000

	connect() {
		if (this.ws?.readyState === WebSocket.OPEN) {
			console.log('📡 [AppPOS WS] Déjà connecté')
			return
		}

		const httpBase = getAppPosApiBaseUrl().replace(/\/+$/, '')
		const wsBase = httpBase
			.replace(/^http:\/\//, 'ws://')
			.replace(/^https:\/\//, 'wss://')

		// ✅ backend: new WebSocket.Server({ server }) => endpoint "/"
		const wsEndpoint = wsBase.replace(/\/api$/, '')

		console.log('📡 [AppPOS WS] Connexion à', wsEndpoint)
		this.isManualClose = false
		this.ws = new WebSocket(wsEndpoint)

		this.ws.onopen = () => {
			console.log('✅ [AppPOS WS] Connecté')
			this.reconnectAttempts = 0

			this.notifyCallbacks({
				type: 'connection.opened',
				data: { clientId: this.generateClientId() },
			})

			// ✅ obligatoire pour recevoir products.*
			this.ws?.send(
				JSON.stringify({
					type: 'subscribe',
					payload: { entityType: 'products' },
				}),
			)
			console.log('📩 [AppPOS WS] subscribe(products) envoyé')
		}

		this.ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data)
				console.log('📨 [AppPOS WS] Reçu:', message)

				const type = message?.type as string | undefined
				const payload = message?.payload

				if (!type) return

				// ── Mise à jour produit ──────────────────────────────────────
				if (type === 'products.updated' && payload) {
					const data = payload as AppPosProductsUpdatedPayload
					this.notifyCallbacks({ type: 'products.updated', data })

					// Event synthétique stock.updated pour rétrocompatibilité
					const p = data?.data
					if (p?._id && typeof p.stock === 'number') {
						this.notifyCallbacks({
							type: 'stock.updated',
							data: { productId: p._id, newStock: p.stock },
						})
					}
					return
				}

				// ── Création produit ─────────────────────────────────────────
				if (type === 'products.created' && payload) {
					this.notifyCallbacks({
						type: 'products.created',
						data: payload as AppPosProductsUpdatedPayload,
					})
					return
				}

				// ── Suppression produit ──────────────────────────────────────
				if (type === 'products.deleted' && payload) {
					this.notifyCallbacks({
						type: 'products.deleted',
						data: { entityId: payload.entityId ?? payload._id ?? payload.id },
					})
					return
				}

				// ── Heure serveur ────────────────────────────────────────────
				if (type === 'server.time.update' && payload) {
					this.notifyCallbacks({ type: 'server.time.update', data: payload })
				}
			} catch (e) {
				console.error('❌ [AppPOS WS] Parse error:', e)
			}
		}

		this.ws.onerror = (e) => {
			console.error('❌ [AppPOS WS] Erreur:', e)
		}

		this.ws.onclose = (event) => {
			console.log('🔌 [AppPOS WS] Déconnecté', event.code, event.reason)
			this.ws = null

			this.notifyCallbacks({
				type: 'connection.closed',
				data: { reason: event.reason || 'Connection closed' },
			})

			if (
				!this.isManualClose &&
				this.reconnectAttempts < this.maxReconnectAttempts
			) {
				this.scheduleReconnect()
			}
		}
	}

	disconnect() {
		console.log('🔌 [AppPOS WS] Déconnexion manuelle')
		this.isManualClose = true

		if (this.reconnectTimer) {
			window.clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}

		this.ws?.close()
		this.ws = null
	}

	subscribe(callback: AppPosWebSocketCallback) {
		this.callbacks.add(callback)
		return () => this.callbacks.delete(callback)
	}

	private notifyCallbacks(event: AppPosWebSocketEvent) {
		for (const cb of this.callbacks) {
			try {
				cb(event)
			} catch (e) {
				console.error('❌ [AppPOS WS] Erreur callback:', e)
			}
		}
	}

	private scheduleReconnect() {
		this.reconnectAttempts++
		const delay = this.reconnectDelay * this.reconnectAttempts

		console.log(
			`🔄 [AppPOS WS] Reconnexion dans ${delay}ms (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
		)

		this.reconnectTimer = window.setTimeout(() => this.connect(), delay)
	}

	private generateClientId() {
		return `client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
	}

	isConnected() {
		return this.ws?.readyState === WebSocket.OPEN
	}
}

export const appPosWebSocket = new AppPosWebSocketManager()
