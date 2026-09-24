// frontend/lib/catalog/search-key.ts
// ═══════════════════════════════════════════════════════════════════════════
// LA CLÉ DE RECHERCHE — LE MÊME PLIAGE QUE LE SERVEUR
// ═══════════════════════════════════════════════════════════════════════════
//
// La recherche du catalogue part en `LIKE` sur SQLite, qui ne connaît pas les
// accents (« eclat » ne trouve pas « Éclat »). Le serveur stocke donc, pour
// chaque produit, un texte déjà plié (`products.search_text`,
// `backend/catalog/searchkey`) ; la requête doit être pliée EXACTEMENT de la
// même façon, sans quoi on chercherait sur une forme que la base ne porte pas —
// sans erreur, avec zéro résultat.
//
// Mêmes cas que `backend/catalog/searchkey/searchkey_test.go` : c'est ce qui
// garde les deux copies d'accord.

/** Au-delà, les mots en trop sont ignorés : chacun ajoute une condition au
 *  filtre, et une phrase collée en entier n'a pas à le faire exploser. */
export const MAX_MOTS_RECHERCHE = 6

/**
 * Plie un texte : ligatures dépliées, accents retirés, minuscules, espaces
 * normalisés. « Cœur de Lion » et « coeur de lion » donnent la même chaîne.
 *
 * `œ` et `æ` d'abord : la décomposition NFD ne les touche pas, et « coeur » doit
 * trouver « cœur » comme « eclat » trouve « Éclat ».
 */
export function cleDeRecherche(texte: string): string {
	return texte
		.replace(/[œŒ]/g, 'oe')
		.replace(/[æÆ]/g, 'ae')
		.normalize('NFD')
		.replace(/\p{Mn}/gu, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim()
}

/**
 * Les mots d'une recherche, pliés. Chacun doit se retrouver QUELQUE PART — dans
 * le produit, sa marque ou l'une de ses catégories — sans que ce soit le même
 * champ : « lag 4/4 » trouve une guitare de marque Lag dont le nom dit « 4/4 ».
 */
export function motsDeRecherche(terme: string): string[] {
	return cleDeRecherche(terme)
		.split(' ')
		.filter((mot) => mot !== '')
		.slice(0, MAX_MOTS_RECHERCHE)
}
