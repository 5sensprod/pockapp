// frontend/lib/hooks/usePeriodFilter.ts

import { useCallback, useMemo, useState } from 'react'

const PERIODS = [
	'all',
	'this_week',
	'last_week',
	'this_month',
	'last_month',
	'this_quarter',
	'this_year',
] as const

export type Period = (typeof PERIODS)[number]

export const PERIOD_PREFERENCE_KEYS = {
	invoices: 'pocketapp-period-connect-invoices',
	quotes: 'pocketapp-period-connect-quotes',
	orders: 'pocketapp-period-connect-orders',
	tickets: 'pocketapp-period-cash-tickets',
} as const

type PeriodReader = Pick<Storage, 'getItem'>
type PeriodWriter = Pick<Storage, 'setItem'>

export interface DateRangeStrings {
	from: string | undefined
	to: string | undefined
}

export const PERIOD_LABELS: Record<Period, string> = {
	all: 'Toutes les périodes',
	this_week: 'Cette semaine',
	last_week: 'Semaine dernière',
	this_month: 'Ce mois',
	last_month: 'Mois dernier',
	this_quarter: 'Ce trimestre',
	this_year: 'Cette année',
}

function toYMD(date: Date): string {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, '0')
	const d = String(date.getDate()).padStart(2, '0')
	return `${y}-${m}-${d}`
}

export function isPeriod(value: unknown): value is Period {
	return typeof value === 'string' && PERIODS.includes(value as Period)
}

function localPeriodStorage(): Storage | undefined {
	try {
		return typeof window === 'undefined' ? undefined : window.localStorage
	} catch {
		return undefined
	}
}

export function readPeriodPreference(
	storage: PeriodReader | undefined,
	key: string,
	defaultPeriod: Period,
): Period {
	try {
		const stored = storage?.getItem(key)
		return isPeriod(stored) ? stored : defaultPeriod
	} catch {
		return defaultPeriod
	}
}

export function writePeriodPreference(
	storage: PeriodWriter | undefined,
	key: string,
	period: Period,
): void {
	try {
		// Ceci est uniquement une préférence d'affichage (par exemple
		// `this_month`), jamais une donnée commerciale ou nominative. Elle reste
		// donc distincte du cache TanStack Query et n'élargit pas CLES_PERSISTEES.
		storage?.setItem(key, period)
	} catch {
		// Un stockage indisponible (poste verrouillé, quota, navigation privée)
		// ne doit jamais empêcher l'écran de fonctionner.
	}
}

export function computeDateRange(period: Period): DateRangeStrings {
	const now = new Date()

	switch (period) {
		case 'all':
			return { from: undefined, to: undefined }

		case 'this_week': {
			const day = now.getDay() === 0 ? 7 : now.getDay()
			const mon = new Date(now)
			mon.setDate(now.getDate() - (day - 1))
			const sun = new Date(mon)
			sun.setDate(mon.getDate() + 6)
			return { from: toYMD(mon), to: toYMD(sun) }
		}

		case 'last_week': {
			const day = now.getDay() === 0 ? 7 : now.getDay()
			const mon = new Date(now)
			mon.setDate(now.getDate() - (day - 1) - 7)
			const sun = new Date(mon)
			sun.setDate(mon.getDate() + 6)
			return { from: toYMD(mon), to: toYMD(sun) }
		}

		case 'this_month': {
			const from = new Date(now.getFullYear(), now.getMonth(), 1)
			const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
			return { from: toYMD(from), to: toYMD(to) }
		}

		case 'last_month': {
			const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
			const to = new Date(now.getFullYear(), now.getMonth(), 0)
			return { from: toYMD(from), to: toYMD(to) }
		}

		case 'this_quarter': {
			const quarter = Math.floor(now.getMonth() / 3)
			const from = new Date(now.getFullYear(), quarter * 3, 1)
			const to = new Date(now.getFullYear(), quarter * 3 + 3, 0)
			return { from: toYMD(from), to: toYMD(to) }
		}

		case 'this_year': {
			const from = new Date(now.getFullYear(), 0, 1)
			const to = new Date(now.getFullYear(), 11, 31)
			return { from: toYMD(from), to: toYMD(to) }
		}

		default:
			return { from: undefined, to: undefined }
	}
}

export function usePeriodFilter(
	defaultPeriod: Period = 'this_month',
	preferenceKey?: string,
) {
	const [period, setPeriodState] = useState<Period>(() =>
		preferenceKey
			? readPeriodPreference(localPeriodStorage(), preferenceKey, defaultPeriod)
			: defaultPeriod,
	)
	const setPeriod = useCallback(
		(nextPeriod: Period) => {
			setPeriodState(nextPeriod)
			if (preferenceKey) {
				writePeriodPreference(localPeriodStorage(), preferenceKey, nextPeriod)
			}
		},
		[preferenceKey],
	)
	const dateRange = useMemo(() => computeDateRange(period), [period])
	return { period, setPeriod, dateRange }
}
