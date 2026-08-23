// frontend/lib/queries/integrity-verdict.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// GARDIEN — la règle de vérification d'intégrité est UNE, et elle distingue
// trois issues qui n'ont pas le même remède :
//   1. hash recalculé ≠ hash stocké      → altération       → INVALIDE
//   2. previous_hash ≠ hash du précédent → rupture de chaîne → INVALIDE
//   3. précédent inexistant              → discontinuité     → AVERTISSEMENT
//
// Avant le 23/08/2026, useIntegritySummary comptait le cas 3 invalide et
// useVerifyInvoiceChain le laissait valide : le même écran affichait deux
// chiffres. Les trois vérifications passent désormais par
// evaluateDocumentIntegrity ; ce test tient la règle.
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ L'import est DYNAMIQUE, et c'est forcé : `closures.ts` importe
// `use-pocketbase.ts`, qui construit un client au chargement du module et lit
// `window`. Un import statique lèverait avant le premier test. Même parade que
// `catalog-fields.test.ts`.

import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { beforeAll, describe, expect, it } from 'vitest'

type ClosuresModule = typeof import('./closures')

let GENESIS_HASH = ''
let computeDocumentHash: ClosuresModule['computeDocumentHash']
let evaluateDocumentIntegrity: ClosuresModule['evaluateDocumentIntegrity']
let isDraftDocument: ClosuresModule['isDraftDocument']

beforeAll(async () => {
	const g = globalThis as any
	g.window ??= g
	g.document ??= { location: { origin: 'http://127.0.0.1:8090' } }

	const mod = await import('./closures')
	GENESIS_HASH = mod.GENESIS_HASH
	computeDocumentHash = mod.computeDocumentHash
	evaluateDocumentIntegrity = mod.evaluateDocumentIntegrity
	isDraftDocument = mod.isDraftDocument
})

function makeDoc(overrides: Partial<InvoiceResponse> = {}): InvoiceResponse {
	return {
		id: 'doc1',
		customer: 'cust1',
		date: '2026-08-23 10:00:00.000Z',
		fiscal_year: 2026,
		invoice_type: 'invoice',
		number: 'FAC-2026-000001',
		owner_company: 'co1',
		previous_hash: GENESIS_HASH,
		sequence_number: 1,
		total_ht: 100,
		total_tva: 20,
		total_ttc: 120,
		hash: '',
		...overrides,
	} as unknown as InvoiceResponse
}

/** Rend le document avec le hash que la règle attend de lui. */
async function sealed(
	overrides: Partial<InvoiceResponse> = {},
): Promise<InvoiceResponse> {
	const doc = makeDoc(overrides)
	doc.hash = await computeDocumentHash(doc)
	return doc
}

const noPredecessor = async () => undefined

describe('evaluateDocumentIntegrity', () => {
	it('valide un document intact en tête de chaîne', async () => {
		const doc = await sealed()
		const verdict = await evaluateDocumentIntegrity(doc, noPredecessor)

		expect(verdict.hashValid).toBe(true)
		expect(verdict.chainValid).toBe(true)
		expect(verdict.sequenceGap).toBe(false)
		expect(verdict.errors).toHaveLength(0)
	})

	it('déclare INVALIDE un document dont le hash ne correspond plus', async () => {
		const doc = await sealed()
		doc.total_ttc = 999 // altération après scellement

		const verdict = await evaluateDocumentIntegrity(doc, noPredecessor)

		expect(verdict.hashValid).toBe(false)
		expect(verdict.errors.join(' ')).toContain('Hash incorrect')
	})

	it('déclare INVALIDE un premier document sans hash de genèse', async () => {
		const doc = await sealed({ previous_hash: 'a'.repeat(64) })

		const verdict = await evaluateDocumentIntegrity(doc, noPredecessor)

		expect(verdict.chainValid).toBe(false)
		expect(verdict.sequenceGap).toBe(false)
		expect(verdict.errors.join(' ')).toContain('Rupture de chaîne')
	})

	it('déclare INVALIDE un maillon qui ne pointe pas son prédécesseur', async () => {
		const previous = await sealed({ id: 'prev', sequence_number: 4 })
		const doc = await sealed({
			id: 'doc5',
			sequence_number: 5,
			number: 'FAC-2026-000005',
			previous_hash: 'b'.repeat(64),
		})

		const verdict = await evaluateDocumentIntegrity(doc, async () => previous)

		expect(verdict.chainValid).toBe(false)
		expect(verdict.sequenceGap).toBe(false)
		expect(verdict.errors.join(' ')).toContain('Rupture de chaîne')
	})

	it('valide un maillon qui pointe bien son prédécesseur', async () => {
		const previous = await sealed({ id: 'prev', sequence_number: 4 })
		const doc = await sealed({
			id: 'doc5',
			sequence_number: 5,
			number: 'FAC-2026-000005',
			previous_hash: previous.hash,
		})

		const verdict = await evaluateDocumentIntegrity(doc, async () => previous)

		expect(verdict.chainValid).toBe(true)
		expect(verdict.errors).toHaveLength(0)
	})

	it("AVERTIT sans invalider quand le prédécesseur n'existe plus", async () => {
		// Cas réel : FAC-2025-000004 porte le numéro d'ordre 5, les documents 3
		// et 4 ont été supprimés avant décembre 2025. Son hash est intact.
		const doc = await sealed({
			id: 'doc5',
			sequence_number: 5,
			number: 'FAC-2025-000004',
			previous_hash: GENESIS_HASH,
		})

		const verdict = await evaluateDocumentIntegrity(doc, noPredecessor)

		expect(verdict.hashValid).toBe(true)
		expect(verdict.sequenceGap).toBe(true)
		expect(verdict.chainValid).toBe(true) // ⚠️ ne JAMAIS passer à false ici
		expect(verdict.errors).toHaveLength(0)
		expect(verdict.warnings.join(' ')).toContain('Discontinuité de séquence')
	})

	it('ne confond pas discontinuité et rupture', async () => {
		const orphan = await sealed({ sequence_number: 5, number: 'A' })
		const broken = await sealed({
			sequence_number: 5,
			number: 'B',
			previous_hash: 'c'.repeat(64),
		})
		const previous = await sealed({ id: 'prev', sequence_number: 4 })

		const gap = await evaluateDocumentIntegrity(orphan, noPredecessor)
		const brk = await evaluateDocumentIntegrity(broken, async () => previous)

		expect(gap.sequenceGap).toBe(true)
		expect(gap.chainValid).toBe(true)
		expect(brk.sequenceGap).toBe(false)
		expect(brk.chainValid).toBe(false)
	})
})

describe('isDraftDocument', () => {
	it('reconnaît un brouillon', () => {
		expect(isDraftDocument({ status: 'draft' })).toBe(true)
	})

	it('ne reconnaît pas un document validé, envoyé ou sans statut', () => {
		expect(isDraftDocument({ status: 'validated' })).toBe(false)
		expect(isDraftDocument({ status: 'sent' })).toBe(false)
		expect(isDraftDocument({})).toBe(false)
	})
})
