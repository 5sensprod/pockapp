// frontend/lib/apppos/apppos-websocket.ts

import { getAppPosApiBaseUrl } from './apppos-config'
import type { AppPosProduct } from './apppos-types'

// ─── Payloads ────────────────────────────────────────────────────────────────

export type AppPosProductEventSource =
	| 'sale' // vente POS (/decrement-stock)
	| 'return' // retour client (/increment-stock)
	| 'manual_adjustment' // ajustement manuel stock
	| 'update' // modification produit classique

export type AppPosProductsUpdatedPayload = {
	entityId: string // = _id NeDB brut (string)
	data: AppPosProduct
	/** Source de la mise à jour — présente seulement si émise via entityUpdatedWithSource */
	source?: AppPosProductEventSource
}

export type AppPosWebSocketEvent =
	// ── Produits ──────────────────────────────────────────────────────────────
	| { type: 'products.updated'; data: AppPosProductsUpdatedPayload }
	| { type: 'products.created'; data: AppPosProductsUpdatedPayload }
	| { type: 'products.deleted'; data: { entityId: string } }
	// NB: stock.updated synthétique SUPPRIMÉ — products.updated suffit (évite le double-patch)

	// ── Catégories / fournisseurs ─────────────────────────────────────────────
	| { type: 'categories.tree.changed'; data: { timestamp: number } }
	| { type: 'suppliers.tree.changed'; data: { timestamp: number } }

	// ── Stats & charts ────────────────────────────────────────────────────────
	| {
			type: 'stock.statistics.changed'
			data: { data: unknown; timestamp: number }
	  }
	| {
			type: 'category.chart.updated'
			data: { data: unknown; timestamp: number }
	  }

	// ── Session caisse ────────────────────────────────────────────────────────
	| {
			type: 'cashier_session.status.changed'
			data: {
				cashier_id: string
				username: string
				session: {
					status: string
					startTime: string
					endTime: string | null
					duration: number | null
					sales_count: number
					total_sales: number
					lcd_connected: boolean
					lcd_port: string | null
				}
				timestamp: number
			}
	  }
	| {
			type: 'cashier_session.stats.updated'
			data: {
				cashier_id: string
				username: string
				stats: {
					sales_count: number
					total_sales: number
					last_sale_at: string | null
				}
				timestamp: number
			}
	  }

	// ── Tiroir caisse ─────────────────────────────────────────────────────────
	| {
			type: 'cashier_drawer.movement.added'
			data: {
				cashier_id: string
				movement: {
					id: string
					type: 'in' | 'out'
					amount: number
					reason: string
					notes: string
					created_at: string
					created_by: string
				}
				new_balance: number
				timestamp: number
			}
	  }
	| {
			type: 'cashier_drawer.status.changed'
			data: {
				cashier_id: string
				drawer_status: string
				current_amount: number
				expected_amount: number
				variance: number
				timestamp: number
			}
	  }

	// ── LCD ───────────────────────────────────────────────────────────────────
	| {
			type: 'lcd.ownership.changed'
			data: {
				owned: boolean
				owner: {
					cashier_id: string
					username: string
					port: string
					startTime: string
				} | null
				previous_owner: { cashier_id: string; username: string } | null
				timestamp: number
			}
	  }
	| {
			type: 'lcd.connection.lost'
			data: { port: string; owner: unknown; error: string; timestamp: number }
	  }
	| {
			type: 'lcd.connection.restored'
			data: { port: string; owner: unknown; timestamp: number }
	  }
	| {
			type: 'lcd.connection.failed'
			data: {
				port: string
				owner: unknown
				attempts: number
				timestamp: number
			}
	  }

	// ── Système ───────────────────────────────────────────────────────────────
	| { type: 'server.time.update'; data: { timestamp: number; iso: string } }
	| { type: 'connection.opened'; data: { clientId: string } }
	| { type: 'connection.closed'; data: { reason: string } }

export type AppPosWebSocketCallback = (event: AppPosWebSocketEvent) => void

// ─── Manager ─────────────────────────────────────────────────────────────────

