// frontend/lib/pos/display.ts
// Client WebSocket pour synchroniser l'affichage client entre appareils

import { isWailsEnv } from '@/lib/wails'
import { useCallback, useEffect, useRef, useState } from 'react'

// ============================================================================
// TYPES
// ============================================================================

export type DisplayStatus = {
	active: boolean
	portName: string
	baudRate: number
	protocol: string
	line1: string
	line2: string
	subscribers: number
	controllerID: string
}

export type DisplayMessage = {
	type: 'connected' | 'display_update' | 'pong'
	line1?: string
	line2?: string
	message?: string
	status?: DisplayStatus
}

export type DisplayUpdateCallback = (line1: string, line2: string) => void

// ============================================================================
// DEVICE ID
// ============================================================================

/**
 * Génère ou récupère un ID unique pour cet appareil
 */
export function getDeviceID(): string {
	const key = 'pos_device_id'
	let deviceID = localStorage.getItem(key)

	if (!deviceID) {
		// Générer un UUID simple
		deviceID = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
		localStorage.setItem(key, deviceID)
	}

	return deviceID
}

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
	return httpUrl.replace(/^http/, 'ws')
}

// ============================================================================
// DISPLAY CLIENT CLASS
// ============================================================================

class DisplayClient {
	private ws: WebSocket | null = null
	private callbacks: Set<DisplayUpdateCallback> = new Set()
	private reconnectAttempts = 0
	private maxReconnectAttempts = 5
	private reconnectDelay = 2000
	private pingInterval: ReturnType<typeof setInterval> | null = null
	private isManualClose = false

	/**
	 * Se connecter au WebSocket de l'affichage
	 */
	connect(): void {
		if (
			this.ws?.readyState === WebSocket.OPEN ||
			this.ws?.readyState === WebSocket.CONNECTING
		) {
			return
		}

		this.isManualClose = false
		const wsUrl = `${getWsBaseUrl()}/api/display/ws`

		this.ws = new WebSocket(wsUrl)

		this.ws.onopen = () => {
			this.reconnectAttempts = 0
			this.startPing()
		}

		this.ws.onmessage = (event) => {
			const data: DisplayMessage = JSON.parse(event.data)

			if (data.type === 'display_update') {
				const line1 = data.line1 || ''
				const line2 = data.line2 || ''
				for (const cb of this.callbacks) {
					cb(line1, line2)
				}
			}
		}

		this.ws.onclose = () => {
			this.stopPing()

			if (
				!this.isManualClose &&
				this.reconnectAttempts < this.maxReconnectAttempts
			) {
				this.reconnectAttempts++
				setTimeout(() => this.connect(), this.reconnectDelay)
			}
		}

		this.ws.onerror = () => {}
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
	}

