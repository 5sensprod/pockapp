// frontend/lib/queries/legacy-key.test.ts
//
// `pnpm test`
//
// Ce qui est gardé ici : la forme de la clé. Elle devient une clé primaire dans
// la base SQL du site, et rien d'autre ne la vérifie — le serveur se contente
// d'exiger une chaîne non vide (§4.1 du contrat).

import { describe, expect, it } from 'vitest'
import {
	POCKETAPP_KEY_PREFIX,
	isPocketAppKey,
	newLegacyKey,
} from './legacy-key'

describe('newLegacyKey', () => {
	it('porte le préfixe PocketApp', () => {
		expect(newLegacyKey().startsWith(POCKETAPP_KEY_PREFIX)).toBe(true)
	})

	it('tient dans les 50 caractères du schéma', () => {
		// `catalog_v2.go` plafonne `legacy_id` à 50. Une clé plus longue serait
		// refusée à la création, donc au premier produit créé dans l'application.
		expect(newLegacyKey().length).toBeLessThanOrEqual(50)
	})

	it('ne produit pas deux fois la même clé', () => {
		const keys = new Set(Array.from({ length: 500 }, () => newLegacyKey()))

		expect(keys.size).toBe(500)
	})

	it('n’emploie que des caractères sûrs pour une URL et une clé SQL', () => {
		expect(newLegacyKey()).toMatch(/^pa_[a-z0-9]{16}$/)
	})
})

describe('isPocketAppKey', () => {
	it('distingue une clé PocketApp d’un identifiant NeDB', () => {
		expect(isPocketAppKey(newLegacyKey())).toBe(true)
		// Forme réelle d'un identifiant NeDB, lu dans le catalogue.
		expect(isPocketAppKey('zXcMvjNmvWAoQJqN')).toBe(false)
	})

	it('traite l’absence de clé comme non-PocketApp', () => {
		expect(isPocketAppKey(undefined)).toBe(false)
		expect(isPocketAppKey('')).toBe(false)
	})
})
