// frontend/lib/invoices/next-action.test.ts
//
// Les treize états, un cas chacun, plus les trois invariants sur TOUS.
// Ce que gardent ces assertions : qu'aucun état de facture ne laisse l'écran
// sans réponse à « que dois-je faire maintenant ? ».

import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { describe, expect, it } from 'vitest'
import { computeInvoiceSummary } from './dossier-summary'
import {
	ACTIONS_QUI_FONT_AVANCER,
	type NextActionResolution,
	resolveNextAction,
} from './next-action'

const facture = (patch: Partial<InvoiceResponse> = {}): InvoiceResponse =>
	({
		id: 'inv1',
		number: 'FAC-2026-000001',
		invoice_type: 'invoice',
		status: 'validated',
		is_paid: false,
		is_pos_ticket: false,
		converted_to_invoice: false,
		total_ttc: 1200,
		total_ht: 1000,
		total_tva: 200,
		currency: 'EUR',
		items: [],
		...patch,
	}) as InvoiceResponse

const acompte = (patch: Partial<InvoiceResponse> = {}): InvoiceResponse =>
	facture({
		id: 'acc1',
		number: 'ACC-2026-000001',
		invoice_type: 'deposit',
		original_invoice_id: 'inv1',
		total_ttc: 360,
		...patch,
	})

/** Construit la résolution comme le fera le hook : synthèse d'abord. */
function resoudre(opts: {
	current: InvoiceResponse
	parent?: InvoiceResponse | null
	deposits?: InvoiceResponse[]
	creditNotes?: InvoiceResponse[]
	balanceInvoice?: InvoiceResponse | null
}): NextActionResolution {
	const parent = opts.parent ?? opts.current
	const deposits = opts.deposits ?? []
	const creditNotes = opts.creditNotes ?? []
	const summary = computeInvoiceSummary({
		current: opts.current,
		parent,
		deposits,
		creditNotes,
	})
	return resolveNextAction({
		current: opts.current,
		parent,
		deposits,
		creditNotes,
		summary,
		balanceInvoice: opts.balanceInvoice ?? null,
	})
}

// ── Les treize états ────────────────────────────────────────────────────────