	/**
	 * Ajouter un callback pour les updates
	 */
	onUpdate(callback: DisplayUpdateCallback): () => void {
		this.callbacks.add(callback)

		return () => {
			this.callbacks.delete(callback)
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
export const displayClient = new DisplayClient()

// ============================================================================
// API HTTP (pour contrôler l'affichage)
// ============================================================================

/**
 * Récupérer le statut de l'affichage
 */
export async function getDisplayStatus(): Promise<DisplayStatus> {
	const response = await fetch(`${getApiBaseUrl()}/api/display/status`)
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`)
	}
	return response.json()
}

/**
 * Configurer l'affichage (port, baudrate, protocol)
 */
export async function configureDisplay(
	portName: string,
	baudRate: string,
	protocol: string,
): Promise<void> {
	const response = await fetch(`${getApiBaseUrl()}/api/display/configure`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ portName, baudRate, protocol }),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error || `HTTP ${response.status}`)
	}
}

/**
 * Mettre à jour l'affichage
 */
export async function updateDisplay(
	line1: string,
	line2: string,
	clearFirst = false,
): Promise<void> {
	const deviceID = getDeviceID()

	const response = await fetch(`${getApiBaseUrl()}/api/display/update`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ line1, line2, clearFirst, deviceID }),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error || `HTTP ${response.status}`)
	}
}

/**
 * Effacer l'affichage
 */
export async function clearDisplay(): Promise<void> {
	const deviceID = getDeviceID()

	const response = await fetch(`${getApiBaseUrl()}/api/display/clear`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ deviceID }),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error || `HTTP ${response.status}`)
	}
}

/**
 * Tester l'affichage
 */
export async function testDisplay(): Promise<void> {
	const deviceID = getDeviceID()

	const response = await fetch(`${getApiBaseUrl()}/api/display/test`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ deviceID }),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error || `HTTP ${response.status}`)
	}
}

/**
 * Prendre le contrôle de l'affichage
 */
export async function takeControl(): Promise<void> {
	const deviceID = getDeviceID()

	const response = await fetch(`${getApiBaseUrl()}/api/display/take-control`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ deviceID }),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error || `HTTP ${response.status}`)
	}
}

/**
 * Libérer le contrôle de l'affichage
 */
export async function releaseControl(): Promise<void> {
	const deviceID = getDeviceID()

	const response = await fetch(
		`${getApiBaseUrl()}/api/display/release-control`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ deviceID }),
		},
	)

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error || `HTTP ${response.status}`)
	}
}

/**
 * Désactiver l'affichage
 */
export async function deactivateDisplay(): Promise<void> {
	const response = await fetch(`${getApiBaseUrl()}/api/display/deactivate`, {
		method: 'POST',
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
 * Hook React pour utiliser l'affichage client
 * Se connecte automatiquement au WebSocket pour recevoir les updates
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { currentLine1, currentLine2, isConnected } = useDisplay((line1, line2) => {
 *     console.log('Display mis à jour:', line1, line2)
 *   })
 *
 *   return (
 *     <div>
 *       <p>L1: {currentLine1}</p>
 *       <p>L2: {currentLine2}</p>
 *     </div>
 *   )
 * }
 * ```
 */
export function useDisplay(onUpdate?: DisplayUpdateCallback) {
	const [currentLine1, setCurrentLine1] = useState<string>('')
	const [currentLine2, setCurrentLine2] = useState<string>('')
	const [isConnected, setIsConnected] = useState(false)
	const [controllerID, setControllerID] = useState<string>('')
	const [deviceID] = useState(() => getDeviceID())

	// Utiliser useRef pour stocker le callback et éviter les re-renders
	const onUpdateRef = useRef(onUpdate)
	onUpdateRef.current = onUpdate

	// ✅ AUTO-CONNECT au montage
	useEffect(() => {
		displayClient.connect()
		return () => {}
	}, [])

	// Charger le status initial pour récupérer le controllerID
	useEffect(() => {
		getDisplayStatus()
			.then((status) => {
				setControllerID(status.controllerID || '')
				setCurrentLine1(status.line1 || '')
				setCurrentLine2(status.line2 || '')
			})
			.catch((err) =>
				console.error('[useDisplay] Erreur chargement status:', err),
			)
	}, [])

	// Vérifier la connexion périodiquement
	useEffect(() => {
		const checkConnection = () => {
			setIsConnected(displayClient.isConnected())
		}

		const interval = setInterval(checkConnection, 1000)
		checkConnection()

		return () => clearInterval(interval)
	}, [])

	// S'abonner aux updates
	useEffect(() => {
		const handleUpdate = (line1: string, line2: string) => {
			setCurrentLine1(line1)
			setCurrentLine2(line2)
			onUpdateRef.current?.(line1, line2)

			// Recharger le status pour mettre à jour le controllerID
			getDisplayStatus()
				.then((status) => setControllerID(status.controllerID || ''))
				.catch(() => {})
		}

		const unsubscribe = displayClient.onUpdate(handleUpdate)
		return unsubscribe
	}, [])

	const connect = useCallback(() => {
		displayClient.connect()
	}, [])

	const disconnect = useCallback(() => {
		displayClient.disconnect()
	}, [])

	const hasControl = controllerID === deviceID
	const isControlled = controllerID !== ''

	return {
		currentLine1,
		currentLine2,
		isConnected,
		connect,
		disconnect,
		controllerID,
		deviceID,
		hasControl,
		isControlled,
	}
}
