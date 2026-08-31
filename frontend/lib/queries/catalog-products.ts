// frontend/lib/queries/catalog-products.ts
// ═══════════════════════════════════════════════════════════════════════════
// LES PRODUITS DU CATALOGUE POCKETBASE — LECTURE, PAGINÉE CÔTÉ SERVEUR
// ═══════════════════════════════════════════════════════════════════════════
// Source explicite : PocketBase, et rien d'autre (docs/DECISIONS.md,
// 2026-08-13).
//
// **L'ÉCRITURE EST OUVERTE DEPUIS LE 13 AOÛT 2026.** L'arbitrage attendu — où
// vit la vérité du prix et du stock — a été rendu par la décision « AppPos sort
// de la logique à la prochaine release » : on écrit ici, la caisse et
// l'inventaire se raccordent en dernier, et les divergences avec NeDB sont
// acceptées d'ici là.
//
// Ce qui reste vrai malgré cela, et qui est affiché à l'écran : un
// `catalog-import -load` purge les collections. Toute saisie meurt avec.
//
// ⚠️ PAGINATION CÔTÉ SERVEUR, ET C'EST LA RAISON D'ÊTRE DE CE FICHIER.
// Le catalogue porte 2999 produits. `useProducts` (`products.ts`) rend
// `getList(1, 50)` : une page, sans le dire, ce qui a déjà produit un écran de
// compteurs à zéro. Ici la page est un paramètre, le total est rendu, et
// l'appelant sait sur quoi il travaille.
//
// Pas d'`expand` : les marques (287) et les catégories (463) sont déjà lues
// entières et mises en cache ailleurs. Les redemander à chaque page de 25
// produits coûterait plus que de les résoudre en mémoire.
//
// Schéma lu : backend/migrations/catalog_v2.go.
// ═══════════════════════════════════════════════════════════════════════════

import { usePocketBase } from '@/lib/use-pocketbase'
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { PocketBaseRecord } from './catalog-shapes'
import {
	type GalleryIntent,
	type ImageIntent,
	buildWritePayload,
} from './image-upload'
import { withLegacyKey } from './legacy-key'
import { slugLibreDansCollection } from './slug'

export type CatalogProductStatus = 'draft' | 'published'

/** L'état commercial d'un produit. **La chaîne vide VEUT DIRE neuf** : c'est le
 *  cas de l'immense majorité du catalogue, et lui imposer une valeur
 *  obligerait à écrire 3036 fiches pour n'exprimer que « rien de particulier »
 *  (DECISIONS, 2026-08-24).
 *
 *  ⚠️ Il ne décide PAS de la publication — `status` en est la seule autorité.
 *  Un produit d'occasion se publie comme un autre. */
export type CatalogCommercialState = '' | 'used' | 'rental'

/** L'OPÉRATION COMMERCIALE en cours sur un produit. **La chaîne vide VEUT DIRE
 *  normal** — plein tarif, rien de particulier —, comme le vide de
 *  `commercial_state` veut dire neuf.
 *
 *  ⚠️ **C'est un AXE DISTINCT de `commercial_state`, et volontairement.** Ce
 *  dernier dit ce que l'objet EST (occasion, location) et il est MONO-VALEUR :
 *  y verser `sale`/`promo` rendrait « instrument d'occasion soldé »
 *  inexprimable, alors que c'est un cas ordinaire. Les deux axes se combinent
 *  librement — un produit peut être `used` ET `sale`.
 *
 *  ⚠️ Il ne décide PAS de la publication (`status` en est la seule autorité),
 *  et il ne porte AUCUN prix : `price_ttc` reste le prix de vente, ceci n'est
 *  qu'une étiquette d'état.
 *
 *  Schéma : `backend/migrations/add_sale_state_to_products.go`. */
export type CatalogSaleState = '' | 'sale' | 'promo'

