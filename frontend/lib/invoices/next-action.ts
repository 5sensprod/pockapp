// frontend/lib/invoices/next-action.ts
//
// « Que dois-je faire maintenant ? » — une seule fonction pour répondre.
//
// L'écran actuel pose douze actions à plat dans un menu déroulant et donne le
// seul rang primaire à « PDF ». Les trois gestes fréquents — encaisser,
// demander un acompte, facturer le solde — sont au sixième rang ou absents. Et
// quand une action n'est pas disponible, son entrée DISPARAÎT sans un mot.
//
// Trois invariants, testés :
//
//  1. `primary === null` ⇒ `absenceReason !== null`. Jamais d'écran muet.
//  2. Un seul rang primaire.
//  3. Le primaire ne va qu'à une action qui FAIT AVANCER le dossier. Jamais à
//     PDF, email, avoir, remboursement, suppression.
//
// Cette fonction est PURE : aucun JSX, aucun handler. La vue associe
// `id -> onClick` sur useInvoiceActions, qui n'est pas touché. C'est ce qui
// rend les treize états testables sans DOM.
//
// Libellés : glossaire figé, §12 de l'audit. Messages d'indisponibilité : §12
// également — ils disent la CAUSE et la LEVÉE.
//
// Voir frontend/modules/connect/PocketConnect-docs/01-audit-detail-facture.md
// §11, §12 et §16.

import type { InvoiceResponse } from '@/lib/types/invoice.types'
import {
	canCreateBalanceInvoice,
	canCreateDeposit,
	canMarkAsPaid,
	canTransitionTo,
} from '@/lib/types/invoice.types'
import type { DossierInputs, InvoiceFinancialSummary } from './dossier-summary'

export type InvoiceActionId =
	// Font avancer le dossier — seules candidates au rang primaire
	| 'validate'
	| 'convert'
	| 'collect'
	| 'generate_balance'
	| 'create_deposit'
	| 'open_balance'
	| 'open_parent'
	// Ne font pas avancer le dossier
	| 'pdf'
	| 'email'
	| 'mark_sent'
	| 'edit'
	| 'delete_draft'
	| 'credit_note'
	| 'refund_invoice'
	| 'refund_ticket'
	| 'refund_deposit'
	| 'open_credit_note'
	| 'open_converted'

/** Les seules actions qui peuvent occuper le rang primaire (invariant 3). */
export const ACTIONS_QUI_FONT_AVANCER: readonly InvoiceActionId[] = [
	'validate',
	'convert',
	'collect',
	'generate_balance',
	'create_deposit',
	'open_balance',
	'open_parent',
]

export interface ResolvedAction {
	readonly id: InvoiceActionId
	readonly label: string
	readonly disabled: boolean
	/** Non nul si et seulement si `disabled`. « Désactiver + explication ». */
	readonly disabledReason: string | null
	readonly destructive: boolean
}

export interface NextActionResolution {
	/** Null ⇒ `absenceReason` non nul. */
	readonly primary: ResolvedAction | null
	readonly absenceReason: string | null
	/** Zéro à deux. PDF y figure toujours. */
	readonly secondary: readonly ResolvedAction[]
	readonly menu: readonly ResolvedAction[]
	/** L'état retenu, 1 à 13 — exposé pour que le test nomme le cas. */
	readonly state: number
}

export interface NextActionInputs extends DossierInputs {
	readonly summary: InvoiceFinancialSummary
	readonly balanceInvoice: InvoiceResponse | null
}

const action = (
	id: InvoiceActionId,
	label: string,
	opts: { disabledReason?: string; destructive?: boolean } = {},
): ResolvedAction => ({
	id,
	label,
	disabled: !!opts.disabledReason,
	disabledReason: opts.disabledReason ?? null,
	destructive: opts.destructive ?? false,
})

const PDF = action('pdf', 'PDF')
const EMAIL = action('email', 'Envoyer par email')

