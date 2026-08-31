import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	computeDateRange,
	readPeriodPreference,
	writePeriodPreference,
} from './usePeriodFilter'

const KEY = 'period-test'

afterEach(() => vi.useRealTimers())

describe('bornes des présélections', () => {
	it('calcule la semaine courante et les fenêtres glissantes en date locale', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date(2026, 7, 15, 12))

		expect(computeDateRange('semaine-en-cours')).toEqual({
			from: '2026-08-10',
			to: '2026-08-15',
		})
		expect(computeDateRange('trente-jours')).toEqual({
			from: '2026-07-17',
			to: '2026-08-15',
		})
		expect(computeDateRange('quatre-vingt-dix-jours')).toEqual({
			from: '2026-05-18',
			to: '2026-08-15',
		})
	})

	it('calcule les périodes calendaires et la vue sans borne', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date(2026, 7, 15, 12))

		expect(computeDateRange('toutes')).toEqual({ from: '', to: '' })
		expect(computeDateRange('mois-en-cours')).toEqual({
			from: '2026-08-01',
			to: '2026-08-15',
		})
		expect(computeDateRange('annee-en-cours')).toEqual({
			from: '2026-01-01',
			to: '2026-08-15',
		})
	})
})

describe('préférence de période locale', () => {
	it('retombe sur le défaut si la clé est absente ou inconnue', () => {
		const expected = {
			period: 'trente-jours',
			...computeDateRange('trente-jours'),
		}

		expect(
			readPeriodPreference({ getItem: () => null }, KEY, 'trente-jours'),
		).toEqual(expected)
		expect(
			readPeriodPreference(
				{ getItem: () => 'valeur-corrompue' },
				KEY,
				'trente-jours',
			),
		).toEqual(expected)
	})

	it('conserve exactement les deux bornes libres validées', () => {
		const stored = JSON.stringify({
			period: 'libre',
			from: '2026-08-01',
			to: '2026-08-30',
		})

		expect(
			readPeriodPreference({ getItem: () => stored }, KEY, 'trente-jours'),
		).toEqual({
			period: 'libre',
			from: '2026-08-01',
			to: '2026-08-30',
		})
	})

	it('migre puis recalcule une ancienne présélection par rapport à aujourd’hui', () => {
		const stored = JSON.stringify({
			period: 'sept-jours',
			from: '2020-01-01',
			to: '2020-01-07',
		})

		expect(
			readPeriodPreference({ getItem: () => stored }, KEY, 'trente-jours'),
		).toEqual({
			period: 'semaine-en-cours',
			...computeDateRange('semaine-en-cours'),
		})
	})

	it('retombe sur le défaut si les bornes libres sont illisibles', () => {
		const stored = JSON.stringify({
			period: 'libre',
			from: '2026-02-31',
			to: '2026-03-01',
		})

		expect(
			readPeriodPreference({ getItem: () => stored }, KEY, 'mois-en-cours'),
		).toEqual({
			period: 'mois-en-cours',
			...computeDateRange('mois-en-cours'),
		})
	})

	it('retombe sur le défaut si la lecture du stockage lève', () => {
		const storage = {
			getItem: () => {
				throw new Error('stockage indisponible')
			},
		}

		expect(readPeriodPreference(storage, KEY, 'semaine-en-cours')).toEqual({
			period: 'semaine-en-cours',
			...computeDateRange('semaine-en-cours'),
		})
	})

	it("n'empêche pas le rendu si l'écriture du stockage lève", () => {
		const storage = {
			setItem: () => {
				throw new Error('quota dépassé')
			},
		}

		expect(() =>
			writePeriodPreference(storage, KEY, {
				period: 'libre',
				from: '2026-08-01',
				to: '2026-08-30',
			}),
		).not.toThrow()
	})
})
