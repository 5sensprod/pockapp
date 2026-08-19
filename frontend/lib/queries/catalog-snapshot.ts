// frontend/lib/queries/catalog-snapshot.ts
// ═══════════════════════════════════════════════════════════════════════════
// LE CATALOGUE ENTIER, POUR L'INVENTAIRE PHYSIQUE — POCKETBASE
// ═══════════════════════════════════════════════════════════════════════════
// Source explicite : PocketBase, et rien d'autre (docs/DECISIONS.md,
// 2026-08-13). Ce fichier remplace `appPosApi.getProducts()`, dernier appel
// d'AppPos du module `stock`.
//
// ⚠️ POURQUOI `getFullList` ET NON `useCatalogProducts`.
// Une session d'inventaire ouvre un SNAPSHOT : une entrée par produit du
// périmètre. `useCatalogProducts` est paginé côté serveur — il rendrait 25
// lignes sans le dire, ce qui a déjà donné « 0 produit » sur 205 marques
// (§6 quater du rituel). Ici on prend tout, et l'appelant peut compter ce
// qu'il a reçu.
//
// ⚠️ LES DEUX FORMES D'IDENTIFIANT.
// Les 2465 entrées déjà en base portent des identifiants NeDB (mesuré le
// 19 août 2026 : 0 se résout par `products.id`, 2370 par `products.legacy_id`,
// 95 par aucun des deux). Les sessions neuves écrivent l'identifiant
// PocketBase. `indexCatalogueParCle` indexe donc sur LES DEUX, comme le fait
// déjà `applyStockMovements` côté écriture (`stock-adjust.ts`).

import { useQuery } from '@tanstack/react-query'

/** Ce que l'inventaire LIT d'un produit — et rien d'autre. */
export interface CatalogSnapshotProduct {
	/** Identifiant PocketBase. C'est lui qu'on écrit dans les entrées neuves. */
	id: string
	/** La clé stable — identifiant NeDB, ou `pa_…` pour ce qui est né ici. */
	legacyId: string
	name: string
	sku: string
	barcode: string
	/** URL prête à poser dans un `<img src>`, résolue par `pb.files.getUrl`. */
	imageUrl: string | null
	/** Identifiants PocketBase des catégories. */
	categories: string[]
	stock: number
}

const CHAMPS =
	'id,collectionId,legacy_id,name,sku,barcode,image,categories,stock'

type BrutProduit = {
	id: string
	collectionId: string
	legacy_id?: string | null
	name?: string | null
	sku?: string | null
	barcode?: string | null
	image?: string | null
	categories?: string[] | null
	stock?: number | null
}

export async function fetchCatalogSnapshot(
	pb: any,
	companyId?: string,
): Promise<CatalogSnapshotProduct[]> {
	const records: BrutProduit[] = await pb.collection('products').getFullList({
		// 2999 produits : par lots de 500, sept requêtes plutôt que soixante.
		batch: 500,
		fields: CHAMPS,
		filter: companyId
			? pb.filter('company = {:company}', { company: companyId })
			: undefined,
		sort: 'name',
	})

	return records.map((r) => ({
		id: r.id,
		legacyId: r.legacy_id ?? '',
		name: r.name ?? '',
		sku: r.sku ?? '',
		barcode: r.barcode ?? '',
		// `image` est un NOM DE FICHIER, pas une URL : seul `pb.files.getUrl` sait
		// en faire une, et il lui faut `collectionId` et `id` — d'où leur présence
		// dans les champs demandés.
		imageUrl: r.image ? pb.files.getUrl(r, r.image) : null,
		categories: r.categories ?? [],
		stock: Number(r.stock) || 0,
	}))
}

/** `pb` est PASSÉ, non importé : ce module reste testable sans instance
 *  PocketBase — la même raison que `toStockRow` (`catalog-rows.ts`). */
export function useCatalogSnapshot(pb: any, companyId?: string) {
	return useQuery<CatalogSnapshotProduct[]>({
		queryKey: ['catalog-snapshot', companyId],
		queryFn: () => fetchCatalogSnapshot(pb, companyId),
		// Le catalogue entier : on ne le redemande pas à chaque montage d'écran.
		staleTime: 5 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		enabled: !!companyId,
	})
}

/**
 * Indexe le catalogue sur SES DEUX CLÉS — `id` PocketBase et `legacy_id`.
 * Une entrée d'inventaire porte l'une ou l'autre selon sa date : ne tester que
 * `id` rendrait illisibles les 196 sessions déjà en base.
 */
export function indexCatalogueParCle(
	produits: CatalogSnapshotProduct[],
): Map<string, CatalogSnapshotProduct> {
	const index = new Map<string, CatalogSnapshotProduct>()
	for (const p of produits) {
		index.set(p.id, p)
		if (p.legacyId) index.set(p.legacyId, p)
	}
	return index
}

/** `undefined` quand le produit n'existe plus au catalogue — 95 entrées. */
export function resoudreProduit(
	index: Map<string, CatalogSnapshotProduct>,
	cle: string | null | undefined,
): CatalogSnapshotProduct | undefined {
	return cle ? index.get(cle) : undefined
}

// ---------------------------------------------------------------------------
// L'ARBRE DES CATÉGORIES, AVEC SES COMPTEURS
// ---------------------------------------------------------------------------
// `useAppPosCategoriesWithCounts` rendait cet arbre tout fait, compté par
// AppServe. PocketBase ne compte pas : on compte ici, sur le snapshot déjà
// chargé — donc sur les produits réellement listés, et non sur un total qui
// pourrait le contredire. La forme rendue est CELLE DE L'ANCIEN HOOK (`_id`,
// `children`, `productCount`, `totalProductCount`) pour que l'écran n'ait pas
// à changer sa lecture.

export interface CategorieArbre {
	_id: string
	name: string
	parent_id: string | null
	children: CategorieArbre[]
	/** Produits rattachés directement à cette catégorie. */
	productCount: number
	/** Cette catégorie et toute sa descendance. */
	totalProductCount: number
}

type CategoriePlate = { id: string; name?: string; parent?: string | null }

export function construireArbreCategories(
	categories: CategoriePlate[],
	produits: CatalogSnapshotProduct[],
): CategorieArbre[] {
	const directs = new Map<string, number>()
	for (const p of produits) {
		for (const catId of p.categories) {
			directs.set(catId, (directs.get(catId) ?? 0) + 1)
		}
	}

	const noeuds = new Map<string, CategorieArbre>()
	for (const c of categories) {
		noeuds.set(c.id, {
			_id: c.id,
			name: c.name ?? '',
			parent_id: c.parent || null,
			children: [],
			productCount: directs.get(c.id) ?? 0,
			totalProductCount: 0,
		})
	}

	const racines: CategorieArbre[] = []
	for (const noeud of noeuds.values()) {
		// Un parent absent du lot fait une racine plutôt qu'une branche perdue :
		// sinon la catégorie et ses produits disparaissent de l'écran sans erreur.
		const parent = noeud.parent_id ? noeuds.get(noeud.parent_id) : undefined
		if (parent) parent.children.push(noeud)
		else racines.push(noeud)
	}

	const cumuler = (noeud: CategorieArbre): number => {
		noeud.totalProductCount =
			noeud.productCount +
			noeud.children.reduce((somme, enfant) => somme + cumuler(enfant), 0)
		return noeud.totalProductCount
	}
	for (const racine of racines) cumuler(racine)

	const trier = (liste: CategorieArbre[]) => {
		liste.sort((a, b) => a.name.localeCompare(b.name))
		for (const n of liste) trier(n.children)
	}
	trier(racines)

	return racines
}
