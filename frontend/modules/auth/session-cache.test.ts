// frontend/modules/auth/session-cache.test.ts
// `pnpm test`
//
// Garde la règle de `session-cache.ts` : à la connexion, on périme ce qui a été
// lu SANS session, et rien d'autre — surtout pas le catalogue restauré du
// disque, lu par une session précédente.

import { describe, expect, it } from 'vitest'
import { luSansSession } from './session-cache'

const DEPUIS = 1_000

describe('luSansSession', () => {
	it('retient une liste reçue pendant que la session manquait', () => {
		expect(
			luSansSession({ dataUpdatedAt: 1_500, errorUpdatedAt: 0 }, DEPUIS),
		).toBe(true)
	})

	it('retient un échec reçu pendant que la session manquait', () => {
		expect(
			luSansSession({ dataUpdatedAt: 0, errorUpdatedAt: 1_000 }, DEPUIS),
		).toBe(true)
	})

	it('garde une donnée lue avant, par une session précédente', () => {
		expect(
			luSansSession({ dataUpdatedAt: 999, errorUpdatedAt: 0 }, DEPUIS),
		).toBe(false)
	})

	it("ignore une requête qui n'a jamais abouti", () => {
		expect(luSansSession({ dataUpdatedAt: 0, errorUpdatedAt: 0 }, DEPUIS)).toBe(
			false,
		)
	})
})
