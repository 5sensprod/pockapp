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
		if (!stored) return defaultCustomerDisplaySettings

		const parsed = JSON.parse(stored)

		// ✅ Migration douce: welcomeMessage -> welcomeLine1/welcomeLine2
		const migrated =
			typeof parsed?.welcomeMessage === 'string' &&
			typeof parsed?.welcomeLine1 !== 'string'
				? {
						...parsed,
						welcomeLine1: parsed.welcomeMessage,
						welcomeLine2: '',
					}
				: parsed

		return customerDisplaySettingsSchema.parse(migrated)
	} catch (error) {
		console.error('Failed to load customer display settings:', error)
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
