import { describe, expect, it } from 'vitest'
import { readPeriodPreference, writePeriodPreference } from './usePeriodFilter'

const KEY = 'period-test'

describe('préférence de période locale', () => {
	it('retombe sur le défaut si la clé est absente ou inconnue', () => {
		expect(
			readPeriodPreference({ getItem: () => null }, KEY, 'this_month'),
		).toBe('this_month')
		expect(
			readPeriodPreference(
				{ getItem: () => 'valeur-corrompue' },
				KEY,
				'this_month',
			),
		).toBe('this_month')
	})

	it('retombe sur le défaut si la lecture du stockage lève', () => {
		const storage = {
			getItem: () => {
				throw new Error('stockage indisponible')
			},
		}

		expect(readPeriodPreference(storage, KEY, 'all')).toBe('all')
	})

	it("n'empêche pas le rendu si l'écriture du stockage lève", () => {
		const storage = {
			setItem: () => {
				throw new Error('quota dépassé')
			},
		}

		expect(() =>
			writePeriodPreference(storage, KEY, 'last_month'),
		).not.toThrow()
	})
})
