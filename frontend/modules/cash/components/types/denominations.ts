// frontend/modules/cash/components/types/denominations.ts
import { z } from 'zod'

/**
 * Schéma de validation pour les dénominations de pièces et billets
 */
export const denominationsSchema = z.object({
	coins_010: z.number().min(0),
	coins_020: z.number().min(0),
	coins_050: z.number().min(0),
	coins_100: z.number().min(0),
	coins_200: z.number().min(0),
	bills_005: z.number().min(0),
	bills_010: z.number().min(0),
	bills_020: z.number().min(0),
	bills_050: z.number().min(0),
	bills_100: z.number().min(0),
})

export type DenominationsForm = z.infer<typeof denominationsSchema>

/**
 * Liste des dénominations de pièces et billets disponibles
 */
export const DENOMINATIONS = [
	{ key: 'coins_010', label: '0,10 €', value: 0.1, type: 'coin' },
	{ key: 'coins_020', label: '0,20 €', value: 0.2, type: 'coin' },
	{ key: 'coins_050', label: '0,50 €', value: 0.5, type: 'coin' },
	{ key: 'coins_100', label: '1,00 €', value: 1, type: 'coin' },
	{ key: 'coins_200', label: '2,00 €', value: 2, type: 'coin' },
	{ key: 'bills_005', label: '5 €', value: 5, type: 'bill' },
	{ key: 'bills_010', label: '10 €', value: 10, type: 'bill' },
	{ key: 'bills_020', label: '20 €', value: 20, type: 'bill' },
	{ key: 'bills_050', label: '50 €', value: 50, type: 'bill' },
	{ key: 'bills_100', label: '100 €', value: 100, type: 'bill' },
] as const

/**
 * Convertit une valeur en nombre fini ou null
 */
export const toFiniteNumber = (v: unknown): number | null => {
	const n =
		typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN

	return Number.isFinite(n) ? n : null
}
