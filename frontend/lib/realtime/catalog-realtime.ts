// frontend/lib/realtime/catalog-realtime.ts
//
// LE CATALOGUE SE MET À JOUR TOUT SEUL, D'UN POSTE À L'AUTRE.
//
// ── LE PROBLÈME ───────────────────────────────────────────────────────────
// Le déploiement est multi-postes depuis le 19 août 2026 — un poste sur
// l'application bureau, les autres au navigateur (docs/DECISIONS.md). Une
// vente encaissée sur un poste, un prix corrigé sur un autre : rien n'en
// avertissait les écrans ouverts ailleurs, qui gardaient leur cache TanStack
// Query jusqu'au rechargement de la page.
//
// Le canal WebSocket d'AppPos faisait ce travail avant d'être débranché. Ce
// fichier le remplace, mais **pas par le même mécanisme** : PocketBase a son
// temps réel natif, il écoute la collection elle-même, et il n'a besoin
// d'aucune sortie réseau nouvelle — c'est le même serveur `:8090` que le reste
// (point 1 de CLAUDE.md).
//
// ── POURQUOI ÇA MARCHE AUSSI POUR LES MOUVEMENTS ÉCRITS PAR LE GO ─────────
// Le stock ne s'écrit plus depuis le client mais par `POST /api/stock/adjust`
// (`backend/routes/stock_routes.go`). Ce chemin diffuse quand même : le temps
// réel de PocketBase est accroché aux événements de MODÈLE, pas à l'API REST —
// vérifié dans la bibliothèque v0.22.22, `apis/realtime.go:257` s'abonne à
// `OnModelAfterUpdate`. Un `SaveRecord` dans une transaction Go déclenche donc
// la diffusion comme le ferait un `update` du SDK.
//
// ── LE PIÈGE ÉVITÉ ────────────────────────────────────────────────────────
// Un ticket de trente lignes produit trente événements. Invalider trente fois
// coûterait plus cher que le rechargement qu'on évite. Les événements sont
// donc REGROUPÉS : le premier arme un délai, les suivants s'y rangent, et une
// seule invalidation part à l'échéance.
//
// Et l'invalidation ne recharge pas le catalogue : `invalidateQueries` ne
// refait partir que les requêtes ACTIVES — celles qui sont montées à l'écran.
// `useCatalogProducts` pagine côté serveur, donc c'est une page (25 lignes,
// ou 50 pour la recherche de la caisse) qui repart, pas 2999 produits. Les
// pages en cache non affichées sont seulement marquées périmées.

// Aucun import de `lib/queries` ici, et c'est délibéré : `catalog-products.ts`
// construit un client PocketBase au chargement du module, donc lit `window`.
// L'importer rendrait cette règle intestable hors navigateur. Ce que le hook
// invalide est décidé dans `use-catalog-realtime.ts`.

/** Le délai de regroupement. Assez long pour absorber les lignes d'un même
 *  ticket, assez court pour qu'un prix corrigé sur un autre poste apparaisse
 *  sans qu'on ait le temps de s'en apercevoir. */
export const DELAI_REGROUPEMENT_MS = 400

export interface Regroupeur {
	/** Un événement est arrivé. */
	signaler: () => void
	/** Démontage : ce qui était en attente ne partira pas. */
	arreter: () => void
}

/**
 * Regroupe les événements et n'invalide qu'une fois par salve.
 *
 * Séparé du hook pour être testable seul : c'est la règle qui n'a pas d'autre
 * gardien — une invalidation par événement passerait inaperçue à l'écran et ne
 * se paierait qu'en charge.
 */
export function creerRegroupeur(
	invalider: () => void,
	delaiMs = DELAI_REGROUPEMENT_MS,
): Regroupeur {
	let timer: ReturnType<typeof setTimeout> | undefined

	return {
		signaler() {
			// Le premier événement arme le délai ; les suivants ne le repoussent
			// PAS. Repousser ferait attendre indéfiniment pendant une salve longue
			// — un inventaire qui se déverse, par exemple.
			if (timer) return
			timer = setTimeout(() => {
				timer = undefined
				invalider()
			}, delaiMs)
		},
		arreter() {
			if (timer) clearTimeout(timer)
			timer = undefined
		},
	}
}

/** Les collections écoutées, et les clés de cache que chacune périme.
 *
 *  Une table plutôt qu'une invalidation globale : le piège annoncé était
 *  qu'un abonnement qui vide tout coûte plus cher que le rechargement qu'il
 *  évite. Une marque renommée n'a aucune raison de faire repartir la page de
 *  produits affichée.
 *
 *  `products` porte le prix ET le stock : c'est elle qui rend visibles la
 *  vente d'un autre poste et la correction de prix d'un autre poste. Les trois
 *  autres tenaient les événements `*.tree.changed` de l'ancien canal AppPos. */
export const COLLECTIONS_SURVEILLEES: Record<string, string[][]> = {
	products: [
		['catalog-products'],
		['products'],
		['catalog-counts'],
		['site-catalog'],
	],
	// `catalog-counts` dépend AUSSI de l'arbre : déplacer une catégorie change
	// le total de deux branches sans qu'aucun produit ne bouge.
	categories: [['categories'], ['catalog-counts'], ['site-catalog']],
	brands: [['brands'], ['site-catalog']],
	suppliers: [['suppliers']],
}
