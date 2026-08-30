// frontend/lib/invoices/dossier-summary.test.ts
//
// Ces assertions gardent des règles qui ont chacune coûté une vérification dans
// le code, et dont deux étaient FAUSSES dans l'écran actuel. Les défaire, c'est
// réafficher au comptoir un montant qui n'a pas été encaissé.

import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { describe, expect, it } from 'vitest'
import { resolveDossierId, resolveDossierRole } from './dossier-id'
import { computeInvoiceSummary } from './dossier-summary'

const facture = (patch: Partial<InvoiceResponse> = {}): InvoiceResponse =>
	({
		id: 'inv1',
		number: 'FAC-2026-000001',
		invoice_type: 'invoice',
		status: 'validated',
		is_paid: false,
		is_pos_ticket: false,
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
		total_ttc: 180,
		...patch,
	})

describe('computeInvoiceSummary', () => {
	it('rend le reste à payer du cas de référence : 1200 − 360 − 100 = 740', () => {
		const parent = facture({ credit_notes_total: 100 })
		const s = computeInvoiceSummary({
			current: parent,
			parent,
			deposits: [
				acompte({ id: 'a1', is_paid: true }),
				acompte({ id: 'a2', is_paid: true }),
			],
			creditNotes: [facture({ id: 'av1', invoice_type: 'credit_note' })],
		})

		expect(s.depositsCollectedTtc).toBe(360)
		expect(s.creditNotesTtc).toBe(100)
		expect(s.remainingTtc).toBe(740)
	})

	it("ne déduit PAS un acompte émis non encaissé, et le porte hors du calcul", () => {
		const parent = facture()
		const s = computeInvoiceSummary({
			current: parent,
			parent,
			deposits: [
				acompte({ id: 'a1', is_paid: true }),
				acompte({ id: 'a2', is_paid: false }),
			],
			creditNotes: [],
		})

		// La TVA sur acompte est exigible à l'encaissement : un acompte émis
		// n'a rien encaissé, il ne peut pas réduire ce que le client doit.
		expect(s.depositsCollectedTtc).toBe(180)
		expect(s.depositsPendingTtc).toBe(180)
		expect(s.remainingTtc).toBe(1020)

		const pending = s.lines.find((l) => l.key === 'deposits_pending')
		expect(pending?.belowLine).toBe(true)
	})

	it("ne compte PAS un acompte remboursé, qui garde pourtant is_paid", () => {
		// La route réellement appelée par le front
		// (backend/routes/deposit_routes.go:241) pose has_credit_note sans
		// toucher is_paid. Filtrer sur le seul is_paid rendrait l'argent
		// ressorti comme encaissé.
		const parent = facture()
		const s = computeInvoiceSummary({
			current: parent,
			parent,
			deposits: [
				acompte({ id: 'a1', is_paid: true }),
				acompte({ id: 'a2', is_paid: true, has_credit_note: true }),
			],
			creditNotes: [],
		})

		expect(s.depositsCollectedTtc).toBe(180)
		expect(s.depositsPendingTtc).toBe(0)
		expect(s.remainingTtc).toBe(1020)
	})

	it('somme la LISTE des acomptes, jamais deposits_total_ttc', () => {
		// Le champ est volontairement incohérent : il porte 999, la liste 180.
		// C'est le cas réel — le champ change de sémantique selon le chemin
		// d'écriture d'un avoir.
		const parent = facture({ deposits_total_ttc: 999, balance_due: 201 })
		const s = computeInvoiceSummary({
			current: parent,
			parent,
			deposits: [acompte({ id: 'a1', is_paid: true })],
			creditNotes: [],
		})

		expect(s.depositsCollectedTtc).toBe(180)
		expect(s.remainingTtc).toBe(1020)
	})

	it("n'additionne pas les avoirs listés à credit_notes_total", () => {
		// credit_notes_total est tenu par le serveur et ne couvre que les
		// avoirs frappant CE document ; un avoir sur acompte est déjà absorbé
		// par l'exclusion de l'acompte. Les sommer déduirait deux fois.
		const parent = facture({ credit_notes_total: 100 })
		const s = computeInvoiceSummary({
			current: parent,
			parent,
			deposits: [],
			creditNotes: [
				facture({ id: 'av1', invoice_type: 'credit_note', total_ttc: -100 }),
			],
		})

		expect(s.creditNotesTtc).toBe(100)
		expect(s.remainingTtc).toBe(1100)
	})

	it('ne descend jamais sous zéro et ne produit aucune ligne à zéro', () => {
		const parent = facture({ credit_notes_total: 1200 })
		const s = computeInvoiceSummary({
			current: parent,
			parent,
			deposits: [acompte({ id: 'a1', is_paid: true })],
			creditNotes: [],
		})

		expect(s.remainingTtc).toBe(0)
		expect(s.lines.every((l) => l.key === 'remaining' || l.amount > 0)).toBe(
			true,
		)
	})

	it("encaisse un acompte pour SON montant, la parente pour ce qu'il reste", () => {
		const parent = facture()
		const dep = acompte({ is_paid: false })

		const vuParente = computeInvoiceSummary({
			current: parent,
			parent,
			deposits: [dep],
			creditNotes: [],
		})
		const vuAcompte = computeInvoiceSummary({
			current: dep,
			parent,
			deposits: [dep],
			creditNotes: [],
		})

		expect(vuParente.amountToCollectTtc).toBe(1200)
		expect(vuAcompte.amountToCollectTtc).toBe(180)
	})

	it('se déclare non résolu tant que le dossier n’a pas répondu', () => {
		// Un zéro affiché est indiscernable d'un dossier soldé : la vue doit
		// pouvoir montrer un squelette.
		const parent = facture()
		const s = computeInvoiceSummary({
			current: parent,
			parent,
			deposits: [],
			creditNotes: [],
			isResolved: false,
		})

		expect(s.isResolved).toBe(false)
	})
})

