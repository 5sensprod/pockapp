// frontend/lib/hooks/useEtatPersistant.test.ts

import { describe, expect, it } from 'vitest'

import {
	PREFIXE_ETAT_PERSISTANT,
	lireEtatPersistant,
} from './useEtatPersistant'

function stockage(entrees: Record<string, string>) {
	return {
		getItem: (cle: string) => entrees[cle] ?? null,
	}
}

const cle = (suffixe: string) => PREFIXE_ETAT_PERSISTANT + suffixe

describe('lireEtatPersistant', () => {
	it('rend la valeur initiale quand rien n’a été écrit', () => {
		expect(lireEtatPersistant(stockage({}), 'x', 'depart')).toBe('depart')
	})

	it('relit ce qui a été écrit', () => {
		const s = stockage({ [cle('x')]: JSON.stringify({ v: 'garde' }) })
		expect(lireEtatPersistant(s, 'x', 'depart')).toBe('garde')
	})

	// L'enveloppe existe pour ce cas : un état optionnel écrit `undefined`, et
	// `JSON.stringify(undefined)` ne rend pas du JSON.
	it('relit `undefined` sans le confondre avec une absence', () => {
		const s = stockage({ [cle('statut')]: JSON.stringify({ v: undefined }) })
		expect(lireEtatPersistant(s, 'statut', 'draft')).toBeUndefined()
	})

	it('rejette une valeur que le validateur refuse', () => {
		const s = stockage({ [cle('page')]: JSON.stringify({ v: 0 }) })
		const valide = (v: unknown) => typeof v === 'number' && v >= 1
		expect(lireEtatPersistant(s, 'page', 1, valide)).toBe(1)
	})

	it('rejette du JSON cassé sans lever', () => {
		const s = stockage({ [cle('x')]: '{pas du json' })
		expect(lireEtatPersistant(s, 'x', 'depart')).toBe('depart')
	})

	it('rejette une valeur écrite sans enveloppe par une version antérieure', () => {
		const s = stockage({ [cle('x')]: JSON.stringify('nu') })
		expect(lireEtatPersistant(s, 'x', 'depart')).toBe('depart')
	})
})
