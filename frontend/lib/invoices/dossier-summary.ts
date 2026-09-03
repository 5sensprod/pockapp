// frontend/lib/invoices/dossier-summary.ts
//
// LA synthèse financière d'un dossier de facturation. Un seul lieu de calcul.
//
// Avant ce fichier, la même synthèse était reconstruite à trois endroits avec
// trois formules différentes — InvoiceDetailPage.tsx:153-156, son bloc acomptes
// :541-560, et InvoicePaymentDialog.tsx:113-118. C'est la cause racine des
// libellés qui affirmaient un encaissement non survenu.
//
// Trois règles, arbitrées et vérifiées, qui ne se renégocient pas ici :
//
//  1. Un acompte ÉMIS n'est pas un acompte ENCAISSÉ. La TVA sur acompte est
//     exigible à l'encaissement (CGI art. 269-2-c) ; seuls les acomptes
//     encaissés se déduisent. Les autres s'affichent, hors du calcul.
//
//  2. `deposits_total_ttc` n'est JAMAIS une source. Le champ est incrémenté à
//     la création (backend/deposit.go), puis réécrit différemment selon le
//     chemin d'avoir emprunté : trois sémantiques pour un champ. On somme la
//     liste des acomptes, jamais le champ.
//
//  3. Un acompte REMBOURSÉ garde `is_paid = true`. La route réellement appelée
//     par le front (backend/routes/deposit_routes.go:241) pose
//     `has_credit_note = true` sans toucher `is_paid`. Sans ce second terme,
//     un acompte remboursé serait compté comme encaissé.
//
// Aucun recalcul de TVA ici : cette fonction ne manipule que du TTC. Le HT, la
// TVA et leur ventilation restent portés par le document.
//
// Voir frontend/modules/connect/PocketConnect-docs/01-audit-detail-facture.md
// §10, §13, §14 et §16.

import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { type DossierRole, resolveDossierRole } from './dossier-id'

export type { DossierRole }

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Une ligne de la synthèse. Les libellés sont FIGÉS (glossaire §12) : la vue
 * les rend tels quels, elle ne les reformule pas.
 */
export interface SummaryLine {
	readonly key:
		| 'total'
		| 'deposits_collected'
		| 'credit_notes'
		| 'remaining'
		| 'deposits_pending'
	readonly label: string
	readonly amount: number
	readonly sign: '+' | '-' | '='
	readonly count?: number
	/** Vrai pour `deposits_pending` seulement : sous le trait, hors du calcul. */
	readonly belowLine: boolean
}

export interface InvoiceFinancialSummary {
	readonly role: DossierRole
	readonly currency: string

	/** Total TTC émis du DOSSIER — celui de la parente, pas du document ouvert. */
	readonly totalTtc: number
	/** Σ des acomptes où `is_paid && !has_credit_note`. */
	readonly depositsCollectedTtc: number
	readonly depositsCollectedCount: number
	/** Σ des acomptes émis non encaissés. Hors soustraction. */
	readonly depositsPendingTtc: number
	readonly depositsPendingCount: number
	/** Avoirs frappant la parente. Un avoir sur acompte est déjà absorbé. */
	readonly creditNotesTtc: number
	readonly creditNotesCount: number
	/** total − acomptes encaissés − avoirs. Le seul chiffre annoncé au client. */
	readonly remainingTtc: number

	/**
	 * Ce qui peut encore être REMBOURSÉ : total − avoirs déjà émis.
	 * À ne pas confondre avec `remainingTtc`, qui tombe à zéro dès que le
	 * document est réglé — c'est précisément le cas où l'on rembourse.
	 */
	readonly refundableTtc: number

	/** Le montant que l'encaissement doit demander pour CE document. */
	readonly amountToCollectTtc: number

	/** Ni acompte ni avoir : la synthèse peut se réduire à une ligne. */
	readonly isTrivial: boolean

	/** Les lignes à rendre, dans l'ordre, sans zéro. La vue ne calcule rien. */
	readonly lines: readonly SummaryLine[]

	/**
	 * Faux tant que le dossier n'a pas répondu. La vue affiche alors un
	 * squelette — jamais un zéro, indiscernable d'un dossier soldé.
	 */
	readonly isResolved: boolean
}

export interface DossierInputs {
	readonly current: InvoiceResponse
	/** La parente. Vaut `current` pour un rôle 'parent' ou 'ticket'. */
	readonly parent: InvoiceResponse | null
	readonly deposits: readonly InvoiceResponse[]
	readonly creditNotes: readonly InvoiceResponse[]
	/** Faux tant que la requête dossier n'a pas abouti. */
	readonly isResolved?: boolean
}

