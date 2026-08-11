// frontend/modules/site/lib/online-catalog.ts
// ═══════════════════════════════════════════════════════════════════════════
// LA RÈGLE DE MISE EN LIGNE, ET RIEN D'AUTRE
// ═══════════════════════════════════════════════════════════════════════════
// Fonctions pures, sans React ni PocketBase, pour qu'elles soient vérifiables
// seules — voir online-catalog.test.ts.
//
// La règle est celle arrêtée au modèle cible (docs/DECISIONS.md, 2026-08-10) :
//
//   • un PRODUIT est en ligne si `status = published`. C'est la seule autorité ;
//   • une CATÉGORIE est en ligne si elle contient un produit publié,
//     **descendants compris** ; ses ancêtres le sont par voie de conséquence ;
//   • une MARQUE est en ligne si elle porte au moins un produit publié.
//
// Elle n'est pas saisie, elle est dérivée. Aucune de ces trois entités ne
// porte de champ « en ligne », et il ne faut pas en ajouter : ce serait un
// état à tenir à jour, donc un état qui dérive — c'est précisément ce qui
// s'est produit du côté WooCommerce.
// ═══════════════════════════════════════════════════════════════════════════

import type {
	CatalogBrand,
	CatalogCategory,
	CatalogProduct,
} from '@/lib/queries/site-catalog'

/** Une catégorie en ligne, avec sa descendance et ses décomptes. */
export type OnlineCategoryNode = {
	category: CatalogCategory
	children: OnlineCategoryNode[]
	/** Produits publiés rattachés directement à cette catégorie. */
	directCount: number
	/** Produits publiés de cette catégorie et de toute sa descendance, comptés
	 *  une fois chacun — un produit rattaché à deux catégories sœurs compte
	 *  une seule fois dans leur ancêtre commun. */
	totalCount: number
	depth: number
}

export type OnlineBrand = {
	brand: CatalogBrand
	productCount: number
}

export type OnlineCatalog = {
	/** Les racines de l'arbre des catégories en ligne. */
	tree: OnlineCategoryNode[]
	onlineCategoryIds: Set<string>
	brands: OnlineBrand[]
	/** Produits publiés rattachés à aucune catégorie existante. Ils partiraient
	 *  vers le site sans point d'entrée dans la navigation : c'est un constat à
	 *  remonter, pas une erreur à corriger en silence. */
	uncategorized: CatalogProduct[]
	/** Catégories citées par un produit mais absentes de la collection.
	 *  Attendu vide — l'arbre a été reconstruit sans parent introuvable. */
	missingCategoryIds: string[]
	productsByCategory: Map<string, CatalogProduct[]>
}

/**
 * Les produits d'une catégorie, descendance comprise, dédoublonnés et triés
 * par nom. Sert l'affichage : le décompte du nœud, lui, est déjà calculé.
 */