export type CatalogProductShape = PocketBaseRecord & {
	legacy_id: string
	/** **LE NOM DE LA FICHE PRODUIT SUR INTERNET** — c'est lui qui titre la page
	 *  publique : `toExportProduct` l'envoie dans `name`, et `catalog.php` ne
	 *  connaît que celui-là (`site_title` est resté `null` de bout en bout, voir
	 *  `frontend/modules/site/lib/catalog-export.ts:163`).
	 *
	 *  Quand il est vide, les écrans d'édition proposent `designation` comme
	 *  valeur de départ — jamais `sku` : une référence ne fait pas un titre. */
	name: string
	/** **LE NOM IMPRIMÉ SUR LE TICKET DE CAISSE.** Le terminal l'affiche en mode
	 *  `designation` et retombe sur `name` s'il est vide
	 *  (`frontend/lib/queries/pos.ts:109`). Il ne part JAMAIS vers le site. */
	designation?: string
	sku?: string
	barcode?: string
	slug?: string
	description?: string
	type?: 'simple' | 'service'
	status: CatalogProductStatus
	/** Vide = neuf. Voir `CatalogCommercialState`. */
	commercial_state?: CatalogCommercialState
	/** Vide = normal (ni soldé, ni en promotion). Voir `CatalogSaleState`.
	 *  Indépendant de `commercial_state` : les deux se cumulent. */
	sale_state?: CatalogSaleState
	price_ttc?: number
	purchase_price_ht?: number
	tax_rate?: number
	stock?: number
	min_stock?: number
	manage_stock?: boolean
	image?: string
	/** Les noms de fichiers de la galerie, DANS L'ORDRE — l'ordre est une
	 *  donnée (règle du 19 août 2026). Jusqu'à dix. */
	gallery?: string[]
	/** Relation simple vers `brands`. Chaîne vide si absente. */
	brand?: string
	/** Relation simple vers `suppliers`. */
	supplier?: string
	/** Particulier qui a confié l'article. Relation facultative vers
	 * `customers`, jamais vers `suppliers`. */
	consignor?: string
	/** Relation multiple vers `categories`. */
	categories?: string[]
	company?: string
}

export type CatalogProductPage = {
	items: CatalogProductShape[]
	page: number
	perPage: number
	totalItems: number
	totalPages: number
}

/** Exporté pour être GARDÉ : voir `catalog-fields.test.ts`. */
export const PRODUCT_FIELDS =
	// ⚠️ `gallery` a manqué à cette liste jusqu'au 19 août 2026, et c'est la
	// raison pour laquelle 747 galeries importées ne s'affichaient nulle part :
	// **un champ absent de `fields` revient vide, sans erreur.**
	'id,collectionId,collectionName,legacy_id,name,designation,sku,barcode,slug,description,status,commercial_state,sale_state,type,price_ttc,purchase_price_ht,tax_rate,stock,min_stock,manage_stock,image,gallery,brand,supplier,consignor,categories'

export type CatalogProductQuery = {
	companyId?: string
	page: number
	perPage: number
	/** Cherché dans le nom, la référence et le code-barres. */
	search?: string
	/** `undefined` = les deux intentions de publication. */
	status?: CatalogProductStatus
	/** Identifiant PocketBase d'une marque. */
	brandId?: string
	/** Les catégories retenues — une BRANCHE entière, racine comprise
	 *  (`category-tree.ts`, `collectBranchIds`). Un produit est rattaché à ses
	 *  feuilles, jamais à leurs ancêtres : filtrer sur la seule racine cacherait
	 *  tout ce qui est rangé dessous. Liste vide = pas de filtre. */
	categoryIds?: string[]
	/** Identifiant PocketBase d'un fournisseur. */
	supplierId?: string
	sort?: string
}

