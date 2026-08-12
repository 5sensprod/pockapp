// frontend/lib/queries/site-catalog.ts
// ═══════════════════════════════════════════════════════════════════════════
// ACCÈS DONNÉES — CATALOGUE DESTINÉ AU SITE  (lecture seule)
// ═══════════════════════════════════════════════════════════════════════════
// Lit le catalogue **PocketBase**, pas AppPos. C'est délibéré et ce n'est pas
// la bascule T7 : ce qui part vers le site est la projection PocketBase, donc
// la vue qui la contrôle doit lire cette base-là. Les écrans du module stock,
// eux, continuent de lire AppPos jusqu'à T7.
//
// **Ce fichier n'écrit rien.** Aucune mutation ici — le catalogue est encore
// une projection rechargée par purge (`catalog-import -load`), et une écriture
// n'y survivrait pas. Voir la note en tête de CatalogueEnLignePage.tsx.
//
// Schéma lu : backend/migrations/catalog_v2.go.
// ═══════════════════════════════════════════════════════════════════════════

import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
// Déclarés ici, comme ceux de site-menu.ts et pour la même raison :
// `pnpm typegen` reste interdit tant que apppos-transformers.ts n'est pas
// aligné (CLAUDE.md). Ces types sont la forme *lue*, restreinte aux champs
// demandés dans `fields` ci-dessous — pas le schéma complet.

/** Champs communs nécessaires à `pb.files.getUrl` pour résoudre un fichier. */
type FileBearing = {
	id: string
	collectionId: string
	collectionName: string
}

/** `status` porte l'intention de publication — catalog_v2.go:606. C'est lui,
 *  et lui seul, qui décide de ce qui part vers le site. */
export type CatalogProductStatus = 'draft' | 'published'

export type CatalogProduct = FileBearing & {
	/** Identifiant NeDB d'origine. **Clé de l'export**, stable au rechargement. */
	legacy_id: string
	name: string
	designation?: string
	sku?: string
	slug?: string
	status: CatalogProductStatus
	price_ttc?: number
	tax_rate?: number
	stock?: number
	description?: string
	image?: string
	/** Relation simple vers `brands`. Chaîne vide si absente. */
	brand?: string
	/** Relation multiple vers `categories`. Un produit a un ensemble de
	 *  catégories, sans catégorie principale (docs/DECISIONS.md). */
	categories?: string[]
}

export type CatalogCategory = FileBearing & {
	legacy_id: string
	name: string
	slug?: string
	description?: string
	image?: string
	is_featured?: boolean
	/** Relation vers `categories`. Chaîne vide à la racine. */
	parent?: string
}

export type CatalogBrand = FileBearing & {
	legacy_id: string
	name: string
	slug?: string
	description?: string
	image?: string
}

// ---------------------------------------------------------------------------
// LECTURE
// ---------------------------------------------------------------------------
// `fields` restreint la charge utile : le catalogue porte ~3000 produits et
// les descriptions ne servent pas ici. `collectionId` et `collectionName` sont
// indispensables — sans eux `pb.files.getUrl` ne sait pas construire l'URL.
//
// Pas de filtre sur `company`, sciemment : le chargeur a écrit une entreprise
// et il n'est pas établi qu'elle soit celle qu'on a en session. Filtrer à
// l'aveugle donnerait un écran vide sans dire pourquoi. Sans effet tant qu'il
// n'y a qu'une entreprise — c'est la même limite que les règles d'accès du
// catalogue, déjà consignée au §7 du rituel de reprise.

// `legacy_id` est demandé partout : c'est la CLÉ de l'export vers la base SQL
// Axemusique. Les identifiants PocketBase, eux, sont régénérés à chaque
// rechargement par purge et ne peuvent pas servir de clé distante — §1 de
// PocketSite-docs/12-contrat-catalogue.md.
const PRODUCT_FIELDS =
	'id,collectionId,collectionName,legacy_id,name,designation,sku,slug,description,status,price_ttc,tax_rate,stock,image,brand,categories'
const CATEGORY_FIELDS =
	'id,collectionId,collectionName,legacy_id,name,slug,description,image,is_featured,parent'
const BRAND_FIELDS =
	'id,collectionId,collectionName,legacy_id,name,slug,description,image'

// Le catalogue bouge au rythme des rechargements par purge, pas à la seconde.
// `new QueryClient()` (frontend/main.tsx:17) ne fixe aucun `staleTime`, donc la
// valeur par défaut est 0 : sans la ligne ci-dessous, revenir sur l'écran
// relance les 2562 produits, les 463 catégories et les 287 marques à chaque
// fois. Cinq minutes rendent le retour instantané sans jamais servir une donnée
// d'une autre session.
const CATALOG_STALE_TIME = 5 * 60_000

/** Les produits publiés — l'ensemble exact de ce qui est destiné au site. */
export function usePublishedProducts() {
	const pb = usePocketBase() as any

	return useQuery<CatalogProduct[]>({
		queryKey: ['site-catalog', 'products', 'published'],
		staleTime: CATALOG_STALE_TIME,
		queryFn: async () =>
			(await pb.collection('products').getFullList({
				filter: 'status = "published"',
				fields: PRODUCT_FIELDS,
				sort: 'name',
			})) as CatalogProduct[],
	})
}

/** Le décompte total des produits, toutes intentions confondues. Sert au seul
 *  usage de situer les publiés dans l'ensemble — 1 requête, 1 enregistrement
 *  ramené. */
export function useProductCount() {
	const pb = usePocketBase() as any

	return useQuery<number>({
		queryKey: ['site-catalog', 'products', 'count'],
		staleTime: CATALOG_STALE_TIME,
		queryFn: async () => {
			const res = await pb
				.collection('products')
				.getList(1, 1, { fields: 'id', skipTotal: false })
			return res.totalItems as number
		},
	})
}

/** **Toutes** les catégories, pas seulement celles en ligne : la mise en ligne
 *  est dérivée des produits, elle ne se lit pas sur la catégorie. Le tri est
 *  fait ici pour que l'ordre des frères soit stable d'un rendu à l'autre. */
export function useCatalogCategories() {
	const pb = usePocketBase() as any

	return useQuery<CatalogCategory[]>({
		queryKey: ['site-catalog', 'categories'],
		staleTime: CATALOG_STALE_TIME,
		queryFn: async () =>
			(await pb.collection('categories').getFullList({
				fields: CATEGORY_FIELDS,
				sort: 'name',
			})) as CatalogCategory[],
	})
}

/** Toutes les marques. Celles qui sont en ligne se déduisent des produits
 *  publiés, exactement comme les catégories. */
export function useCatalogBrands() {
	const pb = usePocketBase() as any

	return useQuery<CatalogBrand[]>({
		queryKey: ['site-catalog', 'brands'],
		staleTime: CATALOG_STALE_TIME,
		queryFn: async () =>
			(await pb.collection('brands').getFullList({
				fields: BRAND_FIELDS,
				sort: 'name',
			})) as CatalogBrand[],
	})
}