export function collectSubtreeProducts(
	node: OnlineCategoryNode,
	productsByCategory: Map<string, CatalogProduct[]>,
): CatalogProduct[] {
	const seen = new Map<string, CatalogProduct>()

	const walk = (n: OnlineCategoryNode) => {
		for (const p of productsByCategory.get(n.category.id) ?? []) {
			seen.set(p.id, p)
		}
		for (const child of n.children) walk(child)
	}
	walk(node)

	return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/** Le parent d'une catégorie racine est la chaîne vide, pas `undefined`. */
const parentOf = (c: CatalogCategory): string => c.parent || ''

/**
 * Remonte la chaîne des ancêtres d'une catégorie, elle comprise.
 *
 * Le garde-fou sur les visités n'est pas décoratif : `categories.parent` est
 * une relation libre, rien au schéma n'interdit un cycle. Un cycle ferait
 * boucler l'affichage à l'infini ; ici il s'arrête et se voit.
 */
function ancestorChain(
	id: string,
	byId: Map<string, CatalogCategory>,
): string[] {
	const chain: string[] = []
	const seen = new Set<string>()
	let current = id

	while (current && byId.has(current) && !seen.has(current)) {
		seen.add(current)
		chain.push(current)
		current = parentOf(byId.get(current) as CatalogCategory)
	}

	return chain
}

/**
 * Applique la règle et construit l'arbre de ce qui part vers le site.
 *
 * `products` doit être l'ensemble des produits **publiés** ; la fonction ne
 * refiltre pas sur `status`, elle prend ce qu'on lui donne. C'est ce qui
 * permet de lui passer un sous-ensemble filtré par la recherche sans que la
 * règle change de nature.
 */
export function buildOnlineCatalog(
	products: CatalogProduct[],
	categories: CatalogCategory[],
	brands: CatalogBrand[],
): OnlineCatalog {
	const byId = new Map(categories.map((c) => [c.id, c]))

	const productsByCategory = new Map<string, CatalogProduct[]>()
	const directIds = new Set<string>()
	const missing = new Set<string>()
	const uncategorized: CatalogProduct[] = []
	const brandCounts = new Map<string, number>()

	for (const p of products) {
		const refs = p.categories ?? []
		let attached = false

		for (const catId of refs) {
			if (!byId.has(catId)) {
				missing.add(catId)
				continue
			}
			attached = true
			directIds.add(catId)
			const list = productsByCategory.get(catId)
			if (list) list.push(p)
			else productsByCategory.set(catId, [p])
		}

		if (!attached) uncategorized.push(p)

		if (p.brand) {
			brandCounts.set(p.brand, (brandCounts.get(p.brand) ?? 0) + 1)
		}
	}

	// Les ancêtres suivent — c'est la seconde moitié de la règle.
	const onlineCategoryIds = new Set<string>()
	for (const id of directIds) {
		for (const ancestor of ancestorChain(id, byId)) {
			onlineCategoryIds.add(ancestor)
		}
	}

	// ── Arbre ────────────────────────────────────────────────────────────────
	// Une catégorie en ligne dont le parent ne l'est pas ne peut pas exister :
	// tout ancêtre d'une catégorie en ligne est en ligne. Un parent absent de
	// la collection, en revanche, remonte son enfant à la racine plutôt que de
	// le faire disparaître.
	const childrenOf = new Map<string, CatalogCategory[]>()
	const roots: CatalogCategory[] = []

	for (const c of categories) {
		if (!onlineCategoryIds.has(c.id)) continue
		const parent = parentOf(c)
		if (parent && byId.has(parent) && onlineCategoryIds.has(parent)) {
			const list = childrenOf.get(parent)
			if (list) list.push(c)
			else childrenOf.set(parent, [c])
		} else {
			roots.push(c)
		}
	}

	// Le calcul a besoin de porter l'ensemble des produits du sous-arbre pour
	// dédoublonner en remontant ; ce n'est pas du contrat, d'où le type interne.
	type BuiltNode = OnlineCategoryNode & {
		children: BuiltNode[]
		subtreeProductIds: Set<string>
	}

	const build = (c: CatalogCategory, depth: number): BuiltNode => {
		const children = (childrenOf.get(c.id) ?? []).map((child) =>
			build(child, depth + 1),
		)

		// Dédoublonnage sur l'identifiant produit : un même produit peut être
		// rattaché à plusieurs catégories de la même branche, et il ne doit pas
		// compter deux fois dans leur ancêtre.
		const subtree = new Set<string>(
			(productsByCategory.get(c.id) ?? []).map((p) => p.id),
		)
		for (const child of children) {
			for (const id of child.subtreeProductIds) subtree.add(id)
		}

		return {
			category: c,
			children,
			directCount: productsByCategory.get(c.id)?.length ?? 0,
			totalCount: subtree.size,
			depth,
			subtreeProductIds: subtree,
		}
	}

	const tree = roots.map((r) => build(r, 0))

	const onlineBrands: OnlineBrand[] = brands
		.filter((b) => (brandCounts.get(b.id) ?? 0) > 0)
		.map((b) => ({ brand: b, productCount: brandCounts.get(b.id) as number }))
		.sort((a, b) => b.productCount - a.productCount)

	return {
		tree,
		onlineCategoryIds,
		brands: onlineBrands,
		uncategorized,
		missingCategoryIds: [...missing],
		productsByCategory,
	}
}
