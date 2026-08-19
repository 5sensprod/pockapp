// frontend/modules/site/lib/catalog-edit.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// LA SAISIE ÉDITORIALE — cas vérifiés
// ═══════════════════════════════════════════════════════════════════════════
// `pnpm test`
//
// Le titre possède sa logique propre ; la description ne le remplace jamais.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest'
import {
	DESCRIPTION_MAX,
	NAME_MAX,
	isUnchanged,
	validateEditorial,
} from './catalog-edit'

describe('validateEditorial', () => {
	it('refuse un titre vide', () => {
		expect(validateEditorial({ name: '   ', description: '' }).ok).toBe(false)
	})

	it('rogne le titre et la description', () => {
		const result = validateEditorial({
			name: '  Ukulélé soprano  ',
			description: '  Un bel instrument.\n',
		})

		expect(result).toEqual({
			ok: true,
			patch: { name: 'Ukulélé soprano', description: 'Un bel instrument.' },
		})
	})

	it('accepte une description vide', () => {
		const result = validateEditorial({ description: '   ' })

		expect(result).toEqual({ ok: true, patch: { description: '' } })
	})

	it('refuse au-delà de la longueur du schéma', () => {
		expect(
			validateEditorial({ name: 'a'.repeat(NAME_MAX + 1), description: '' }).ok,
		).toBe(false)
		expect(
			validateEditorial({ description: 'a'.repeat(DESCRIPTION_MAX + 1) }).ok,
		).toBe(false)
	})
})

describe('isUnchanged', () => {
	it('reconnaît une saisie identique à l’existant', () => {
		expect(
			isUnchanged(
				{ name: 'Ukulélé', description: 'Un bel instrument.' },
				{ name: 'Ukulélé', description: 'Un bel instrument.' },
			),
		).toBe(true)
	})

	it('traite un champ absent en base comme une chaîne vide', () => {
		// Les `fields` de la lecture ne rendent pas les champs vides : sans cette
		// équivalence, toute fiche sans description partirait en écriture au
		// premier passage dans l’éditeur.
		expect(isUnchanged({ description: '' }, {})).toBe(true)
	})

	it('voit un changement de description', () => {
		expect(
			isUnchanged({ description: 'neuf' }, { description: 'ancien' }),
		).toBe(false)
	})
})
