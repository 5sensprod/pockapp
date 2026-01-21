// frontend/lib/pos/displaySettings.ts
// Settings locaux pour les messages de bienvenue de l'afficheur client et configuration du port

export interface DisplayWelcomeSettings {
	welcomeLine1: string
	welcomeLine2: string
}

export interface DisplayPortSettings {
	portName: string
	baudRate: string
	protocol: string
}

const WELCOME_STORAGE_KEY = 'display_welcome_settings'
const PORT_STORAGE_KEY = 'display_port_settings'

const DEFAULT_WELCOME_SETTINGS: DisplayWelcomeSettings = {
	welcomeLine1: 'Bienvenue',
	welcomeLine2: 'Axe Musique',
}

const DEFAULT_PORT_SETTINGS: DisplayPortSettings = {
	portName: 'COM3',
	baudRate: '9600',
	protocol: 'EPSON_D101',
}

// ==========================================
// Messages de bienvenue
// ==========================================

export function loadDisplayWelcomeSettings(): DisplayWelcomeSettings {
	try {
		const stored = localStorage.getItem(WELCOME_STORAGE_KEY)
		if (!stored) return DEFAULT_WELCOME_SETTINGS

		const parsed = JSON.parse(stored)
		return {
			welcomeLine1:
				parsed.welcomeLine1 || DEFAULT_WELCOME_SETTINGS.welcomeLine1,
			welcomeLine2:
				parsed.welcomeLine2 || DEFAULT_WELCOME_SETTINGS.welcomeLine2,
		}
	} catch (err) {
		console.error('[DisplaySettings] Erreur chargement welcome:', err)
		return DEFAULT_WELCOME_SETTINGS
	}
}

export function saveDisplayWelcomeSettings(
	settings: DisplayWelcomeSettings,
): void {
	try {
		localStorage.setItem(WELCOME_STORAGE_KEY, JSON.stringify(settings))
	} catch (err) {
		console.error('[DisplaySettings] Erreur sauvegarde welcome:', err)
	}
}

// ==========================================
// Configuration du port COM
// ==========================================

export function loadDisplayPortSettings(): DisplayPortSettings {
	try {
		const stored = localStorage.getItem(PORT_STORAGE_KEY)
		if (!stored) return DEFAULT_PORT_SETTINGS

		const parsed = JSON.parse(stored)
		return {
			portName: parsed.portName || DEFAULT_PORT_SETTINGS.portName,
			baudRate: parsed.baudRate || DEFAULT_PORT_SETTINGS.baudRate,
			protocol: parsed.protocol || DEFAULT_PORT_SETTINGS.protocol,
		}
	} catch (err) {
		console.error('[DisplaySettings] Erreur chargement port:', err)
		return DEFAULT_PORT_SETTINGS
	}
}

export function saveDisplayPortSettings(settings: DisplayPortSettings): void {
	try {
		localStorage.setItem(PORT_STORAGE_KEY, JSON.stringify(settings))
	} catch (err) {
		console.error('[DisplaySettings] Erreur sauvegarde port:', err)
	}
}
