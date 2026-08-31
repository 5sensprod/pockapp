// frontend/modules/stats/useJournalDesVentes.ts
//
// L'accès au journal des ventes. Il ne calcule RIEN : tout vient de la route Go
// `/api/reports/journal`, qui partage le classificateur du rapport Z.
//
// C'est délibéré et ça ne doit pas changer. Recalculer ici les règles des quatre
// lignes — quelle facture est une vente du jour, laquelle est un règlement de
// créance, quel dossier d'acompte ne compte qu'une fois — produirait une seconde
// implémentation des mêmes règles. C'est exactement ce qui a fait diverger deux
// chemins d'agrégation pendant trois mois en 2026 (CLAUDE.md, « un seul chemin
// d'agrégation pour la caisse »).

import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'

export interface JournalDocument {
	id: string
	number: string
	/** ticket, facture, acompte, solde, avoir */
	nature: string
	/** le libellé de la ligne du contrat à laquelle le document appartient */
	ligne: string
	ttc: number
	moyen: string
	client?: string
	heure?: string
}

export interface JournalJour {
	date: string
	ventes_du_jour: number
	creances: number
	acomptes: number
	remboursements: number
	encaisse: number
	ventes_ht: number
	ventes_tva: number
	nb_documents: number
	par_moyen: Record<string, number>
	/** Tickets de caisse de la journée. 0 = aucune session : rien à clôturer. */
	nb_tickets: number
	/** Les rapports Z couvrant les tickets de la journée, via leur SESSION. */
	z_numbers: string[] | null
	/** Tickets de la journée qu'aucun Z ne couvre encore. */
	tickets_hors_z: number
	documents: JournalDocument[] | null
}

/**
 * Une session de caisse fermée qui n'est entrée dans aucun rapport Z.
 *
 * C'est le seul manque réel de clôture, et il ne se confond pas avec « une
 * journée sans Z » : la plupart des journées n'ont aucune session ouverte,
 * l'argent y arrive par facture hors caisse — il n'y avait rien à clôturer.
 */
export interface SessionEnAttenteDeZ {
	id: string
	ouverte_le: string
	fermee_le: string
	nb_tickets: number
	ttc: number
	/** Le jour de fermeture porte déjà un Z : une simple génération ne suffira pas. */
	jour_deja_clos: boolean
	z_du_jour?: string
}

export interface JournalTotaux {
	ventes_du_jour: number
	creances: number
	acomptes: number
	remboursements: number
	encaisse: number
	ventes_ht: number
	ventes_tva: number
	nb_documents: number
	nb_jours: number
}

export interface JournalReponse {
	du: string
	au: string
	jours: JournalJour[] | null
	totaux: JournalTotaux
	/** Hors période, à dessein : une session de janvier doit rester visible. */
	sessions_en_attente: SessionEnAttenteDeZ[] | null
}

export const journalKeys = {
	all: ['journal-ventes'] as const,
	periode: (company: string, du: string, au: string) =>
		[...journalKeys.all, company, du, au] as const,
}

export function useJournalDesVentes(params: {
	ownerCompanyId?: string
	du: string
	au: string
}) {
	const pb = usePocketBase()
	const { ownerCompanyId, du, au } = params

	return useQuery({
		queryKey: journalKeys.periode(ownerCompanyId ?? '', du, au),
		queryFn: async (): Promise<JournalReponse> => {
			const token = pb.authStore.token
			const url = `/api/reports/journal?company=${encodeURIComponent(
				ownerCompanyId ?? '',
			)}&du=${du}&au=${au}`

			const res = await fetch(url, {
				headers: { Authorization: token ? `Bearer ${token}` : '' },
			})
			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.message || 'Erreur lors du chargement du journal')
			}
			return await res.json()
		},
		enabled: !!ownerCompanyId && !!du && !!au,
	})
}