/** Un acompte remboursé n'est ni encaissé, ni en attente : il est sorti. */
const estRembourse = (d: InvoiceResponse) => d.has_credit_note === true

const somme = (docs: readonly InvoiceResponse[]) =>
	round2(docs.reduce((t, d) => t + Math.abs(d.total_ttc ?? 0), 0))

export function computeInvoiceSummary(
	inputs: DossierInputs,
): InvoiceFinancialSummary {
	const { current, deposits, creditNotes } = inputs
	const role = resolveDossierRole(current)
	const parent = inputs.parent ?? current
	const isResolved = inputs.isResolved ?? true

	const totalTtc = round2(Math.abs(parent.total_ttc ?? 0))

	const encaisses = deposits.filter((d) => d.is_paid && !estRembourse(d))
	const enAttente = deposits.filter((d) => !d.is_paid && !estRembourse(d))

	const depositsCollectedTtc = somme(encaisses)
	const depositsPendingTtc = somme(enAttente)

	// `credit_notes_total` est tenu par le serveur (backend/refund.go:204) et
	// ne couvre QUE les avoirs frappant ce document. Un avoir sur acompte est
	// déjà absorbé par l'exclusion de cet acompte : les additionner
	// déduirait deux fois.
	const creditNotesTtc = round2(Math.abs(parent.credit_notes_total ?? 0))

	// Un document RÉGLÉ ne doit plus rien, quelle que soit la soustraction.
	// Sans ce test, une facture payée sans acompte ni avoir affichait
	// « Reste à payer » égal à son total — pendant que la zone d'action, elle,
	// annonçait « Facture soldée ». Deux chiffres qui se contredisent sur le
	// même écran, devant le client.
	const estRegle = (parent.is_paid ?? false) && role !== 'deposit'
	const remainingTtc = estRegle
		? 0
		: Math.max(0, round2(totalTtc - depositsCollectedTtc - creditNotesTtc))

	// Un remboursement ne regarde pas ce qui reste DÛ mais ce qui a été
	// encaissé et n'a pas encore été rendu : total − avoirs.
	const refundableTtc = Math.max(0, round2(totalTtc - creditNotesTtc))

	// Un acompte ou une facture de solde s'encaisse pour SON montant ; la
	// parente, pour ce qu'il reste.
	const amountToCollectTtc =
		role === 'deposit' || role === 'balance'
			? current.is_paid
				? 0
				: round2(Math.abs(current.total_ttc ?? 0))
			: remainingTtc

	const isTrivial =
		deposits.length === 0 && creditNotesTtc === 0 && creditNotes.length === 0

	const lines: SummaryLine[] = [
		{
			key: 'total',
			label: 'Total de la facture',
			amount: totalTtc,
			sign: '+',
			belowLine: false,
		},
	]

	if (depositsCollectedTtc > 0) {
		lines.push({
			key: 'deposits_collected',
			label: 'Acomptes encaissés',
			amount: depositsCollectedTtc,
			sign: '-',
			count: encaisses.length,
			belowLine: false,
		})
	}

	if (creditNotesTtc > 0) {
		lines.push({
			key: 'credit_notes',
			label: 'Avoirs',
			amount: creditNotesTtc,
			sign: '-',
			count: creditNotes.length || undefined,
			belowLine: false,
		})
	}

	// Sur un document réglé sans acompte ni avoir, une soustraction à deux
	// lignes dont la seconde est zéro n'apprend rien. On dit ce qui a été
	// encaissé.
	if (estRegle && depositsCollectedTtc === 0 && creditNotesTtc === 0) {
		lines.push({
			key: 'remaining',
			label: 'Déjà encaissé',
			amount: totalTtc,
			sign: '=',
			belowLine: false,
		})
	} else {
		lines.push({
			key: 'remaining',
			label: 'Reste à payer',
			amount: remainingTtc,
			sign: '=',
			belowLine: false,
		})
	}

	if (depositsPendingTtc > 0) {
		lines.push({
			key: 'deposits_pending',
			label: "Acomptes en attente d'encaissement",
			amount: depositsPendingTtc,
			sign: '+',
			count: enAttente.length,
			belowLine: true,
		})
	}

	return {
		role,
		currency: parent.currency ?? 'EUR',
		totalTtc,
		depositsCollectedTtc,
		depositsCollectedCount: encaisses.length,
		depositsPendingTtc,
		depositsPendingCount: enAttente.length,
		creditNotesTtc,
		creditNotesCount: creditNotes.length,
		remainingTtc,
		refundableTtc,
		amountToCollectTtc,
		isTrivial,
		lines,
		isResolved,
	}
}
