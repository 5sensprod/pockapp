import { describe, expect, it } from 'vitest'
import { resolvePaymentMethodLabel } from './formatters'

const paymentMethods = [
	{ code: 'pass_culture', name: 'Pass Culture' },
	{ code: 'card', name: 'Carte bancaire' },
]

describe('resolvePaymentMethodLabel', () => {
	it('résout un code configuré dans payment_methods', () => {
		expect(resolvePaymentMethodLabel('pass_culture', undefined, paymentMethods)).toBe(
			'Pass Culture',
		)
	})

	it('conserve le vocabulaire legacy', () => {
		expect(resolvePaymentMethodLabel('cb')).toBe('Carte bancaire')
	})

	it('privilégie le libellé scellé du document', () => {
		expect(
			resolvePaymentMethodLabel('card', 'Ancien libellé', paymentMethods),
		).toBe('Ancien libellé')
	})

	it('laisse un code inconnu lisible sans faire échouer le rendu', () => {
		expect(resolvePaymentMethodLabel('moyen_inconnu', undefined, paymentMethods)).toBe(
			'moyen_inconnu',
		)
	})
})