/**
 * Ordre de priorité — le premier prédicat vrai emporte le rang primaire.
 *
 * Deux écarts assumés par rapport au §11, tous deux pour empêcher un
 * encaissement en double :
 *
 *  - « Ouvrir la facture de solde » passe DEVANT « Encaisser » quand un solde
 *    existe : encaisser la parente alors que son solde est émis encaisserait
 *    deux fois le même argent.
 *  - « Facturer le solde » passe devant « Encaisser » quand il est générable —
 *    c'est l'aboutissement attendu du dossier, et le §11 le range en primaire
 *    de l'état 4.
 */
export function resolveNextAction(
	inputs: NextActionInputs,
): NextActionResolution {
	const { current, summary, balanceInvoice, deposits } = inputs
	const role = summary.role
	const numeroSolde = balanceInvoice?.number ?? ''

	const enAttente = summary.depositsPendingCount
	const soldeGenerable =
		canCreateBalanceInvoice(current) && !balanceInvoice && enAttente === 0
	const acomptePossible = canCreateDeposit(current) && !balanceInvoice

	// L'encaissement se gouverne par le RESTE À PAYER, jamais par l'existence
	// d'un avoir (§16-2). Le serveur (backend/pay.go:66-78) n'a jamais refusé
	// d'encaisser une facture qui porte un avoir : le blocage n'était
	// qu'affichage, et il tombait dès le premier avoir, fût-il partiel.
	const encaissable = canMarkAsPaid(current) && summary.amountToCollectTtc > 0

	const menuCommun: ResolvedAction[] = []
	if (canTransitionTo(current.status, 'sent')) {
		menuCommun.push(action('mark_sent', 'Marquer comme envoyée'))
	}

	// ── 1. Brouillon ────────────────────────────────────────────────────────
	if (current.status === 'draft') {
		return {
			state: 1,
			primary: action('validate', 'Valider la facture'),
			absenceReason: null,
			secondary: [PDF, action('edit', 'Modifier')],
			menu: [
				// Un brouillon ne s'envoie pas : l'email est masqué, pas grisé.
				action('delete_draft', 'Supprimer le brouillon', {
					destructive: true,
				}),
			],
		}
	}

	// ── 11 / 12. Ticket de caisse ───────────────────────────────────────────
	if (role === 'ticket') {
		if (!current.converted_to_invoice) {
			return {
				state: 11,
				primary: action('convert', 'Convertir en facture'),
				absenceReason: null,
				secondary: encaissable ? [PDF, action('collect', 'Encaisser')] : [PDF],
				menu: [EMAIL, ...menuCommun],
			}
		}
		return {
			state: 12,
			primary: null,
			absenceReason: 'Ticket déjà converti en facture.',
			secondary: [PDF, action('open_converted', 'Ouvrir la facture issue')],
			menu: [
				EMAIL,
				...(current.is_paid && summary.refundableTtc > 0
					? [action('refund_ticket', 'Rembourser le client')]
					: []),
			],
		}
	}

	// ── 10. Avoir ───────────────────────────────────────────────────────────
	if (role === 'credit_note') {
		return {
			state: 10,
			primary: null,
			absenceReason:
				'Un avoir est un document scellé : rien à encaisser ni à modifier.',
			secondary: [PDF, action('open_parent', 'Ouvrir le document remboursé')],
			menu: [EMAIL],
		}
	}

	// ── 8 / 9. Acompte ──────────────────────────────────────────────────────
	if (role === 'deposit') {
		if (!current.is_paid) {
			return {
				state: 8,
				primary: action('collect', 'Encaisser'),
				absenceReason: null,
				secondary: [PDF, action('open_parent', 'Retour à la facture')],
				menu: [EMAIL, ...menuCommun],
			}
		}
		return {
			state: 9,
			primary: null,
			absenceReason: 'Acompte réglé. La suite se passe sur la facture.',
			secondary: [PDF, action('open_parent', 'Retour à la facture')],
			menu: [
				EMAIL,
				...(current.has_credit_note
					? []
					: [action('refund_deposit', "Rembourser l'acompte")]),
			],
		}
	}

	// ── 13. Facture de solde ────────────────────────────────────────────────
	if (role === 'balance') {
		return {
			state: 13,
			primary: encaissable ? action('collect', 'Encaisser') : null,
			absenceReason: encaissable ? null : 'Solde réglé. Dossier clos.',
			secondary: [PDF, action('open_parent', 'Retour à la facture')],
			menu: [EMAIL, ...menuCommun, action('credit_note', 'Créer un avoir')],
		}
	}

	// ── 5. Une facture de solde existe : la parente ne s'encaisse plus ──────
	if (balanceInvoice) {
		return {
			state: 5,
			primary: action('open_balance', 'Ouvrir la facture de solde'),
			absenceReason: null,
			secondary: [PDF],
			menu: [
				EMAIL,
				...menuCommun,
				action('create_deposit', 'Demander un acompte', {
					disabledReason: `Le solde est déjà facturé${numeroSolde ? ` (${numeroSolde})` : ''} — plus d'acompte possible sur ce dossier.`,
				}),
			],
		}
	}

	// ── 4. Acomptes tous encaissés, solde à facturer ────────────────────────
	if (soldeGenerable) {
		return {
			state: 4,
			// « Fermer le dossier prime sur l'élargir » : un acompte de plus est
			// un document scellé de plus, la facture de solde est
			// l'aboutissement attendu.
			primary: action('generate_balance', 'Facturer le solde'),
			absenceReason: null,
			secondary: acomptePossible
				? [PDF, action('create_deposit', 'Demander un acompte')]
				: [PDF],
			menu: [
				EMAIL,
				...menuCommun,
				action('credit_note', 'Créer un avoir', {
					disabledReason:
						"Une facture avec acomptes ne s'annule pas d'un avoir global — remboursez chaque acompte, puis la facture de solde.",
					destructive: true,
				}),
			],
		}
	}

	// ── 2 / 3. Facture validée, encaissable ─────────────────────────────────
	if (encaissable) {
		const aDesAcomptes = deposits.length > 0
		return {
			state: enAttente > 0 ? 3 : 2,
			primary: action('collect', 'Encaisser'),
			absenceReason: null,
			secondary: acomptePossible
				? [PDF, action('create_deposit', 'Demander un acompte')]
				: [PDF],
			menu: [
				EMAIL,
				...menuCommun,
				action('credit_note', 'Créer un avoir', {
					disabledReason: aDesAcomptes
						? "Une facture avec acomptes ne s'annule pas d'un avoir global — remboursez chaque acompte, puis la facture de solde."
						: undefined,
					destructive: true,
				}),
				...(enAttente > 0
					? [
							action('generate_balance', 'Facturer le solde', {
								disabledReason: `Le solde ne se facture pas tant que les ${enAttente} acompte(s) demandé(s) ne sont pas encaissés.`,
							}),
						]
					: []),
			],
		}
	}

	// ── 6 / 7. Plus rien à encaisser ────────────────────────────────────────
	const annuleeParAvoir = summary.creditNotesTtc > 0
	return {
		state: annuleeParAvoir ? 7 : 6,
		primary: null,
		absenceReason: annuleeParAvoir
			? "Cette facture est couverte par un avoir — il n'y a plus rien à encaisser."
			: 'Facture soldée. Plus rien à encaisser.',
		secondary: [PDF, EMAIL],
		menu: [
			...(summary.refundableTtc > 0
				? [action('refund_invoice', 'Rembourser le client')]
				: []),
			action('create_deposit', 'Demander un acompte', {
				disabledReason:
					'Cette facture est déjà réglée — plus d’acompte à demander.',
			}),
		],
	}
}
