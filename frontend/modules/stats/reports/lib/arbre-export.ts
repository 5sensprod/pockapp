// frontend/modules/stats/reports/lib/arbre-export.ts
//
// LA RÈGLE DE L'ARBRE DE L'EXPORT, SÉPARÉE DE L'ACCÈS AUX DONNÉES.
//
// Ce fichier n'importe rien du dépôt, et c'est ce qui le rend testable :
// `lib/queries/categories.ts` construit un client PocketBase au chargement du
// module, donc lit `window`. C'est la même précaution que
// `frontend/lib/realtime/catalog-realtime.ts`.

export interface NoeudCategorieExport {
	_id: string
	name: string
	children: NoeudCategorieExport[]
	/** Fiches valorisées rangées DIRECTEMENT dans cette catégorie. */
	productsInStockCount: number
	/** Elle et toute sa descendance, sans compter deux fois. */
	totalProductsInStock: number
}

export interface DecompteCategorie {
	direct: number
	total: number
}

/**
 * L'arbre des catégories QUI ONT DU STOCK À VALORISER, projeté en forme NeDB.
 *
 * Une branche dont le total est nul disparaît entièrement : la modale annonce
 * « avec stock uniquement », et proposer 463 catégories dont 300 sont vides
 * était le défaut de l'écran d'origine.
 */
export function construireArbreExport(
	categories: { id: string; name: string; parent?: string }[],
	parCategorie: Record<string, DecompteCategorie>,
): NoeudCategorieExport[] {
	const noeuds = new Map<string, NoeudCategorieExport>()
	for (const categorie of categories) {
		const decompte = parCategorie[categorie.id]
		noeuds.set(categorie.id, {
			_id: categorie.id,
			name: categorie.name,
			children: [],
			productsInStockCount: decompte?.direct ?? 0,
			totalProductsInStock: decompte?.total ?? 0,
		})
	}

	const racines: NoeudCategorieExport[] = []
	for (const categorie of categories) {
		const noeud = noeuds.get(categorie.id)
		if (!noeud) continue
		const parent = categorie.parent ? noeuds.get(categorie.parent) : undefined
		// Un parent inconnu — hors entreprise, ou effacé — fait de l'enfant une
		// racine plutôt que de le faire disparaître de l'arbre.
		if (parent) parent.children.push(noeud)
		else racines.push(noeud)
	}

	const elaguer = (liste: NoeudCategorieExport[]): NoeudCategorieExport[] =>
		liste
			.filter((noeud) => noeud.totalProductsInStock > 0)
			.map((noeud) => ({ ...noeud, children: elaguer(noeud.children) }))
			.sort((a, b) => a.name.localeCompare(b.name, 'fr'))

	return elaguer(racines)
}
