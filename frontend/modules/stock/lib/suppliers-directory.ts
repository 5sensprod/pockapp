// frontend/modules/stock/lib/suppliers-directory.ts
// ═══════════════════════════════════════════════════════════════════════════
// LE RÉPERTOIRE FOURNISSEURS ET MARQUES — CE QUE LE PDF MET EN PAGE
// ═══════════════════════════════════════════════════════════════════════════
// Écrit le 24 septembre 2026. Le vendeur doit APPRENDRE qui fournit quoi : le
// PDF est un repère qu'on garde sous la main. Il a donc deux entrées, parce que
// on cherche dans les deux sens :
//
//   • par FOURNISSEUR — « qu'est-ce que Musicdistrib me livre ? » ;
//   • par MARQUE — « chez qui je commande du Lag ? ». C'est le sens qu'on utilise
//     au comptoir, et celui que la page fournisseurs ne montre pas : un index de
//     A à Z, où la marque est l'entrée et le fournisseur la réponse.
//
// Fonction pure — aucun réseau, aucun React : le composant PDF ne fait que
// mettre en page ce qu'elle rend. Vérifiée par `suppliers-directory.test.ts`.
//
// ⚠️ LA LIAISON EST PORTÉE PAR LE FOURNISSEUR (`suppliers.brands`), jamais par la
// marque : une marque n'a aucun champ fournisseur. Elle peut donc avoir PLUSIEURS
// fournisseurs — le PDF les liste tous, il n'en choisit pas un.
//
// ⚠️ LES COORDONNÉES BANCAIRES ET LES CONDITIONS DE RÈGLEMENT N'Y SONT PAS : ce
// sont des JSON libres (`banking`, `payment_terms`), et ce document est fait pour
// circuler au comptoir. Ne pas les y ajouter sans décision.

import type {
	CatalogBrandShape,
	CatalogSupplierShape,
} from '@/lib/queries/catalog-shapes'

export interface FournisseurDuRepertoire {
	id: string
	nom: string
	code: string
	contact: string
	email: string
	telephone: string
	/** Noms de marques, dans l'ordre alphabétique. */
	marques: string[]
}

export interface EntreeMarque {
	marque: string
	/** Tous les fournisseurs qui la distribuent, dans l'ordre alphabétique. */
	fournisseurs: string[]
}

export interface GroupeAlphabetique {
	/** « A » à « Z », ou « # » pour un nom qui ne commence pas par une lettre. */
	lettre: string
	entrees: EntreeMarque[]
}

export interface RepertoireFournisseurs {
	fournisseurs: FournisseurDuRepertoire[]
	/** L'index des marques rattachées à au moins un fournisseur, par lettre. */
	index: GroupeAlphabetique[]
	/** Les marques qu'aucun fournisseur ne distribue : un trou à combler. */
	marquesSansFournisseur: string[]
	totaux: {
		fournisseurs: number
		marques: number
		marquesRattachees: number
	}
}

const collateur = new Intl.Collator('fr', {
	sensitivity: 'base',
	numeric: true,
})

/** Compare deux libellés comme un annuaire : sans casse, sans accent, et les
 *  nombres à leur valeur (« 2 » avant « 10 »). */
export const comparer = (a: string, b: string) => collateur.compare(a, b)

/** L'initiale d'un nom, en majuscule et sans accent — « Éclat » range sous
 *  « E ». Un nom qui ne commence pas par une lettre va sous « # ». */
export function lettreDe(nom: string): string {
	const premier = nom
		.trim()
		.normalize('NFD')
		.replace(/\p{Mn}/gu, '')
		.charAt(0)
		.toUpperCase()
	return /^[A-Z]$/.test(premier) ? premier : '#'
}

const net = (valeur: string | undefined | null) => (valeur ?? '').trim()

/**
 * Construit le répertoire à partir des fournisseurs et des marques du catalogue.
 *
 * Une marque référencée par un fournisseur mais absente de `brands` est ignorée :
 * la relation PocketBase pointe vers une fiche qui n'existe plus, et un
 * identifiant brut n'a rien à faire sur un document imprimé.
 */
export function construireRepertoire(
	fournisseurs: readonly CatalogSupplierShape[],
	marques: readonly CatalogBrandShape[],
): RepertoireFournisseurs {
	const nomDeMarque = new Map<string, string>()
	for (const marque of marques) {
		const nom = net(marque.name)
		if (nom) nomDeMarque.set(marque.id, nom)
	}

	// marque → fournisseurs, dans un Set : un fournisseur qui porterait deux fois
	// la même marque ne doit pas s'y voir deux fois.
	const fournisseursDeMarque = new Map<string, Set<string>>()

	const lignes: FournisseurDuRepertoire[] = fournisseurs
		.map((fournisseur) => {
			const nom = net(fournisseur.name)
			const noms = [...new Set(fournisseur.brands ?? [])]
				.map((id) => nomDeMarque.get(id))
				.filter((valeur): valeur is string => Boolean(valeur))
				.sort(comparer)

			for (const marque of noms) {
				const deja = fournisseursDeMarque.get(marque) ?? new Set<string>()
				deja.add(nom)
				fournisseursDeMarque.set(marque, deja)
			}

			return {
				id: fournisseur.id,
				nom,
				code: net(fournisseur.supplier_code),
				contact: net(fournisseur.contact_name),
				email: net(fournisseur.contact_email),
				telephone: net(fournisseur.contact_phone),
				marques: noms,
			}
		})
		.filter((ligne) => ligne.nom !== '')
		.sort((a, b) => comparer(a.nom, b.nom))

	const entrees: EntreeMarque[] = [...fournisseursDeMarque.entries()]
		.map(([marque, ensemble]) => ({
			marque,
			fournisseurs: [...ensemble].sort(comparer),
		}))
		.sort((a, b) => comparer(a.marque, b.marque))

	const groupes: GroupeAlphabetique[] = []
	for (const entree of entrees) {
		const lettre = lettreDe(entree.marque)
		const courant = groupes[groupes.length - 1]
		if (courant && courant.lettre === lettre) courant.entrees.push(entree)
		else groupes.push({ lettre, entrees: [entree] })
	}
	// « # » en dernier : il n'est pas une lettre, et un tri de noms qui commencent
	// par un chiffre le placerait en tête.
	groupes.sort((a, b) =>
		a.lettre === '#' ? 1 : b.lettre === '#' ? -1 : comparer(a.lettre, b.lettre),
	)

	const toutesLesMarques = [...nomDeMarque.values()]
	const sansFournisseur = [...new Set(toutesLesMarques)]
		.filter((nom) => !fournisseursDeMarque.has(nom))
		.sort(comparer)

	return {
		fournisseurs: lignes,
		index: groupes,
		marquesSansFournisseur: sansFournisseur,
		totaux: {
			fournisseurs: lignes.length,
			marques: new Set(toutesLesMarques).size,
			marquesRattachees: fournisseursDeMarque.size,
		},
	}
}