export function useCatalogProducts(query: CatalogProductQuery) {
	const pb = usePocketBase() as any
	const {
		companyId,
		page,
		perPage,
		search,
		status,
		brandId,
		categoryIds,
		supplierId,
		sort,
	} = query

	return useQuery<CatalogProductPage>({
		queryKey: [
			'catalog-products',
			companyId,
			page,
			perPage,
			search,
			status,
			brandId,
			categoryIds?.join(',') ?? '',
			supplierId,
			sort,
		],
		// Sans cela, changer de page vide la table le temps de la requête et la
		// hauteur saute. La page précédente reste affichée, grisée par l'appelant.
		placeholderData: keepPreviousData,
		staleTime: 60_000,
		queryFn: async () => {
			const clauses: string[] = []

			if (companyId) {
				clauses.push(pb.filter('company = {:company}', { company: companyId }))
			}
			if (status) {
				clauses.push(pb.filter('status = {:status}', { status }))
			}
			if (brandId) {
				clauses.push(pb.filter('brand = {:brand}', { brand: brandId }))
			}
			if (supplierId) {
				clauses.push(
					pb.filter('supplier = {:supplier}', { supplier: supplierId }),
				)
			}
			if (categoryIds?.length) {
				// `categories` est une relation MULTIPLE : `=` ne vaudrait que pour un
				// produit rattaché à cette seule catégorie. `~` teste l'appartenance.
				// La branche la plus large mesurée en base compte 62 catégories, ce
				// qui tient largement dans une chaîne de filtre.
				const ou = categoryIds
					.map((id) => pb.filter('categories ~ {:category}', { category: id }))
					.join(' || ')
				clauses.push(`(${ou})`)
			}

			const term = search?.trim()
			if (term) {
				// `pb.filter` échappe la valeur : une apostrophe dans un nom de
				// produit — il y en a — ne peut pas casser la requête, ni servir à
				// en injecter une autre.
				clauses.push(
					pb.filter('(name ~ {:q} || sku ~ {:q} || barcode ~ {:q})', {
						q: term,
					}),
				)
			}

			const result = await pb.collection('products').getList(page, perPage, {
				filter: clauses.length ? clauses.join(' && ') : undefined,
				fields: PRODUCT_FIELDS,
				sort: sort || 'name',
			})

			return {
				items: result.items as CatalogProductShape[],
				page: result.page as number,
				perPage: result.perPage as number,
				totalItems: result.totalItems as number,
				totalPages: result.totalPages as number,
			}
		},
		enabled: !!companyId,
	})
}

/** Une fiche complète, relue par identifiant pour ne pas dépendre de la page
 * paginée depuis laquelle on est arrivé. La clé de requête PocketBase est
 * explicite : deux lectures concurrentes de `products` ne doivent pas
 * s'auto-annuler dans le SDK. */
export function useCatalogProduct(productId?: string) {
	const pb = usePocketBase() as any

	return useQuery<CatalogProductShape>({
		queryKey: ['catalog-products', 'detail', productId],
		enabled: !!productId,
		staleTime: 60_000,
		queryFn: async () => {
			if (!productId) throw new Error('productId is required')
			return (await pb.collection('products').getOne(productId, {
				fields: PRODUCT_FIELDS,
				requestKey: `catalog-product-${productId}`,
			})) as CatalogProductShape
		},
	})
}

// ---------------------------------------------------------------------------
// RECHERCHE — le choix d'un produit dans un document
// ---------------------------------------------------------------------------
// Six écrans faisaient la même chose avec AppPos : se connecter avec
// `loginToAppPos('admin', 'admin123')`, charger LES 3000 PRODUITS d'un coup, et
// filtrer en mémoire à chaque frappe (facture, devis et commande, en création
// comme en modification). Ce hook remplace ce préambule.
//
// Trois choix, chacun pour une raison mesurée :
//
//  • **la recherche part au serveur**, comme dans `/stock/produits` : 2999
//    produits ne se chargent pas pour en choisir un ;
//  • **l'anti-rebond est ICI**, pas dans les écrans. Il y était absent : chaque
//    frappe relançait le filtre. 300 ms, la même valeur que `ProductsPage` ;
//  • **une liste courte sans recherche** — le sélecteur s'ouvre garni plutôt
//    que vide, et l'appelant n'a plus à faire `slice(0, 20)`.

const SEARCH_PER_PAGE = 25

export function useCatalogProductSearch(options: {
	companyId?: string
	term?: string
	/** Le sélecteur est fermé : rien ne part au serveur. */
	enabled?: boolean
}) {
	const { companyId, term = '', enabled = true } = options
	const [debounced, setDebounced] = useState(term)

	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(term), 300)
		return () => window.clearTimeout(timer)
	}, [term])

	const page = useCatalogProducts({
		// `useCatalogProducts` ne part qu'avec une entreprise : la retirer suffit
		// à ne rien demander tant que le sélecteur est fermé.
		companyId: enabled ? companyId : undefined,
		page: 1,
		perPage: SEARCH_PER_PAGE,
		search: debounced.trim() || undefined,
		// Un document ne se compose pas de brouillons : ce qui n'est pas publié
		// n'a pas de prix arrêté.
		status: 'published',
	})

	return {
		...page,
		items: (page.data?.items ?? []) as CatalogProductShape[],
		/** Vrai tant que la frappe n'est pas encore partie au serveur. */
		isTyping: debounced !== term,
	}
}

