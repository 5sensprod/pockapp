// frontend/lib/hooks/usePeriodFilter.ts

import { useCallback, useEffect, useMemo, useState } from 'react'

export const PRESET_PERIODS = [
	['toutes', 'Toutes périodes'],
	['semaine-en-cours', 'Semaine en cours'],
	['mois-en-cours', 'Mois en cours'],
	['trente-jours', '30 jours'],
	['quatre-vingt-dix-jours', '90 jours'],
	['annee-en-cours', 'Année en cours'],
] as const

export type PresetPeriod = (typeof PRESET_PERIODS)[number][0]
export type Period = PresetPeriod | 'libre'

export const PERIOD_PREFERENCE_KEYS = {
	invoices: 'pocketapp-period-connect-invoices',
	quotes: 'pocketapp-period-connect-quotes',
	orders: 'pocketapp-period-connect-orders',
	tickets: 'pocketapp-period-cash-tickets',
	salesJournal: 'pocketapp-period-stats-sales-journal',
	cashJournal: 'pocketapp-period-stats-cash-journal',
} as const

export interface DateRangeStrings {
	from: string | undefined
	to: string | undefined
}

interface PeriodPreference {
	period: Period
	from: string
	to: string
}

type PeriodReader = Pick<Storage, 'getItem'>
type PeriodWriter = Pick<Storage, 'setItem'>

const PERIODS: readonly Period[] = [
	...PRESET_PERIODS.map(([value]) => value),
	'libre',
]

export function formatLocalDateInputValue(date: Date): string {
	// Surtout pas `toISOString()` ici : les bornes sont des jours locaux. En
	// heure d'été française, le passage par UTC peut rendre la veille.
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

function isDateInputValue(value: unknown): value is string {
	if (typeof value !== 'string') return false
	if (value === '') return true
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

	const [year, month, day] = value.split('-').map(Number)
	const date = new Date(year, month - 1, day)
	return (
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day
	)
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

export function computeDateRange(period: PresetPeriod): {
	from: string
	to: string
} {
	const today = new Date()
	const to = formatLocalDateInputValue(today)

	if (period === 'toutes') return { from: '', to: '' }

	if (period === 'semaine-en-cours') {
		const monday = new Date(today)
		const day = today.getDay() === 0 ? 7 : today.getDay()
		monday.setDate(today.getDate() - (day - 1))
		return { from: formatLocalDateInputValue(monday), to }
	}

	if (period === 'mois-en-cours') {
		return {
			from: formatLocalDateInputValue(
				new Date(today.getFullYear(), today.getMonth(), 1),
			),
			to,
		}
	}

	if (period === 'annee-en-cours') {
		return {
			from: formatLocalDateInputValue(new Date(today.getFullYear(), 0, 1)),
			to,
		}
	}

	const from = new Date(today)
	from.setDate(from.getDate() - (period === 'quatre-vingt-dix-jours' ? 89 : 29))
	return { from: formatLocalDateInputValue(from), to }
}

function preferenceForPreset(period: PresetPeriod): PeriodPreference {
	return { period, ...computeDateRange(period) }
}

function defaultPreference(defaultPeriod: PresetPeriod): PeriodPreference {
	return preferenceForPreset(defaultPeriod)
}

function migrateLegacyPeriod(value: string): PresetPeriod | undefined {
	if (value === 'all') return 'toutes'
	if (value === 'sept-jours' || value === 'this_week') {
		return 'semaine-en-cours'
	}
	if (value === 'this_month') return 'mois-en-cours'
	if (value === 'this_year') return 'annee-en-cours'
	return undefined
}

export function readPeriodPreference(
	storage: PeriodReader | undefined,
	key: string,
	defaultPeriod: PresetPeriod,
): PeriodPreference {
	const fallback = defaultPreference(defaultPeriod)

	try {
		const stored = storage?.getItem(key)
		if (!stored) return fallback

		const legacy = migrateLegacyPeriod(stored)
		if (legacy) return preferenceForPreset(legacy)
		if (isPeriod(stored) && stored !== 'libre') {
			return preferenceForPreset(stored)
		}

		const parsed = JSON.parse(stored) as Partial<PeriodPreference>
		const migratedPeriod =
			typeof parsed.period === 'string'
				? migrateLegacyPeriod(parsed.period)
				: undefined
		if (migratedPeriod) return preferenceForPreset(migratedPeriod)
		if (!isPeriod(parsed.period)) return fallback

		if (parsed.period !== 'libre') {
			// Une présélection reste relative à aujourd'hui : on mémorise le choix,
			// pas les dates devenues anciennes depuis la dernière ouverture.
			return preferenceForPreset(parsed.period)
		}

		if (!isDateInputValue(parsed.from) || !isDateInputValue(parsed.to)) {
			return fallback
		}
		if (parsed.from && parsed.to && parsed.from > parsed.to) return fallback

		return {
			period: 'libre',
			from: parsed.from,
			to: parsed.to,
		}
	} catch {
		return fallback
	}
}

export function writePeriodPreference(
	storage: PeriodWriter | undefined,
	key: string,
	preference: PeriodPreference,
): void {
	try {
		// Ceci est uniquement une préférence d'affichage (présélection ou deux
		// jours saisis), jamais une donnée commerciale ou nominative. Elle reste
		// donc distincte du cache TanStack Query et n'élargit pas CLES_PERSISTEES.
		storage?.setItem(key, JSON.stringify(preference))
	} catch {
		// Un stockage indisponible (poste verrouillé, quota, navigation privée)
		// ne doit jamais empêcher l'écran de fonctionner.
	}
}

export function usePeriodFilter(
	defaultPeriod: PresetPeriod = 'trente-jours',
	preferenceKey?: string,
) {
	const [preference, setPreference] = useState<PeriodPreference>(() =>
		preferenceKey
			? readPeriodPreference(localPeriodStorage(), preferenceKey, defaultPeriod)
			: defaultPreference(defaultPeriod),
	)

	useEffect(() => {
		if (preferenceKey) {
			writePeriodPreference(localPeriodStorage(), preferenceKey, preference)
		}
	}, [preference, preferenceKey])

	const setPeriod = useCallback((period: PresetPeriod) => {
		setPreference(preferenceForPreset(period))
	}, [])

	const setDateFrom = useCallback((from: string) => {
		setPreference((current) => ({ ...current, period: 'libre', from }))
	}, [])

	const setDateTo = useCallback((to: string) => {
		setPreference((current) => ({ ...current, period: 'libre', to }))
	}, [])

	const dateRange = useMemo<DateRangeStrings>(
		() => ({
			from: preference.from || undefined,
			to: preference.to || undefined,
		}),
		[preference.from, preference.to],
	)

	return {
		period: preference.period,
		setPeriod,
		setDateFrom,
		setDateTo,
		dateRange,
	}
}
