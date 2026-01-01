// frontend/lib/pos/scanner.ts
// Client WebSocket pour recevoir les scans de la scanette distante

import { isWailsEnv } from '@/lib/wails'
import { useCallback, useEffect, useRef, useState } from 'react'

// ============================================================================
// TYPES
// ============================================================================

export type ScannerStatus = {
	running: boolean
	portName: string
	baudRate: number
	subscribers: number
}

export type ScanMessage = {
	type: 'connected' | 'scan' | 'pong'
	barcode?: string
	message?: string
	status?: ScannerStatus
}

export type ScanCallback = (barcode: string) => void

// ============================================================================
// CONFIGURATION
// ============================================================================

function getApiBaseUrl(): string {
	if (isWailsEnv()) {
		return 'http://127.0.0.1:8090'
	}
	return document.location.origin
}

function getWsBaseUrl(): string {
	const httpUrl = getApiBaseUrl()
	// Convertir http:// en ws:// et https:// en wss://
	return httpUrl.replace(/^http/, 'ws')
}

// ============================================================================
// SCANNER CLIENT CLASS
// ============================================================================

class ScannerClient {
	private ws: WebSocket | null = null
	private callbacks: Set<ScanCallback> = new Set()
	private reconnectAttempts = 0
	private maxReconnectAttempts = 5
	private reconnectDelay = 2000
	private pingInterval: ReturnType<typeof setInterval> | null = null
	private isManualClose = false

	/**
	 * Se connecter au WebSocket de la scanette
	 */
	connect(): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			console.log('[Scanner] Déjà connecté')
			return
		}

		if (this.ws?.readyState === WebSocket.CONNECTING) {
			console.log('[Scanner] Connexion en cours...')
			return
		}

		this.isManualClose = false
		const wsUrl = `${getWsBaseUrl()}/api/scanner/ws`
		console.log('[Scanner] Connexion à', wsUrl)

		try {
			this.ws = new WebSocket(wsUrl)

			this.ws.onopen = () => {
				console.log('[Scanner] ✓ WebSocket connecté')
				this.reconnectAttempts = 0
				this.startPing()
			}

			this.ws.onmessage = (event) => {
				try {
					const data: ScanMessage = JSON.parse(event.data)
					console.log('[Scanner] Message reçu:', data)

					if (data.type === 'scan' && data.barcode) {
						const barcode = data.barcode // ✅ Variable locale, plus besoin de !
						console.log(
							'[Scanner] Scan reçu, notification de',
							this.callbacks.size,
							'callbacks',
						)
						// Notifier tous les callbacks
						for (const cb of this.callbacks) {
							try {
								cb(barcode)
							} catch (err) {
								console.error('[Scanner] Erreur dans callback:', err)
							}
						}
					}
				} catch (err) {
					console.error('[Scanner] Erreur parsing message:', err)
				}
			}

			this.ws.onclose = () => {
				console.log('[Scanner] WebSocket fermé')
				this.stopPing()

				if (
					!this.isManualClose &&
					this.reconnectAttempts < this.maxReconnectAttempts
				) {
					this.reconnectAttempts++
					console.log(
						`[Scanner] Reconnexion dans ${this.reconnectDelay}ms (tentative ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
					)
					setTimeout(() => this.connect(), this.reconnectDelay)
				}
			}

			this.ws.onerror = (error) => {
				console.error('[Scanner] WebSocket erreur:', error)
			}
		} catch (err) {
			console.error('[Scanner] Erreur création WebSocket:', err)
		}
	}

	/**
	 * Se déconnecter du WebSocket
	 */
	disconnect(): void {
		this.isManualClose = true
		this.stopPing()

		if (this.ws) {
			this.ws.close()
			this.ws = null
		}

		console.log('[Scanner] Déconnecté')
	}

	/**
	 * Ajouter un callback pour les scans
	 */
	onScan(callback: ScanCallback): () => void {
		this.callbacks.add(callback)
		console.log(`[Scanner] Callback ajouté (total: ${this.callbacks.size})`)

		// Retourner une fonction pour se désabonner
		return () => {
			this.callbacks.delete(callback)
			console.log(`[Scanner] Callback retiré (total: ${this.callbacks.size})`)
		}
	}

	/**
	 * Vérifier si connecté
	 */
	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN
	}

	/**
	 * Ping pour garder la connexion active
	 */
	private startPing(): void {
		this.pingInterval = setInterval(() => {
			if (this.ws?.readyState === WebSocket.OPEN) {
				this.ws.send('ping')
			}
		}, 30000) // Ping toutes les 30 secondes
	}

	private stopPing(): void {
		if (this.pingInterval) {
			clearInterval(this.pingInterval)
			this.pingInterval = null
		}
	}
}

// Instance globale
export const scannerClient = new ScannerClient()

// ============================================================================
// API HTTP (pour configurer la scanette)
// ============================================================================

/**
 * Récupérer le statut de la scanette
 */
export async function getScannerStatus(): Promise<ScannerStatus> {
	const response = await fetch(`${getApiBaseUrl()}/api/scanner/status`)
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`)
	}
	return response.json()
}

/**
 * Démarrer l'écoute de la scanette sur le serveur
 */
export async function startScanner(
	portName: string,
	baudRate = 9600,
): Promise<void> {
	const response = await fetch(`${getApiBaseUrl()}/api/scanner/start`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ portName, baudRate }),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error || `HTTP ${response.status}`)
	}
}

