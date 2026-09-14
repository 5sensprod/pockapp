// frontend/lib/sync/relation-auto-sync-rule.ts
//
// LA RÈGLE, SEULE. Sans React, sans PocketBase, sans requête : c'est ce qui la
// rend vérifiable (`relation-auto-sync.test.ts`). Le hook qui l'applique est
// dans `relation-auto-sync.ts`.

export type ChangementsRelation = {
	dataModified: boolean
	imageModified: boolean
}

/** Pourquoi on part, ou pourquoi on ne part pas. C'est ce que la console dit,
 *  et c'est ce que le test vérifie. */
export type DecisionPublication =
	| 'publier'
	| 'rien-de-modifie'
	| 'inventaire-indisponible'
	| 'inconnue-du-site'

/**
 * La règle, seule et testable.
 *
 * ── Pourquoi une entité INCONNUE du site ne part pas ────────────────────────
 * C'est la règle héritée des deux hooks de 26 août : sans ligne SQL distante,
 * il n'y a aucune page à rafraîchir. Une seule exception, et elle est mesurée
 * dans `server/api/catalog.php` :
 *
 *   • `action=brands` (`catalog.php:502`) joint les produits publiés — une
 *     marque sans produit n'apparaît NULLE PART sur le site. L'exporter
 *     écrirait une ligne que rien ne lit. Elle attend donc qu'un produit la
 *     cite : `collectExportInput` l'emportera alors, comme aujourd'hui.
 *   • `action=featured-categories` (`catalog.php:459`) ne joint rien : une
 *     catégorie `is_featured` s'affiche SEULE, sans un produit. Celle-là part
 *     donc dès sa création ou dès qu'on l'a mise en avant, sinon la vitrine
 *     annoncerait un rayon que la base du site ne connaît pas.
 *
 * Une catégorie ordinaire créée au comptoir attend, elle aussi, qu'un produit
 * la cite — ancêtres compris, cette règle-là ne bouge pas.
 */
export function decisionPublication(
	kind: 'categories' | 'brands',
	etat: {
		connueDuSite: boolean | null
		isFeatured?: boolean
		changements: ChangementsRelation
	},
): DecisionPublication {
	const { dataModified, imageModified } = etat.changements
	if (!dataModified && !imageModified) return 'rien-de-modifie'
	// `null` n'est pas `false` : « pas su lire l'inventaire » n'est pas
	// « pas en ligne ». On ne prétend rien, et on le dit en console.
	if (etat.connueDuSite === null) return 'inventaire-indisponible'
	if (etat.connueDuSite) return 'publier'
	if (kind === 'categories' && etat.isFeatured) return 'publier'
	return 'inconnue-du-site'
}
