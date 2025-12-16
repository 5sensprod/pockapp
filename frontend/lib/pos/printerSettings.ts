// frontend/lib/pos/printerSettings.ts
import {
	type PosPrinterSettings,
	posPrinterSettingsSchema,
} from './printerSettings.schema'

const STORAGE_KEY = 'pos_printer_settings_v2'

const DEFAULT_SETTINGS: PosPrinterSettings = {
	enabled: false,
	printerName: '',
	width: 58,
	autoPrint: true,
	autoOpenDrawer: true,
}

export function loadPosPrinterSettings(): PosPrinterSettings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return DEFAULT_SETTINGS

		const parsed = posPrinterSettingsSchema.safeParse(JSON.parse(raw))
		return parsed.success ? parsed.data : DEFAULT_SETTINGS
	} catch {
		return DEFAULT_SETTINGS
	}
}

export function savePosPrinterSettings(settings: PosPrinterSettings) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
	} catch (error) {
		console.error('Erreur sauvegarde paramètres imprimante:', error)
	}
}

export type { PosPrinterSettings }