describe('resolveDossierRole / resolveDossierId', () => {
	it('une facture de solde interroge sa PARENTE, pas elle-même', () => {
		// Sans cela, /deposits répond 200 avec un dossier vide : la facture de
		// solde n'affiche ni ses acomptes, ni de retour vers sa parente.
		const solde = facture({ id: 'sol1', original_invoice_id: 'inv1' })

		expect(resolveDossierRole(solde)).toBe('balance')
		expect(resolveDossierId(solde)).toBe('inv1')
	})

	it('résout les quatre autres natures de document', () => {
		const parent = facture({ id: 'inv1' })
		expect(resolveDossierRole(parent)).toBe('parent')
		expect(resolveDossierId(parent)).toBe('inv1')

		const dep = acompte()
		expect(resolveDossierRole(dep)).toBe('deposit')
		expect(resolveDossierId(dep)).toBe('inv1')

		const avoir = facture({
			id: 'av1',
			invoice_type: 'credit_note',
			original_invoice_id: 'inv1',
		})
		expect(resolveDossierRole(avoir)).toBe('credit_note')
		expect(resolveDossierId(avoir)).toBe('inv1')

		// Un ticket ne porte jamais d'acompte : l'interroger est un appel pour
		// rien, et c'est un appel que la page fait aujourd'hui.
		const ticket = facture({ id: 'tik1', is_pos_ticket: true })
		expect(resolveDossierRole(ticket)).toBe('ticket')
		expect(resolveDossierId(ticket)).toBeUndefined()
	})
})

describe("une facture réglée ne doit plus rien", () => {
	it("n'affiche pas « Reste à payer » égal au total sur une facture payée", () => {
		// Vu à l'écran le 30 août 2026 : facture de 681,30 € encaissée le 25/08
		// en deux moyens, affichant « Reste à payer 681,30 € » — pendant que la
		// zone d'action, elle, annonçait « Facture soldée ». La synthèse ne
		// regardait pas `is_paid` : sans acompte ni avoir, sa soustraction
		// rendait le total.
		const parent = facture({ is_paid: true, total_ttc: 681.3 })
		const s = computeInvoiceSummary({
			current: parent,
			parent,
			deposits: [],
			creditNotes: [],
		})

		expect(s.remainingTtc).toBe(0)
		expect(s.amountToCollectTtc).toBe(0)

		// Et on ne montre pas une soustraction dont le résultat est zéro :
		// on dit ce qui a été encaissé.
		const derniere = s.lines.find((l) => l.key === 'remaining')
		expect(derniere?.label).toBe('Déjà encaissé')
		expect(derniere?.amount).toBe(681.3)
	})

	it('reste cohérente sur une facture réglée APRÈS acomptes', () => {
		const parent = facture({ is_paid: true, total_ttc: 1200 })
		const s = computeInvoiceSummary({
			current: parent,
			parent,
			deposits: [acompte({ id: 'a1', is_paid: true })],
			creditNotes: [],
		})

		expect(s.remainingTtc).toBe(0)
		// Ici la soustraction garde du sens : l'acompte s'affiche.
		expect(s.lines.find((l) => l.key === 'deposits_collected')).toBeTruthy()
		expect(s.lines.find((l) => l.key === 'remaining')?.label).toBe(
			'Reste à payer',
		)
	})

	it("un acompte NON réglé reste dû, même si sa parente est payée", () => {
		// Le document courant est l'acompte : c'est lui qui s'encaisse.
		const parent = facture({ is_paid: true })
		const dep = acompte({ is_paid: false })
		const s = computeInvoiceSummary({
			current: dep,
			parent,
			deposits: [dep],
			creditNotes: [],
		})

		expect(s.amountToCollectTtc).toBe(180)
	})
})
