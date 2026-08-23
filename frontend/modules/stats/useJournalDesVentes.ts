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
	/** Les rapports Z de la journée. Vide = journée non clôturée, cas courant. */
	z_numbers: string[] | null
	documents: JournalDocument[] | null
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

/** Les bornes des périodes proposées à l'écran. */
export function bornesDePeriode(
	choix: 'sept-jours' | 'trente-jours' | 'mois-en-cours',
): { du: string; au: string } {
	// ⚠️ Surtout PAS toISOString() : il rend la date en UTC. Passé 22 h en heure
	// d'été française, « aujourd'hui » y est encore hier — le journal serait
	// arrêté à la veille et n'afficherait pas la journée en cours, qui est
	// justement celle que le commerçant regarde.
	const jour = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
			d.getDate(),
		).padStart(2, '0')}`
	const aujourdhui = new Date()

	if (choix === 'mois-en-cours') {
		const premier = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1)
		return { du: jour(premier), au: jour(aujourdhui) }
	}

	const recul = choix === 'sept-jours' ? 6 : 29
	const debut = new Date(aujourdhui)
	debut.setDate(debut.getDate() - recul)
	return { du: jour(debut), au: jour(aujourdhui) }
}
