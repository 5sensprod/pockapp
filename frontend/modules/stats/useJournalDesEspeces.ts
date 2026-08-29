// frontend/modules/stats/useJournalDesEspeces.ts
//
// L'accès au journal des espèces. Il ne calcule RIEN : tout vient de la route Go
// `/api/reports/journal-especes`.
//
// Même règle que pour le journal des ventes, et pour la même raison : le sens
// d'un mouvement (ce qui entre au tiroir, ce qui en sort) est déjà écrit dans
// `aggregateZ`. Le réécrire ici donnerait deux vérités sur le même tiroir, et
// c'est exactement ce qui a fait diverger deux chemins d'agrégation pendant
// trois mois en 2026 (CLAUDE.md, « un seul chemin d'agrégation pour la caisse »).

import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'

export interface MouvementEspeces {
	id: string
	/** cash_in, cash_out, refund_out, safe_drop, adjustment */
	type: string
	/** 'vente' — les espèces d'une vente — ou 'tiroir' — un mouvement libre */
	nature: string
	/** +1 entrée, −1 sortie, 0 pour un type inconnu (visible, non compté) */
	sens: number
	/** Toujours positif : c'est `sens` qui dit le côté. */
	montant: number
	motif?: string
	/** Numéro de la pièce liée, quand le mouvement vient d'une vente. */
	document?: string
	auteur?: string
	heure?: string
}

export interface JourneeEspeces {
	date: string
	/** Fonds de la première session ouverte ce jour-là. */
	solde_ouverture: number
	/** false = aucune session ouverte ce jour : le tiroir n'a pas été ouvert. */
	ouverture_connue: boolean
	especes_des_ventes: number
	apports: number
	sorties: number
	remboursements: number
	remises_en_banque: number
	/** ouverture + ventes + apports − sorties − remises − remboursements */
	solde_theorique: number
	compte: number
	/** false = aucune session fermée avec comptage : l'écart n'a pas de sens. */
	comptage_connu: boolean
	ecart: number
	nb_mouvements: number
	mouvements: MouvementEspeces[] | null
}

export interface TotauxEspeces {
	especes_des_ventes: number
	apports: number
	sorties: number
	remboursements: number
	remises_en_banque: number
	nb_mouvements: number
	nb_jours: number
}

export interface JournalEspecesReponse {
	du: string
	au: string
	jours: JourneeEspeces[] | null
	totaux: TotauxEspeces
}

export const journalEspecesKeys = {
	all: ['journal-especes'] as const,
	periode: (company: string, du: string, au: string) =>
		[...journalEspecesKeys.all, company, du, au] as const,
}

export function useJournalDesEspeces(params: {
	ownerCompanyId?: string
	du: string
	au: string
}) {
	const pb = usePocketBase()
	const { ownerCompanyId, du, au } = params

	return useQuery({
		queryKey: journalEspecesKeys.periode(ownerCompanyId ?? '', du, au),
		queryFn: async (): Promise<JournalEspecesReponse> => {
			const token = pb.authStore.token
			const url = `/api/reports/journal-especes?company=${encodeURIComponent(
				ownerCompanyId ?? '',
			)}&du=${du}&au=${au}`

			const res = await fetch(url, {
				headers: { Authorization: token ? `Bearer ${token}` : '' },
			})
			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(
					err.message || 'Erreur lors du chargement du journal des espèces',
				)
			}
			return await res.json()
		},
		enabled: !!ownerCompanyId && !!du && !!au,
	})
}

/** Le libellé d'un type de mouvement, pour l'affichage. */
export function libelleTypeMouvement(type: string): string {
	switch (type) {
		case 'cash_in':
			return 'entrée'
		case 'cash_out':
			return 'sortie'
		case 'refund_out':
			return 'remboursement'
		case 'safe_drop':
			return 'remise en banque'
		case 'adjustment':
			return 'ajustement'
		default:
			return type
	}
}
