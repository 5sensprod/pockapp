// frontend/lib/apppos/apppos-websocket.ts
// Service WebSocket pour écouter les événements AppPOS en temps réel

import { APPPOS_API_BASE_URL } from './apppos-config'

// ============================================================================
// TYPES
// ============================================================================

export interface AppPosStockUpdateEvent {
	productId: string
	productName: string
	previousStock: number
	newStock: number
	quantityChanged: number
	timestamp: string
}

export type AppPosWebSocketEvent =
	| { type: 'stock.updated'; data: AppPosStockUpdateEvent }
	| { type: 'connection.opened'; data: { clientId: string } }
	| { type: 'connection.closed'; data: { reason: string } }

export type AppPosWebSocketCallback = (event: AppPosWebSocketEvent) => void

// ============================================================================
// WEBSOCKET MANAGER
// ============================================================================

class AppPosWebSocketManager {
	private ws: WebSocket | null = null
	private reconnectTimer: number | null = null
	private reconnectAttempts = 0
	private maxReconnectAttempts = 5
	private reconnectDelay = 3000
	private callbacks: Set<AppPosWebSocketCallback> = new Set()
	private isManualClose = false

	/**
	 * Connexion au WebSocket AppPOS
	 */
	connect() {
		if (this.ws?.readyState === WebSocket.OPEN) {
			console.log('📡 [AppPOS WS] Déjà connecté')
			return
		}

		try {
			// Construire l'URL WebSocket
			const wsUrl = APPPOS_API_BASE_URL.replace('http://', 'ws://').replace(
				'https://',
				'wss://',
			)
			const wsEndpoint = wsUrl.replace('/api', '/ws') // Adapter selon ton endpoint

			console.log('📡 [AppPOS WS] Connexion à', wsEndpoint)
			this.ws = new WebSocket(wsEndpoint)

			this.ws.onopen = () => {
				console.log('✅ [AppPOS WS] Connecté')
				this.reconnectAttempts = 0
				this.notifyCallbacks({
					type: 'connection.opened',
					data: { clientId: this.generateClientId() },
				})
			}

			this.ws.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data)
					console.log('📨 [AppPOS WS] Message reçu:', message)

					// Traiter les événements de stock
					if (message.type === 'stock.updated') {
						this.notifyCallbacks({
							type: 'stock.updated',
							data: message.payload, // ← Correction: payload au lieu de data
						})
					}
				} catch (error) {
					console.error('❌ [AppPOS WS] Erreur parsing message:', error)
				}
			}

			this.ws.onerror = (error) => {
				console.error('❌ [AppPOS WS] Erreur:', error)
			}

			this.ws.onclose = (event) => {
				console.log('🔌 [AppPOS WS] Déconnecté', event.code, event.reason)
				this.ws = null

				this.notifyCallbacks({
					type: 'connection.closed',
					data: { reason: event.reason || 'Connection closed' },
				})

				// Reconnecter automatiquement si pas une fermeture manuelle
				if (
					!this.isManualClose &&
					this.reconnectAttempts < this.maxReconnectAttempts
				) {
					this.scheduleReconnect()
				}
			}
		} catch (error) {
			console.error('❌ [AppPOS WS] Erreur connexion:', error)
		}
	}

	/**
	 * Déconnexion
	 */
	disconnect() {
		console.log('🔌 [AppPOS WS] Déconnexion manuelle')
		this.isManualClose = true

		if (this.reconnectTimer) {
			window.clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}

		if (this.ws) {
			this.ws.close()
			this.ws = null
		}
	}

	/**
	 * Planifier une reconnexion
	 */
	private scheduleReconnect() {
		this.reconnectAttempts++
		const delay = this.reconnectDelay * this.reconnectAttempts

		console.log(
			`🔄 [AppPOS WS] Reconnexion dans ${delay}ms (tentative ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
		)

		this.reconnectTimer = window.setTimeout(() => {
			this.connect()
		}, delay)
	}

	/**
	 * S'abonner aux événements
	 */
	subscribe(callback: AppPosWebSocketCallback) {
		this.callbacks.add(callback)

		// Retourner une fonction de désabonnement
		return () => {
			this.callbacks.delete(callback)
		}
	}

	/**
	 * Notifier tous les callbacks
	 */
	private notifyCallbacks(event: AppPosWebSocketEvent) {
		for (const callback of this.callbacks) {
			try {
				callback(event)
			} catch (error) {
				console.error('❌ [AppPOS WS] Erreur callback:', error)
			}
		}
	}

	/**
	 * Générer un ID client unique
	 */
	private generateClientId() {
		return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
	}

	/**
	 * Vérifier si connecté
	 */
	isConnected() {
		return this.ws?.readyState === WebSocket.OPEN
	}
}

// ============================================================================
// INSTANCE SINGLETON
// ============================================================================

export const appPosWebSocket = new AppPosWebSocketManager()
