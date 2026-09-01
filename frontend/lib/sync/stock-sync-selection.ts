// frontend/lib/sync/stock-sync-selection.ts
//
// QUI a une page à rafraîchir, quand un stock bouge hors de la fiche produit.
//
// Séparé de `stock-sync.ts` pour une raison pratique et non théorique : ce
// fichier n'importe ni React, ni `use-pocketbase` — lequel touche `window` à
// l'import (`wails.ts:9`) et ne se charge donc pas sous Vitest, qui tourne ici
// sans jsdom. C'est la règle qu'on applique déjà à `catalog-export.ts` : la
// décision est pure et testée, le hook ne fait que la brancher.

/** Ce dont on a besoin pour décider : l'identifiant PocketBase, et de quoi
 *  nommer la fiche à l'écran. */
export type ProduitDeplace = { productId: string; productName?: string }

export type FicheEnLigne = { id: string; legacy_id: string; name: string }

export type ClientProduits = {
	collection: (nom: string) => {
		getFullList: (
			options: object,
		) => Promise<Array<FicheEnLigne & { status?: string }>>
	}
}

/**
 * Ne retient que les fiches dont le site a une page à rafraîchir : publiées,
 * ET connues de l'inventaire distant.
 *
 * ⚠️ **Un inventaire absent n'est pas un « non ».** Site injoignable, clé
 * absente, réponse en vol : on rend une liste vide sans même interroger la
 * base — ne pas savoir n'est pas savoir que non, et c'est ce qui évite de
 * proposer (ou pire, d'annoncer) une synchronisation pour des fiches dont on
 * ignore l'état en ligne.
 *
 * Une seule requête, filtrée sur les ids concernés — et surtout PAS la liste
 * complète du catalogue : la caisse n'a aucune raison de charger 2999 produits
 * en six allers-retours au moment où le client paie.
 */
export async function fichesEnLigne(
	pb: ClientProduits,
	enLigne: Record<string, string> | undefined,
	produits: ProduitDeplace[],
): Promise<FicheEnLigne[]> {
	const ids = [...new Set(produits.map((p) => p.productId).filter(Boolean))]
	if (ids.length === 0 || !enLigne) return []

	const fiches = await pb.collection('products').getFullList({
		filter: ids.map((id) => `id="${id}"`).join(' || '),
		fields: 'id,legacy_id,name,status',
		batch: 200,
	})

	return fiches.filter(
		(fiche) => fiche.status === 'published' && fiche.legacy_id in enLigne,
	)
}