// ---------------------------------------------------------------------------
// ÉCRITURE
// ---------------------------------------------------------------------------
// Ouverte le 13 août 2026 (docs/DECISIONS.md). Elle écrit dans PocketBase et
// nulle part ailleurs : AppPos n'est jamais touché — la caisse en dépend
// jusqu'à la release, et c'est précisément ce qui rend cette écriture sûre.
//
// ⚠️ CE N'EST PAS `useUpdateProductUniversal`. Ce hook-là route entre deux
// bases sur une chaîne optionnelle (`products.ts:179`) ; celui-ci a une seule
// destination, nommée, sans paramètre à oublier.

/** Ce qu'un écran peut écrire. Deux absents, et chacun pour sa raison :
 *  - `slug` : figé au premier envoi vers le site, le serveur en est le gardien ;
 *  - `legacy_id` : posé par la couche, pas par l'écran — voir `useCreate…`.
 *
 *  L'IMAGE s'écrit depuis le 18 août 2026 (`ImageIntent`) et LA GALERIE depuis
 *  le 19 (`GalleryIntent`) : les installations neuves n'ont pas de dossier
 *  AppPos d'où les importer.
 *
 *  ⚠️ La galerie s'envoie ENTIÈRE : une entrée omise est un fichier supprimé.
 *  Voir `image-upload.ts`. */
export type CatalogProductWrite = ImageIntent &
	GalleryIntent & {
		name: string
		designation?: string
		sku?: string
		barcode?: string
		description?: string
		type?: 'simple' | 'service'
		status?: CatalogProductStatus
		commercial_state?: CatalogCommercialState
		sale_state?: CatalogSaleState
		price_ttc?: number
		purchase_price_ht?: number
		tax_rate?: number
		stock?: number
		min_stock?: number
		manage_stock?: boolean
		brand?: string
		supplier?: string
		/** Particulier qui a confié l'article. Relation facultative vers
		 * `customers`, distincte de `supplier`. */
		consignor?: string
		categories?: string[]
		company?: string
	}

/** Invalide TOUT ce qui dépend du catalogue : la liste paginée, mais aussi les
 *  décomptes par marque et par catégorie, et la vue « Catalogue en ligne » —
 *  qui recalcule ses empreintes et fera repasser le produit en « modifié ». */
export function invalidateCatalog(
	queryClient: ReturnType<typeof useQueryClient>,
) {
	queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
	queryClient.invalidateQueries({ queryKey: ['products'] })
	// Les décomptes du module `stock` sont calculés par le serveur et gardés
	// cinq minutes, ET ÉCRITS SUR LE DISQUE (`main.tsx`). Les oublier ici
	// figerait les compteurs de marques et de catégories bien au-delà de la
	// session : le pire cas n'est pas un écran en retard, c'est un écran en
	// retard qui le reste après un rechargement.
	queryClient.invalidateQueries({ queryKey: ['catalog-counts'] })
	queryClient.invalidateQueries({ queryKey: ['site-catalog'] })
}

/**
 * Le premier slug libre pour ce nom, l'unicité étant vérifiée dans PocketBase.
 *
 * Exportée parce que la RÉPARATION en a besoin : les produits créés avant le
 * 20 août 2026 sont partis sans slug, et l'écran doit pouvoir en proposer un.
 */
export async function resoudreSlugProduit(
	pb: any,
	nom: string,
): Promise<string> {
	return slugLibreDansCollection(pb, 'products', nom)
}

/**
 * Le slug d'un produit, garanti non vide — posé par la couche, jamais saisi.
 *
 * ⚠️ **Un slug déjà présent n'est jamais retouché.** C'est la règle §4.5 du
 * contrat, et elle a une raison concrète : le slug est l'adresse publique, il
 * vit dans les favoris et dans l'index des moteurs. Renommer un produit ne
 * doit pas déplacer sa page.
 *
 * Ce qui a manqué jusqu'au 20 août 2026, c'est l'autre moitié : QUI le pose
 * quand il n'y en a pas. Un produit créé au comptoir partait en ligne sans
 * slug, et son adresse rendait « Produit introuvable » — voir `slug.ts`.
 *
 * L'unicité est vérifiée dans PocketBase, pas côté site : `ax_products.slug`
 * n'a qu'un index simple (`server/sql/schema.sql:67`), pas de contrainte. Deux
 * produits homonymes s'y écraseraient l'un l'autre à l'affichage, sans erreur.
 */
