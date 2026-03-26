// frontend/lib/apppos/apppos-config.ts

import { isWailsEnv } from '../wails'

function getAppPosBaseUrl(): string {
	// Override explicite via variable d'environnement Vite
	const envUrl = (import.meta as any).env?.VITE_APPPOS_URL as string | undefined
	if (envUrl) return envUrl

	if (isWailsEnv()) {
		return 'http://127.0.0.1:3000'
	}

	// Même logique que PocketBase : document.location.origin + port 3000
	const { protocol, hostname } = document.location
	return `${protocol}//${hostname}:3000`
}

export function getAppPosApiBaseUrl(): string {
	return `${getAppPosBaseUrl()}/api`
}

export function getAppPosAssetsBaseUrl(): string {
	return getAppPosBaseUrl()
}

export const APPPOS_API_BASE_URL = getAppPosApiBaseUrl()
export const APPPOS_ASSETS_BASE_URL = getAppPosBaseUrl()

export function getAppPosImageUrl(
	imagePath: string | undefined,
): string | null {
	if (!imagePath) return null
	if (imagePath.startsWith('http')) return imagePath
	return `${getAppPosAssetsBaseUrl()}${imagePath}`
}
