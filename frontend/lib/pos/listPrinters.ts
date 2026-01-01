// frontend/lib/pos/listPrinters.ts
// Adapté pour fonctionner en mode Wails (bindings) ET en mode HTTP (réseau)

import { isWailsEnv } from '@/lib/wails'

// ============================================================================
// CONFIGURATION - URL dynamique
// ============================================================================

function getPosApiBaseUrl(): string {
	if (isWailsEnv()) {
		// Mode Wails desktop : localhost
		return 'http://127.0.0.1:8090/api/pos'
	}
	// Mode web : utilise l'origin actuel (fonctionne en local ET en public)
	return `${document.location.origin}/api/pos`
}

// ============================================================================
// API HTTP
// ============================================================================

/**
 * Liste des imprimantes via HTTP
 */
async function listPrintersHttp(): Promise<string[]> {
	try {
		const response = await fetch(`${getPosApiBaseUrl()}/printers`)

		if (!response.ok) {
			console.error('Failed to fetch printers:', response.status)
			return []
		}

		const data = await response.json()
		return data.printers || []
	} catch (error) {
		console.error('Error fetching printers:', error)
		return []
	}
}

/**
 * Liste des ports série via HTTP
 */
async function listSerialPortsHttp(): Promise<string[]> {
	try {
		const response = await fetch(`${getPosApiBaseUrl()}/serial-ports`)

		if (!response.ok) {
			console.error('Failed to fetch serial ports:', response.status)
			return []
		}

		const data = await response.json()
		return data.ports || []
	} catch (error) {
		console.error('Error fetching serial ports:', error)
		return []
	}
}

// ============================================================================
// API WAILS
// ============================================================================

/**
 * Liste des imprimantes via Wails
 */
async function listPrintersWails(): Promise<string[]> {
	try {
		const { ListPrinters } = await import('@/wailsjs/go/main/App')
		return await ListPrinters()
	} catch (error) {
		console.error('Error listing printers via Wails:', error)
		return []
	}
}

// ============================================================================
// EXPORTS - Détection automatique de l'environnement
// ============================================================================

/**
 * Liste des imprimantes Windows disponibles
 * Utilise Wails en mode desktop, HTTP en mode web
 */
export async function listWindowsPrinters(): Promise<string[]> {
	if (isWailsEnv()) {
		return listPrintersWails()
	}
	return listPrintersHttp()
}

/**
 * Liste des ports série disponibles (pour afficheur VFD)
 * Toujours utiliser HTTP car ListSerialPorts n'existe pas dans les bindings Wails
 */
export async function listSerialPorts(): Promise<string[]> {
	return listSerialPortsHttp()
}

/**
 * Debug: Affiche l'URL utilisée
 */
export function getPosApiUrl(): string {
	return getPosApiBaseUrl()
}