async function withSlug(
	pb: any,
	data: CatalogProductWrite,
): Promise<CatalogProductWrite & { slug?: string }> {
	// `slug` reste ABSENT de `CatalogProductWrite` : aucun écran ne doit
	// pouvoir le saisir (§4.5). Il n'apparaît qu'ici, à la sortie.
	const fourni = (data as { slug?: unknown }).slug
	if (typeof fourni === 'string' && fourni.trim() !== '') return data

	const slug = await resoudreSlugProduit(pb, data.name ?? '')

	// Un nom sans aucun caractère utilisable ne donne pas d'adresse. On
	// enregistre quand même — la caisse ne doit pas refuser une vente pour un
	// slug — et l'export refusera le produit tant qu'il n'en a pas.
	return slug === '' ? data : { ...data, slug }
}

export function useCreateCatalogProduct() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: CatalogProductWrite) => {
			// La clé stable ET l'adresse publique sont posées ICI, pas dans le
			// formulaire. Un produit sans `legacy_id` n'est pas seulement refusé à
			// l'export, il disparaît des relations des autres (docs/DECISIONS.md,
			// 2026-08-13) ; un produit sans `slug` part en ligne avec une adresse
			// que le site ne sait pas résoudre (20 août 2026). Aucun écran ne doit
			// pouvoir les oublier.
			const payload = withLegacyKey(await withSlug(pb, data))
			return (await pb
				.collection('products')
				.create(buildWritePayload(payload))) as CatalogProductShape
		},
		onSuccess: () => invalidateCatalog(queryClient),
	})
}

export function useUpdateCatalogProduct() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: { id: string; data: Partial<CatalogProductWrite> }) =>
			(await pb
				.collection('products')
				.update(id, buildWritePayload(data))) as CatalogProductShape,
		onSuccess: () => invalidateCatalog(queryClient),
	})
}

/**
 * SUPPRIMER L'IMAGE PRINCIPALE, sans toucher à la galerie.
 *
 * Le geste est volontairement distinct de la promotion et son corps ne porte
 * JAMAIS `gallery` : même non vide, elle reste complète, dans son ordre, et
 * aucune de ses entrées ne devient principale automatiquement. Une promotion
 * silencieuse choisirait à la place de l'utilisateur ; joindre la galerie
 * risquerait en plus de renvoyer un instantané périmé dont une omission
 * supprimerait un fichier.
 *
 * `buildWritePayload` traduit `removeImage` en `image: ''`. PocketBase supprime
 * alors le fichier du stockage : l'écran doit donc confirmer AVANT cet appel.
 */
export function productMainImageRemovalPayload() {
	return buildWritePayload({ removeImage: true })
}

export function useRemoveProductMainImage() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (productId: string) =>
			(await pb
				.collection('products')
				.update(
					productId,
					productMainImageRemovalPayload(),
				)) as CatalogProductShape,
		onSuccess: () => invalidateCatalog(queryClient),
	})
}

/**
 * PROMOUVOIR UNE IMAGE DE LA GALERIE EN IMAGE PRINCIPALE.
 *
 * « Une image ne se perd pas, et la principale se désigne » — promouvoir B
 * rétrograde A dans la galerie, à son rang (docs/DECISIONS.md, 2026-08-19).
 *
 * ⚠️ **Ce geste ne peut PAS être fait par l'API REST**, et ce n'est pas un
 * choix : PocketBase refuse un nom de fichier venu d'un autre champ —
 * « The field contains unknown filenames. », `forms/record_upsert.go:428-435`,
 * refus mesuré par `backend/routes/product_image_test.go`. Il passe donc par
 * une route Go qui échange les deux colonnes en base ; aucun octet ne bouge,
 * `image` et `gallery` partageant déjà le dossier du produit.
 */
export function usePromoteProductImage() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			productId,
			filename,
		}: { productId: string; filename: string }) =>
			(await pb.send(
				`/api/catalog/products/${encodeURIComponent(productId)}/promote-image`,
				{ method: 'POST', body: { filename } },
			)) as { image: string; gallery: string[] },
		onSuccess: () => invalidateCatalog(queryClient),
	})
}
