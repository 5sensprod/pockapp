// frontend/lib/sync/product-publish-auto-sync-rule.ts
//
// LA RÈGLE, SEULE. Sans React, sans PocketBase, sans requête — même principe
// que `relation-auto-sync-rule.ts`, dont celle-ci est la version produit.
//
// Un produit n'a qu'un seul moment où le silence coûtait cher : celui où il
// PASSE publié pour la première fois. Avant le 23 septembre 2026, ce moment ne
// déclenchait rien — ni les données ni les images — et il fallait aller les
// chercher soi-même dans `/site/catalogue`, une par une, au milieu des autres
// (§ groupe « absent »). Toute autre transition reste à la décision du vendeur
// : une fiche déjà en ligne qu'on retouche passe par `SyncAfterSaveDialog`, une
// dépublication reste manuelle (`retirables`, dans `/site/catalogue`).

export type DecisionPublicationProduit = 'publier' | 'rien-a-faire'

export function decisionPublicationProduit(etat: {
	avantPublie: boolean
	apresPublie: boolean
}): DecisionPublicationProduit {
	return !etat.avantPublie && etat.apresPublie ? 'publier' : 'rien-a-faire'
}
