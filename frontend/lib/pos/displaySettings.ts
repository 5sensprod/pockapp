// frontend/lib/pos/displaySettings.ts
// Settings locaux pour les messages de bienvenue de l'afficheur client

export interface DisplayWelcomeSettings {
	welcomeLine1: string
	welcomeLine2: string
}

const STORAGE_KEY = 'display_welcome_settings'

const DEFAULT_SETTINGS: DisplayWelcomeSettings = {
	welcomeLine1: 'Bienvenue',
	welcomeLine2: 'Axe Musique',
}

export function loadDisplayWelcomeSettings(): DisplayWelcomeSettings {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (!stored) return DEFAULT_SETTINGS

		const parsed = JSON.parse(stored)
		return {
			welcomeLine1: parsed.welcomeLine1 || DEFAULT_SETTINGS.welcomeLine1,
			welcomeLine2: parsed.welcomeLine2 || DEFAULT_SETTINGS.welcomeLine2,
		}
	} catch (err) {
		console.error('[DisplaySettings] Erreur chargement:', err)
		return DEFAULT_SETTINGS
	}
}

export function saveDisplayWelcomeSettings(
	settings: DisplayWelcomeSettings,
): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
	} catch (err) {
		console.error('[DisplaySettings] Erreur sauvegarde:', err)
	}
}
