// frontend/modules/stick/labels/utils/barcodeText.test.ts
//
// Ce que garde ce fichier : le groupement du numéro n'AJOUTE ni ne RETIRE
// aucun chiffre. Un code-barres mal transcrit sous les barres est pire qu'un
// code-barres sans texte — un vendeur le recopie, un client le lit.

import { describe, expect, it } from 'vitest'
// Module porté d'AppPos, encore en JavaScript : `allowJs` en infère les types.
import { formaterTexteCodeBarres } from './barcodeText'

const chiffres = (s: string) => s.replace(/\D/g, '')

describe('formaterTexteCodeBarres', () => {
	it('ne touche à rien sans format, ou en format brut', () => {
		expect(formaterTexteCodeBarres('3760123456789', 'brut')).toBeUndefined()
		expect(formaterTexteCodeBarres('3760123456789', undefined)).toBeUndefined()
	})

	it('groupe un EAN-13 en 1 · 6 · 6', () => {
		expect(formaterTexteCodeBarres('3760123456789', 'ean13')).toBe(
			'3 760123 456789',
		)
	})

	it('laisse intact un numéro qui n’est PAS un EAN-13', () => {
		// 12 chiffres : lui appliquer la découpe 1·6·6 en perdrait un.
		expect(formaterTexteCodeBarres('376012345678', 'ean13')).toBe(
			'376012345678',
		)
	})

	it('groupe un EAN-8 en 4 · 4', () => {
		expect(formaterTexteCodeBarres('96385074', 'ean8')).toBe('9638 5074')
	})

	it('groupe par 3, par 4, et avec des tirets', () => {
		expect(formaterTexteCodeBarres('123456789', 'groupes3')).toBe('123 456 789')
		expect(formaterTexteCodeBarres('1234567890', 'groupes4')).toBe(
			'1234 5678 90',
		)
		expect(formaterTexteCodeBarres('1234567890', 'tirets4')).toBe(
			'1234-5678-90',
		)
	})

	it('AUCUN groupement ne change les chiffres', () => {
		const valeur = '3760123456789'
		for (const format of ['ean13', 'groupes3', 'groupes4', 'tirets4']) {
			const rendu = formaterTexteCodeBarres(valeur, format) ?? valeur
			expect(chiffres(rendu)).toBe(valeur)
		}
	})

	it('ne rend rien pour une valeur vide, quel que soit le format', () => {
		expect(formaterTexteCodeBarres('', 'ean13')).toBeUndefined()
		expect(formaterTexteCodeBarres(null, 'groupes4')).toBeUndefined()
	})
})
