// frontend/lib/hooks/usePeriodFilter.ts

import { useMemo, useState } from 'react'

export type Period =
	| 'all'
	| 'this_week'
	| 'last_week'
	| 'this_month'
	| 'last_month'
	| 'this_quarter'
	| 'this_year'

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

export function usePeriodFilter(defaultPeriod: Period = 'this_month') {
	const [period, setPeriod] = useState<Period>(defaultPeriod)
	const dateRange = useMemo(() => computeDateRange(period), [period])
	return { period, setPeriod, dateRange }
}
