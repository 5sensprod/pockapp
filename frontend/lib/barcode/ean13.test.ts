import { describe, expect, it } from 'vitest'

import { calculateEAN13CheckDigit, formatEAN13, validateEAN13 } from './ean13'

describe('EAN-13', () => {
	it('calcule la clé de contrôle', () => {
		expect(calculateEAN13CheckDigit('400638133393')).toBe(1)
		expect(calculateEAN13CheckDigit('000000000000')).toBe(0)
	})

	it('refuse une clé fausse et tout ce qui n’est pas treize chiffres', () => {
		expect(validateEAN13('4006381333931')).toBe(true)
		expect(validateEAN13('4006381333932')).toBe(false)
		expect(validateEAN13('400638133393')).toBe(false)
		expect(validateEAN13('ABCDEFGHIJKLM')).toBe(false)
	})

	it('groupe l’affichage en 1 · 6 · 6 sans changer les chiffres', () => {
		const code = '2000000000008'
		const formatted = formatEAN13(code)
		expect(formatted).toBe('2 000000 000008')
		expect(formatted.replace(/\D/g, '')).toBe(code)
	})
})
