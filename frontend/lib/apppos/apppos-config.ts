// frontend/lib/apppos/apppos-config.ts
// Configuration de l'URL AppPos avec découverte réseau automatique

import { isWailsEnv } from '../wails'

/**
 * Détermine l'URL de base pour l'API AppPos en fonction de l'environnement
 * Logique similaire à PocketBase pour assurer la cohérence
 */
function getAppPosBaseUrl(): string {
	// Override explicite via variable d'environnement Vite
	const envUrl = (import.meta as any).env?.VITE_APPPOS_URL as string | undefined

	if (envUrl) {
		return envUrl
	}

	// En environnement Wails (application desktop)
	if (isWailsEnv()) {
		return 'http://127.0.0.1:3000'
	}

	// En navigation réseau (navigateur web, téléphone, autre PC)
	// Utilise le même hostname que le frontend mais sur le port 3000
	const host = window.location.hostname
	const proto = window.location.protocol // "http:" ou "https:"

	// Si le frontend est déjà sur le port 3000, on utilise l'origin actuel
	// Sinon, on construit l'URL vers le port 3000
	if (window.location.port === '3000') {
		return window.location.origin
	}

	return `${proto}//${host}:3000`
}

/**
 * URL de base pour l'API AppPos (avec /api)
 */
export const APPPOS_API_BASE_URL = `${getAppPosBaseUrl()}/api`

/**
 * URL de base pour les assets AppPos (images, etc.)
 */
export const APPPOS_ASSETS_BASE_URL = getAppPosBaseUrl()

/**
 * Récupère l'URL complète pour une image AppPos
 */
export function getAppPosImageUrl(
	imagePath: string | undefined,
): string | null {
	if (!imagePath) return null
	if (imagePath.startsWith('http')) return imagePath
	return `${APPPOS_ASSETS_BASE_URL}${imagePath}`
}
