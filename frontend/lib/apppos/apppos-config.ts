export function getAppPosApiBaseUrl(): string {
	return 'http://192.168.1.10:3000/api'
}

export function getAppPosAssetsBaseUrl(): string {
	return 'http://192.168.1.10:3000'
}

export const APPPOS_API_BASE_URL = 'http://192.168.1.10:3000/api'
export const APPPOS_ASSETS_BASE_URL = 'http://192.168.1.10:3000'

export function getAppPosImageUrl(
	imagePath: string | undefined,
): string | null {
	if (!imagePath) return null
	if (imagePath.startsWith('http')) return imagePath
	return `http://192.168.1.10:3000${imagePath}`
}