class AppPosWebSocketManager {
	private ws: WebSocket | null = null
	private callbacks = new Set<AppPosWebSocketCallback>()
	private isManualClose = false

	private reconnectTimer: number | null = null
	private reconnectAttempts = 0
	private readonly maxReconnectAttempts = 5
	private readonly reconnectDelay = 3000

	connect() {
		if (this.ws?.readyState === WebSocket.OPEN) {
			console.log('📡 [AppPOS WS] Déjà connecté')
			return
		}

		const httpBase = getAppPosApiBaseUrl().replace(/\/+$/, '')
		const wsBase = httpBase
			.replace(/^http:\/\//, 'ws://')
			.replace(/^https:\/\//, 'wss://')

		// backend: new WebSocket.Server({ server }) => endpoint à la racine
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
			// S'abonner aux produits (requis par websocketManager.broadcast)
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
				const message = JSON.parse(event.data as string) as {
					type?: string
					payload?: unknown
				}
				const type = message?.type
				const payload = message?.payload

				if (!type) return

				// ── Produits ──────────────────────────────────────────────────
				if (type === 'products.updated' && payload) {
					// Pas de stock.updated synthétique — products.updated contient déjà tout
					this.notifyCallbacks({
						type: 'products.updated',
						data: payload as AppPosProductsUpdatedPayload,
					})
					return
				}

				if (type === 'products.created' && payload) {
					this.notifyCallbacks({
						type: 'products.created',
						data: payload as AppPosProductsUpdatedPayload,
					})
					return
				}

				if (type === 'products.deleted' && payload) {
					const p = payload as Record<string, unknown>
					this.notifyCallbacks({
						type: 'products.deleted',
						data: { entityId: String(p.entityId ?? p._id ?? p.id ?? '') },
					})
					return
				}

				// ── Catégories / fournisseurs ─────────────────────────────────
				if (type === 'categories.tree.changed') {
					this.notifyCallbacks({
						type: 'categories.tree.changed',
						data: { timestamp: Date.now() },
					})
					return
				}

				if (type === 'suppliers.tree.changed') {
					this.notifyCallbacks({
						type: 'suppliers.tree.changed',
						data: { timestamp: Date.now() },
					})
					return
				}

				// ── Stats ─────────────────────────────────────────────────────
				if (type === 'stock.statistics.changed' && payload) {
					this.notifyCallbacks({
						type: 'stock.statistics.changed',
						data: payload as { data: unknown; timestamp: number },
					})
					return
				}

				if (type === 'category.chart.updated' && payload) {
					this.notifyCallbacks({
						type: 'category.chart.updated',
						data: payload as { data: unknown; timestamp: number },
					})
					return
				}

				// ── Session caisse ────────────────────────────────────────────
				if (type === 'cashier_session.status.changed' && payload) {
					this.notifyCallbacks({ type, data: payload as any })
					return
				}
				if (type === 'cashier_session.stats.updated' && payload) {
					this.notifyCallbacks({ type, data: payload as any })
					return
				}

				// ── Tiroir caisse ─────────────────────────────────────────────
				if (type === 'cashier_drawer.movement.added' && payload) {
					this.notifyCallbacks({ type, data: payload as any })
					return
				}
				if (type === 'cashier_drawer.status.changed' && payload) {
					this.notifyCallbacks({ type, data: payload as any })
					return
				}

				// ── LCD ───────────────────────────────────────────────────────
				if (
					(type === 'lcd.ownership.changed' ||
						type === 'lcd.connection.lost' ||
						type === 'lcd.connection.restored' ||
						type === 'lcd.connection.failed') &&
					payload
				) {
					this.notifyCallbacks({ type, data: payload as any })
					return
				}

				// ── Heure serveur ─────────────────────────────────────────────
				if (type === 'server.time.update' && payload) {
					this.notifyCallbacks({
						type: 'server.time.update',
						data: payload as { timestamp: number; iso: string },
					})
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

	isConnected() {
		return this.ws?.readyState === WebSocket.OPEN
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
}

export const appPosWebSocket = new AppPosWebSocketManager()
