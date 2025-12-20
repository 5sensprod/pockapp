// frontend/lib/pos/customerDisplaySettings.ts
import {
	type CustomerDisplaySettings,
	customerDisplaySettingsSchema,
	defaultCustomerDisplaySettings,
} from './customerDisplaySettings.schema'

const STORAGE_KEY = 'customerDisplay.settings'

export function loadCustomerDisplaySettings(): CustomerDisplaySettings {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (!stored) {
			// Pas de données → retourner les valeurs par défaut
			return defaultCustomerDisplaySettings
		}
		const parsed = JSON.parse(stored)
		// Valider et retourner les données stockées
		return customerDisplaySettingsSchema.parse(parsed)
	} catch (error) {
		console.error('Failed to load customer display settings:', error)
		// En cas d'erreur → retourner les valeurs par défaut
		return defaultCustomerDisplaySettings
	}
}

export function saveCustomerDisplaySettings(
	settings: CustomerDisplaySettings,
): void {
	try {
		const validated = customerDisplaySettingsSchema.parse(settings)
		localStorage.setItem(STORAGE_KEY, JSON.stringify(validated))
	} catch (error) {
		console.error('Failed to save customer display settings:', error)
	}
}

export function resetCustomerDisplaySettings(): void {
	localStorage.removeItem(STORAGE_KEY)
}
