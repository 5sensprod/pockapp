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

	connect(): void {
		if (
			this.ws?.readyState === WebSocket.OPEN ||
			this.ws?.readyState === WebSocket.CONNECTING
		) {
			return
		}

		this.isManualClose = false
		const wsUrl = `${getWsBaseUrl()}/api/scanner/ws`

		this.ws = new WebSocket(wsUrl)

		this.ws.onopen = () => {
			this.reconnectAttempts = 0
			this.startPing()
		}

		this.ws.onmessage = (event) => {
			const data: ScanMessage = JSON.parse(event.data)

			if (data.type === 'scan' && data.barcode) {
				for (const cb of this.callbacks) {
					cb(data.barcode)
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

	disconnect(): void {
		this.isManualClose = true
		this.stopPing()

		if (this.ws) {
			this.ws.close()
			this.ws = null
		}
	}

	onScan(callback: ScanCallback): () => void {
		this.callbacks.add(callback)
		return () => {
			this.callbacks.delete(callback)
		}
	}

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN
	}

	private startPing(): void {
		this.pingInterval = setInterval(() => {
			if (this.ws?.readyState === WebSocket.OPEN) {
				this.ws.send('ping')
			}
		}, 30000)
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
// API HTTP
// ============================================================================

export async function getScannerStatus(): Promise<ScannerStatus> {
	const response = await fetch(`${getApiBaseUrl()}/api/scanner/status`)
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`)
	}
	return response.json()
}

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

export async function stopScanner(): Promise<void> {
	const response = await fetch(`${getApiBaseUrl()}/api/scanner/stop`, {
		method: 'POST',
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error || `HTTP ${response.status}`)
	}
}

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

export function useScanner(onScan?: ScanCallback) {
	const [lastScan, setLastScan] = useState<string | null>(null)
	const [isConnected, setIsConnected] = useState(false)

	const onScanRef = useRef(onScan)
	onScanRef.current = onScan

	useEffect(() => {
		scannerClient.connect()
		return () => {
			scannerClient.disconnect() // ✅ CLEANUP
		}
	}, [])

	useEffect(() => {
		const checkConnection = () => {
			setIsConnected(scannerClient.isConnected())
		}

		const interval = setInterval(checkConnection, 1000)
		checkConnection()

		return () => clearInterval(interval)
	}, [])

	useEffect(() => {
		const handleScan = (barcode: string) => {
			setLastScan(barcode)
			onScanRef.current?.(barcode)
		}

		const unsubscribe = scannerClient.onScan(handleScan)
		return unsubscribe
	}, [])

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
