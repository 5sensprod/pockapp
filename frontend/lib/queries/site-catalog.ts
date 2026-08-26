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
	/** La galerie, **dans son ordre** : c'est lui qui fait l'ordre des rangs du
	 *  miroir d'images (§4.1 de PocketSite-docs/16-conception-images.md), et
	 *  c'est déjà lui qui fait l'ordre des vignettes en caisse (CLAUDE.md).
	 *
	 *  Il a fallu l'ajouter à `PRODUCT_FIELDS` en même temps : un champ absent
	 *  de `fields` revient VIDE SANS ERREUR — c'est ce qui a caché 747 galeries
	 *  pendant une semaine. Gardien : `catalog-fields.test.ts`. */
	gallery?: string[]
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
export const PRODUCT_FIELDS =
	'id,collectionId,collectionName,legacy_id,name,designation,sku,slug,description,status,price_ttc,tax_rate,stock,image,gallery,brand,categories'
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

// ---------------------------------------------------------------------------
// OPTIONS DE REQUÊTE — la même définition pour les écrans et pour la file
// ---------------------------------------------------------------------------
// Les hooks ci-dessous montent ces options ; la file de synchronisation
// (`frontend/lib/sync/SyncQueueProvider.tsx`) les passe à `fetchQuery` afin
// qu'une donnée invalidée soit réellement relue avant l'export.
// C'est le même `queryKey` et la même `queryFn` des deux côtés : la file
// réutilise donc le cache déjà rempli par l'écran quand il est ouvert, et
// charge elle-même quand il ne l'est pas. Deux définitions parallèles
// finiraient par diverger sur les `fields`, et un champ manquant à l'export ne
// lève jamais — c'est déjà ce qui a failli coûter 1767 images (CLAUDE.md).

export function catalogProductsQueryOptions(
	pb: unknown,
	intention: 'published' | 'unpublished',
) {
	return {
		queryKey: ['site-catalog', 'products', intention] as const,
		staleTime: CATALOG_STALE_TIME,
		queryFn: async () =>
			(await (pb as any).collection('products').getFullList({
				filter:
					intention === 'published'
						? 'status = "published"'
						: 'status != "published"',
				fields: PRODUCT_FIELDS,
				sort: 'name',
				// ⚠️ CLÉ D'ANNULATION EXPLICITE, et ce n'est pas cosmétique.
				// Le SDK PocketBase auto-annule une requête quand une autre part
				// avec la MÊME clé, et la clé par défaut se dérive de la méthode et
				// du chemin : ces deux requêtes-ci ne diffèrent que par leur
				// `filter`, donc elles la partagent. Lancées ensemble — c'est ce que
				// fait le `Promise.all` de `SyncQueueProvider` — la seconde tue la
				// première : « The request was autocancelled » (constaté le 26 août
				// 2026 en synchronisant depuis /stock/produits).
				// Invisible depuis /site/catalogue, où les deux listes sont déjà en
				// cache et où `ensureQueryData` ne déclenche aucun appel.
				requestKey: `site-catalog-products-${intention}`,
			})) as CatalogProduct[],
	}
}

export function catalogCategoriesQueryOptions(pb: unknown) {
	return {
		queryKey: ['site-catalog', 'categories'] as const,
		staleTime: CATALOG_STALE_TIME,
		queryFn: async () =>
			(await (pb as any).collection('categories').getFullList({
				fields: CATEGORY_FIELDS,
				sort: 'name',
				// Même raison que pour les produits : le module `stock` lit la même
				// collection de son côté, et deux requêtes de même clé s'annulent.
				requestKey: 'site-catalog-categories',
			})) as CatalogCategory[],
	}
}

export function catalogBrandsQueryOptions(pb: unknown) {
	return {
		queryKey: ['site-catalog', 'brands'] as const,
		staleTime: CATALOG_STALE_TIME,
		queryFn: async () =>
			(await (pb as any).collection('brands').getFullList({
				fields: BRAND_FIELDS,
				sort: 'name',
				// Même raison que pour les produits et les catégories.
				requestKey: 'site-catalog-brands',
			})) as CatalogBrand[],
	}
}

/** Les produits publiés — l'ensemble exact de ce qui est destiné au site. */
export function usePublishedProducts() {
	const pb = usePocketBase() as any

	return useQuery<CatalogProduct[]>(
		catalogProductsQueryOptions(pb, 'published'),
	)
}

/**
 * Les produits qui NE SONT PLUS destinés au site — tout ce qui n'est pas
 * `published`.
 *
 * Miroir exact de `usePublishedProducts`, et il a fallu l'écrire le 21 août
 * 2026 pour une raison précise : repasser une fiche en brouillon la faisait
 * DISPARAÎTRE de l'écran, donc des compteurs, donc de l'export — pendant que sa
 * ligne SQL restait `published` et que le site continuait de la servir. Un
 * produit ne peut être dépublié que par un écran capable de le voir.
 *
 * Ces fiches ne rejoignent JAMAIS `products.data` : elles n'ont rien à faire
 * dans les grilles du catalogue en ligne ni dans le panneau d'images (le miroir
 * répondrait 409 pour celles que la base du site ne connaît pas). L'appelant
 * les croise avec l'inventaire distant et n'en retient que celles qui y sont —
 * les autres n'ont jamais été en ligne et n'ont rien à retirer.
 *
 * Volume : 436 brouillons mesurés le 20 août 2026, contre 2563 publiés. Une
 * requête de plus, du même ordre de grandeur qu'un dixième de l'existante.
 */
export function useUnpublishedProducts() {
	const pb = usePocketBase() as any

	return useQuery<CatalogProduct[]>(
		catalogProductsQueryOptions(pb, 'unpublished'),
	)
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

	return useQuery<CatalogCategory[]>(catalogCategoriesQueryOptions(pb))
}

/** Toutes les marques. Celles qui sont en ligne se déduisent des produits
 *  publiés, exactement comme les catégories. */
export function useCatalogBrands() {
	const pb = usePocketBase() as any

	return useQuery<CatalogBrand[]>(catalogBrandsQueryOptions(pb))
}
