// frontend/modules/stock/lib/alertes-stock.ts
// « Ouvrir le catalogue » depuis le bouton Stock alert doit montrer LES PRODUITS
// EN ALERTE, pas la liste telle qu'elle était laissée. Les filtres de la page
// produits sont mémorisés sur le poste (`useEtatPersistant`) : un statut
// « Publié », une marque ou une recherche restés cochés cachaient les produits
// en alerte — des brouillons, par exemple — et la liste paraissait vide.
//
// On écrit donc l'état de la page AVANT d'y aller : toutes les clés de filtre
// retirées (= valeur initiale), sauf « Alerte stock » posée. Le tri et la
// largeur du panneau, qui ne sont pas des filtres, sont laissés.

import { PREFIXE_ETAT_PERSISTANT } from '@/lib/hooks/useEtatPersistant'

/** Page produits déjà ouverte : elle écoute cet événement et se filtre sans recharger. */
export const EVENEMENT_CATALOGUE_EN_ALERTE = 'pocketapp:catalogue-en-alerte'

const CLES_FILTRES = [
	'stock-produits-recherche',
	'stock-produits-page',
	'stock-produits-statut',
	'stock-produits-marque',
	'stock-produits-categorie',
	'stock-produits-fournisseur',
	'stock-produits-sans-image',
	'stock-produits-sans-description',
	'stock-produits-sans-prix-achat',
	'stock-produits-stock-vide',
	'stock-produits-avec-stock-b',
	'stock-produits-mis-en-avant',
	'stock-produits-etat-commercial',
	'stock-produits-etat-vente',
	'stock-produits-prix-min',
	'stock-produits-prix-max',
]

export function preparerCatalogueEnAlerte() {
	try {
		for (const cle of CLES_FILTRES) {
			window.localStorage.removeItem(PREFIXE_ETAT_PERSISTANT + cle)
		}
		window.localStorage.setItem(
			`${PREFIXE_ETAT_PERSISTANT}stock-produits-alerte-stock`,
			JSON.stringify({ v: true }),
		)
	} catch {
		// Stockage refusé : la page s'ouvre avec ses filtres habituels.
	}
}