describe('resolveNextAction — les treize états', () => {
	it('1. brouillon : valider', () => {
		const r = resoudre({ current: facture({ status: 'draft' }) })
		expect(r.state).toBe(1)
		expect(r.primary?.id).toBe('validate')
		// Un brouillon ne s'envoie pas au client : l'email est masqué.
		expect(r.menu.map((a) => a.id)).not.toContain('email')
	})

	it('2. validée sans acompte : encaisser, acompte en secondaire', () => {
		const r = resoudre({ current: facture() })
		expect(r.state).toBe(2)
		expect(r.primary?.id).toBe('collect')
		expect(r.secondary.map((a) => a.id)).toContain('create_deposit')
	})

	it('3. un acompte en attente : le solde reste proposé, grisé et expliqué', () => {
		// Aujourd'hui l'entrée DISPARAÎT sans un mot (InvoiceDetailPage.tsx:226).
		const r = resoudre({
			current: facture({ deposits_total_ttc: 360, balance_due: 840 }),
			deposits: [acompte({ is_paid: false })],
		})
		expect(r.state).toBe(3)
		expect(r.primary?.id).toBe('collect')

		const solde = r.menu.find((a) => a.id === 'generate_balance')
		expect(solde?.disabled).toBe(true)
		expect(solde?.disabledReason).toMatch(/tant que/)
	})

	it('4. acomptes tous encaissés : facturer le solde prime sur encaisser', () => {
		// « Fermer le dossier prime sur l'élargir » : l'acompte descend en
		// secondaire, il ne disparaît pas.
		const r = resoudre({
			current: facture({ deposits_total_ttc: 360, balance_due: 840 }),
			deposits: [acompte({ is_paid: true })],
		})
		expect(r.state).toBe(4)
		expect(r.primary?.id).toBe('generate_balance')
		expect(r.secondary.map((a) => a.id)).toContain('create_deposit')
	})

	it("5. une facture de solde existe : la parente ne s'encaisse plus", () => {
		// Encaisser la parente alors que son solde est émis encaisserait deux
		// fois le même argent.
		const r = resoudre({
			current: facture({ deposits_total_ttc: 360, balance_due: 840 }),
			deposits: [acompte({ is_paid: true })],
			balanceInvoice: facture({ id: 'sol1', number: 'FAC-2026-000002' }),
		})
		expect(r.state).toBe(5)
		expect(r.primary?.id).toBe('open_balance')

		const dep = r.menu.find((a) => a.id === 'create_deposit')
		expect(dep?.disabled).toBe(true)
		expect(dep?.disabledReason).toContain('FAC-2026-000002')
	})

	it('6. soldée : aucun primaire, mais une raison', () => {
		const r = resoudre({ current: facture({ is_paid: true }) })
		expect(r.state).toBe(6)
		expect(r.primary).toBeNull()
		expect(r.absenceReason).toMatch(/soldée/i)
	})

	it("7. avoir couvrant tout : plus rien à encaisser, et on le dit", () => {
		const r = resoudre({
			current: facture({ credit_notes_total: 1200 }),
			creditNotes: [facture({ id: 'av1', invoice_type: 'credit_note' })],
		})
		expect(r.state).toBe(7)
		expect(r.primary).toBeNull()
		expect(r.absenceReason).toMatch(/avoir/i)
	})

	it('8. acompte non encaissé : encaisser', () => {
		const parent = facture()
		const r = resoudre({
			current: acompte({ is_paid: false }),
			parent,
			deposits: [acompte({ is_paid: false })],
		})
		expect(r.state).toBe(8)
		expect(r.primary?.id).toBe('collect')
		expect(r.secondary.map((a) => a.id)).toContain('open_parent')
	})

	it("9. acompte encaissé : retour à la facture en secondaire, pas enfoui", () => {
		const parent = facture()
		const r = resoudre({
			current: acompte({ is_paid: true }),
			parent,
			deposits: [acompte({ is_paid: true })],
		})
		expect(r.state).toBe(9)
		expect(r.primary).toBeNull()
		expect(r.secondary.map((a) => a.id)).toContain('open_parent')
		expect(r.menu.map((a) => a.id)).toContain('refund_deposit')
	})

	it('10. avoir : rien à encaisser ni à modifier', () => {
		const r = resoudre({
			current: facture({
				id: 'av1',
				invoice_type: 'credit_note',
				original_invoice_id: 'inv1',
			}),
		})
		expect(r.state).toBe(10)
		expect(r.primary).toBeNull()
		expect(r.absenceReason).toMatch(/scellé/)
	})

	it('11. ticket non converti : convertir', () => {
		const r = resoudre({
			current: facture({ id: 'tik1', is_pos_ticket: true }),
		})
		expect(r.state).toBe(11)
		expect(r.primary?.id).toBe('convert')
	})

	it('12. ticket converti : aucun primaire, une raison', () => {
		const r = resoudre({
			current: facture({
				id: 'tik1',
				is_pos_ticket: true,
				converted_to_invoice: true,
			}),
		})
		expect(r.state).toBe(12)
		expect(r.primary).toBeNull()
	})

	it('13. facture de solde : encaissable, et retour à la parente', () => {
		// Aujourd'hui la facture de solde est un cul-de-sac : aucun des deux
		// blocs de lien ne se déclenche sur elle.
		const parent = facture()
		const r = resoudre({
			current: facture({
				id: 'sol1',
				number: 'FAC-2026-000002',
				original_invoice_id: 'inv1',
				total_ttc: 840,
			}),
			parent,
		})
		expect(r.state).toBe(13)
		expect(r.primary?.id).toBe('collect')
		expect(r.secondary.map((a) => a.id)).toContain('open_parent')
	})
})

