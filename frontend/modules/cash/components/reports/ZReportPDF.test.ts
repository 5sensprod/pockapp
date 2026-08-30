import { describe, expect, it } from 'vitest'
import { formatZCurrency } from './ZReportPDF'

describe('formatZCurrency', () => {
	it('utilise un espace insécable compatible Helvetica comme séparateur de milliers', () => {
		expect(formatZCurrency(1350.56)).toBe('1\u00A0350,56 €')
	})
})
