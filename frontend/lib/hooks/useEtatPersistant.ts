// frontend/lib/hooks/useEtatPersistant.ts
//
// UN `useState` QUI SURVIT À LA SORTIE DE L'ÉCRAN, 4 septembre 2026.
//
// Quitter une fiche produit pour revenir à la liste remonte le composant : sans
// cela, la recherche, les filtres, le tri et la page repartent à zéro, et on
// retrouve la page 1 de 2999 produits après chaque aller-retour.
//
// Deux règles tiennent tout le fichier :
//
//   • la lecture est VALIDÉE. Une valeur écrite par une version antérieure —
//     un filtre disparu, un tri sur une colonne renommée — part au serveur et
//     rend une liste vide sans dire pourquoi. Un validateur rejette, on repart
//     de la valeur initiale ;
//   • rien ne casse sans `localStorage`. Sur un poste qui le refuse, l'écran
//     doit fonctionner exactement comme avant, sans mémoire.
//
// Ne rien mettre ici qui soit nominatif ou commercial : c'est le disque d'un
// poste partagé, la même règle que `CLES_PERSISTEES` dans `main.tsx`. Des
// identifiants de marque ou de catégorie, oui ; des noms de clients, non.

import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useRef,
	useState,
} from 'react'

/** Préfixe commun, pour que les clés de l'application soient reconnaissables
 *  dans le `localStorage` d'un poste. */
export const PREFIXE_ETAT_PERSISTANT = 'pocketapp-etat-'

/** La lecture, isolée de `window` pour être vérifiable : les tests du dépôt
 *  tournent sans DOM. */
export function lireEtatPersistant<T>(
	stockage: Pick<Storage, 'getItem'>,
	cle: string,
	valeurInitiale: T,
	estValide?: (valeur: unknown) => boolean,
): T {
	try {
		const brut = stockage.getItem(PREFIXE_ETAT_PERSISTANT + cle)
		if (brut === null) return valeurInitiale
		// L'enveloppe `{ v }` n'est pas décorative : `JSON.stringify(undefined)`
		// ne rend pas du JSON, et un état optionnel — le statut du produit — se
		// relirait cassé. Dans un objet, la clé disparaît et `v` revient
		// `undefined`, ce qui est exactement la valeur écrite.
		const enveloppe = JSON.parse(brut) as { v?: unknown }
		if (typeof enveloppe !== 'object' || enveloppe === null)
			return valeurInitiale
		const valeur = enveloppe.v
		if (estValide && !estValide(valeur)) return valeurInitiale
		return valeur as T
	} catch {
		return valeurInitiale
	}
}

/**
 * Même signature que `useState`, y compris la forme fonctionnelle du setter.
 *
 * @param cle           suffixe de clé, unique dans l'application
 * @param valeurInitiale valeur au premier affichage, et repli si le stockage
 *                       est absent, illisible ou rejeté par `estValide`
 * @param estValide     garde-fou sur ce qui est relu du disque
 */
export function useEtatPersistant<T>(
	cle: string,
	valeurInitiale: T,
	estValide?: (valeur: unknown) => boolean,
): [T, Dispatch<SetStateAction<T>>] {
	const [valeur, setValeur] = useState<T>(() =>
		lireEtatPersistant(window.localStorage, cle, valeurInitiale, estValide),
	)

	// La clé est figée à la première lecture : la faire varier en cours de vie
	// écrirait l'état d'un écran sous la clé d'un autre.
	const cleFigee = useRef(cle)

	useEffect(() => {
		try {
			window.localStorage.setItem(
				PREFIXE_ETAT_PERSISTANT + cleFigee.current,
				JSON.stringify({ v: valeur }),
			)
		} catch {
			// Quota plein ou stockage refusé : l'écran continue sans mémoire.
		}
	}, [valeur])

	return [valeur, setValeur]
}
