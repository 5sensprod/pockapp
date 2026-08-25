// frontend/lib/queries/category-tree.ts
//
// L'arbre des catégories, vu comme deux besoins et deux seulement : filtrer sur
// une branche entière, et proposer les catégories dans un ordre lisible.
//
// **Filtrer sur une catégorie doit filtrer sur sa BRANCHE.** Un produit est
// rattaché à ses catégories feuilles, jamais à leurs ancêtres : demander
// « Guitares » en ne testant que `categories ~ <id de Guitares>` rend les
// quelques produits posés directement sur le nœud, et cache les centaines
// rangés sous « Guitares › Électriques ». Vu de l'utilisateur, le filtre
// paraît cassé sans dire pourquoi.
//
// Mesuré le 18 août 2026 dans la base : 464 catégories, 47 racines, profondeur
// maximale 3, et la plus grosse branche compte 62 catégories. C'est ce qui rend
// l'énumération des descendants acceptable en filtre.

/** Le strict nécessaire : ces fonctions ne lisent que l'identité et le lien de
 *  parenté, pas la forme complète d'une catégorie. */
export interface CategoryNode {
	id: string
	name: string
	/** Chaîne vide à la racine — jamais `undefined` côté PocketBase. */
	parent?: string
}

/**
 * L'identifiant demandé, suivi de tous ses descendants.
 *
 * Rend `[]` pour un identifiant inconnu : un filtre sur une catégorie qui
 * n'existe pas ne doit rien rendre, surtout pas tout.
 */
export function collectBranchIds(
	categories: CategoryNode[],
	rootId: string,
): string[] {
	if (!rootId || !categories.some((c) => c.id === rootId)) return []

	const enfantsDe = new Map<string, string[]>()
	for (const categorie of categories) {
		const parent = categorie.parent || ''
		if (!parent) continue
		const fratrie = enfantsDe.get(parent)
		if (fratrie) fratrie.push(categorie.id)
		else enfantsDe.set(parent, [categorie.id])
	}

	// Parcours itératif avec ensemble de visités : une donnée importée peut
	// porter un cycle — un parent qui est aussi son propre descendant — et une
	// récursion naïve tournerait alors sans fin, écran figé.
	const branche: string[] = []
	const vus = new Set<string>()
	const pile = [rootId]
	while (pile.length) {
		const courant = pile.pop() as string
		if (vus.has(courant)) continue
		vus.add(courant)
		branche.push(courant)
		pile.push(...(enfantsDe.get(courant) ?? []))
	}
	return branche
}

export interface CategoryOption {
	id: string
	name: string
	/** 0 pour une racine. Sert à indenter, pas à trier. */
	depth: number
}

// `collectPopulatedCategoryIds` vivait ici jusqu'au 25 août 2026 : elle
// remontait l'arbre pour marquer visible tout ancêtre d'une catégorie peuplée.
// Elle a été SUPPRIMÉE plutôt que gardée sans appelant, parce que la nourrir
// demandait les identifiants des 2999 produits. Le serveur rend désormais un
// `total` par catégorie, déjà remonté et déjà dédoublonné
// (`backend/routes/catalog_counts_routes.go`) : « peuplée » se lit
// `total > 0`. Ne pas la réintroduire — la garder ici, morte, n'aurait servi
// qu'à ramener un jour le balayage complet avec elle.

/**
 * Les catégories dans l'ordre de l'arbre : chaque racine suivie de sa
 * descendance, chaque fratrie par ordre alphabétique.
 *
 * Une liste de 464 entrées triées à plat par nom ne dit pas qui est sous qui —
 * et c'est justement ce qu'il faut savoir pour choisir une racine.
 */
export function toCategoryOptions(
	categories: CategoryNode[],
): CategoryOption[] {
	const parLangue = (a: CategoryNode, b: CategoryNode) =>
		a.name.localeCompare(b.name, 'fr')

	const enfantsDe = new Map<string, CategoryNode[]>()
	const connus = new Set(categories.map((c) => c.id))
	const racines: CategoryNode[] = []
	for (const categorie of categories) {
		const parent = categorie.parent || ''
		// Une catégorie dont le parent a disparu est traitée comme une racine :
		// la cacher la rendrait inatteignable au filtre.
		if (!parent || !connus.has(parent)) {
			racines.push(categorie)
			continue
		}
		const fratrie = enfantsDe.get(parent)
		if (fratrie) fratrie.push(categorie)
		else enfantsDe.set(parent, [categorie])
	}

	const options: CategoryOption[] = []
	const vus = new Set<string>()
	const descendre = (noeud: CategoryNode, depth: number) => {
		if (vus.has(noeud.id)) return
		vus.add(noeud.id)
		options.push({ id: noeud.id, name: noeud.name, depth })
		for (const enfant of (enfantsDe.get(noeud.id) ?? []).sort(parLangue)) {
			descendre(enfant, depth + 1)
		}
	}
	for (const racine of racines.sort(parLangue)) descendre(racine, 0)

	// Un composant cyclique n'a aucune racine et serait donc absent du
	// sélecteur. Les nœuds encore inconnus sont exposés comme des racines de
	// secours ; `vus` arrête le parcours lorsque le cycle se referme.
	for (const categorie of [...categories].sort(parLangue)) {
		if (!vus.has(categorie.id)) descendre(categorie, 0)
	}
	return options
}