// ── Les trois invariants, sur tous les états ────────────────────────────────

const tousLesCas = (): NextActionResolution[] => [
	resoudre({ current: facture({ status: 'draft' }) }),
	resoudre({ current: facture() }),
	resoudre({
		current: facture({ deposits_total_ttc: 360 }),
		deposits: [acompte({ is_paid: false })],
	}),
	resoudre({
		current: facture({ deposits_total_ttc: 360, balance_due: 840 }),
		deposits: [acompte({ is_paid: true })],
	}),
	resoudre({
		current: facture({ deposits_total_ttc: 360, balance_due: 840 }),
		deposits: [acompte({ is_paid: true })],
		balanceInvoice: facture({ id: 'sol1' }),
	}),
	resoudre({ current: facture({ is_paid: true }) }),
	resoudre({ current: facture({ credit_notes_total: 1200 }) }),
	resoudre({ current: acompte({ is_paid: false }), parent: facture() }),
	resoudre({ current: acompte({ is_paid: true }), parent: facture() }),
	resoudre({
		current: facture({ invoice_type: 'credit_note', original_invoice_id: 'inv1' }),
	}),
	resoudre({ current: facture({ is_pos_ticket: true }) }),
	resoudre({
		current: facture({ is_pos_ticket: true, converted_to_invoice: true }),
	}),
	resoudre({
		current: facture({ id: 'sol1', original_invoice_id: 'inv1', total_ttc: 840 }),
		parent: facture(),
	}),
]

describe('resolveNextAction — invariants', () => {
	it('1. jamais d’écran muet : primaire nul implique une raison', () => {
		for (const r of tousLesCas()) {
			if (r.primary === null) {
				expect(r.absenceReason, `état ${r.state}`).toBeTruthy()
			}
		}
	})

	it('2. le primaire fait avancer le dossier — jamais PDF ni un avoir', () => {
		for (const r of tousLesCas()) {
			if (r.primary) {
				expect(
					ACTIONS_QUI_FONT_AVANCER,
					`état ${r.state} : ${r.primary.id}`,
				).toContain(r.primary.id)
			}
		}
	})

	it('3. au plus deux secondaires, et PDF y figure toujours', () => {
		for (const r of tousLesCas()) {
			expect(r.secondary.length, `état ${r.state}`).toBeLessThanOrEqual(2)
			expect(r.secondary.map((a) => a.id), `état ${r.state}`).toContain('pdf')
		}
	})

	it('4. une action désactivée porte toujours son explication', () => {
		for (const r of tousLesCas()) {
			for (const a of [...r.secondary, ...r.menu, r.primary]) {
				if (a?.disabled) {
					expect(a.disabledReason, `${r.state}/${a.id}`).toBeTruthy()
				}
			}
		}
	})

	it('5. les treize états sont tous atteints', () => {
		const atteints = new Set(tousLesCas().map((r) => r.state))
		expect([...atteints].sort((a, b) => a - b)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
		])
	})
})

// ── Les deux corrections du §16 ─────────────────────────────────────────────

describe('§16 — corrections vérifiées dans le code serveur', () => {
	it("un avoir PARTIEL ne bloque plus l'encaissement du reste", () => {
		// backend/pay.go:66-78 n'a jamais refusé d'encaisser une facture qui
		// porte un avoir. Le blocage était InvoiceDetailHeader.tsx:264, et il
		// tombait dès le premier avoir, fût-il de 50 € sur 1 200 €.
		const r = resoudre({
			current: facture({ credit_notes_total: 50 }),
			creditNotes: [facture({ id: 'av1', invoice_type: 'credit_note' })],
		})
		expect(r.primary?.id).toBe('collect')
		expect(r.state).toBe(2)
	})

	it("un avoir couvrant TOUT retire l'encaissement, par le reste à payer", () => {
		const r = resoudre({ current: facture({ credit_notes_total: 1200 }) })
		expect(r.primary).toBeNull()
	})
})