/**
 * Arrêter l'écoute de la scanette
 */
export async function stopScanner(): Promise<void> {
	const response = await fetch(`${getApiBaseUrl()}/api/scanner/stop`, {
		method: 'POST',
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error || `HTTP ${response.status}`)
	}
}

/**
 * Simuler un scan (pour les tests)
 */
export async function simulateScan(barcode: string): Promise<void> {
	const response = await fetch(`${getApiBaseUrl()}/api/scanner/simulate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ barcode }),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error || `HTTP ${response.status}`)
	}
}

/**
 * Broadcaster un scan HID aux autres appareils
 * Utilisé quand la scanette est en mode clavier (HID)
 */
export async function broadcastScan(barcode: string): Promise<void> {
	const response = await fetch(`${getApiBaseUrl()}/api/scanner/broadcast`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ barcode }),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error || `HTTP ${response.status}`)
	}
}

// ============================================================================
// REACT HOOK
// ============================================================================

/**
 * Hook React pour utiliser la scanette
 * Se connecte automatiquement au WebSocket
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { lastScan, isConnected } = useScanner((barcode) => {
 *     console.log('Nouveau scan:', barcode)
 *   })
 *
 *   return <p>Dernier scan: {lastScan}</p>
 * }
 * ```
 */
export function useScanner(onScan?: ScanCallback) {
	const [lastScan, setLastScan] = useState<string | null>(null)
	const [isConnected, setIsConnected] = useState(false)

	// Utiliser useRef pour stocker le callback et éviter les re-renders
	const onScanRef = useRef(onScan)
	onScanRef.current = onScan

	// ✅ AUTO-CONNECT au montage
	useEffect(() => {
		console.log('[useScanner] Montage, connexion automatique...')
		scannerClient.connect()

		// Note: on ne déconnecte PAS au démontage car d'autres composants
		// peuvent utiliser le même scannerClient
		return () => {
			console.log('[useScanner] Démontage')
		}
	}, [])

	// Vérifier la connexion périodiquement
	useEffect(() => {
		const checkConnection = () => {
			setIsConnected(scannerClient.isConnected())
		}

		const interval = setInterval(checkConnection, 1000)
		checkConnection()

		return () => clearInterval(interval)
	}, [])

	// S'abonner aux scans
	useEffect(() => {
		const handleScan = (barcode: string) => {
			console.log('[useScanner] Scan reçu:', barcode)
			setLastScan(barcode)
			onScanRef.current?.(barcode)
		}

		const unsubscribe = scannerClient.onScan(handleScan)
		return unsubscribe
	}, []) // Pas de dépendances car on utilise useRef

	const connect = useCallback(() => {
		scannerClient.connect()
	}, [])

	const disconnect = useCallback(() => {
		scannerClient.disconnect()
	}, [])

	return {
		lastScan,
		isConnected,
		connect,
		disconnect,
	}
}
