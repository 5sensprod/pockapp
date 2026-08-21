// frontend/modules/site/lib/catalog-export.ts
// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITION DES LOTS D'EXPORT
// ═══════════════════════════════════════════════════════════════════════════
// Traduit les entités PocketBase en la forme du contrat
// (PocketSite-docs/12-contrat-catalogue.md), calcule leur empreinte et
// découpe en lots.
//
// Fonctions pures — aucun réseau, aucun React : c'est le hook
// `use-catalog-sync.ts` qui envoie. Vérifiées par catalog-export.test.ts.
//
// ⚠️ LA CLÉ EST `legacy_id`. Les identifiants PocketBase sont régénérés à
// chaque rechargement par purge ; s'en servir produirait des doublons
// silencieux côté SQL au premier `catalog-import -load`. §1 du contrat.
// ═══════════════════════════════════════════════════════════════════════════

import type {
	CatalogBrand,
	CatalogCategory,
	CatalogProduct,
	CatalogProductStatus,
} from '@/lib/queries/site-catalog'

export const CATALOG_CONTRACT_VERSION = 1

/** §6 du contrat : plafond d'un lot, garde-fou côté serveur, consigne ici. */
export const MAX_ENTITIES_PER_BATCH = 200

/**
 * Plafond de taille d'un lot, en octets de JSON.
 *
 * Le contrat fixe 1 Mio, et le relais Go refuse au-delà
 * (`siteCatalogMaxBytes`). Or **le nombre d'entités ne dit rien de la taille** :
 * 200 produits dont la description fait 5 Kio font déjà 1 Mio. Compter les
 * entités seules laisserait l'export échouer au milieu, sur un lot au hasard,
 * selon la longueur des fiches.
 *
 * 800 Kio laisse de la marge pour l'enveloppe et l'échappement JSON.
 */
export const MAX_BATCH_BYTES = 800 * 1024

// ---------------------------------------------------------------------------
// FORMES DU CONTRAT
// ---------------------------------------------------------------------------

type WithChecksum = { legacy_id: string; checksum: string }

export type ExportProduct = WithChecksum & {
	name: string
	site_title: string | null
	sku: string | null
	slug: string | null
	description: string | null
	price_ttc: number
	tax_rate: number
	stock: number
	/**
	 * L'intention de publication, TELLE QU'ELLE EST. `draft` est la seule façon
	 * de retirer une fiche du site : `catalog.php` ne sert que `published`, et
	 * rien n'efface jamais la ligne SQL (§4.1 du contrat, 21 août 2026).
	 *
	 * Avant cette date le champ valait `'published'` en dur, ici et dans
	 * `products-sync.php` : un produit repassé en brouillon restait en ligne
	 * indéfiniment, sans qu'aucun écran ne puisse même le montrer.
	 *
	 * **Il entre dans l'empreinte**, et c'est ce qui fait tout marcher : passer
	 * une fiche en brouillon la fait basculer en `modified`, l'envoi la
	 * dépublie, et l'empreinte alors stockée la rend `synced` — le compteur
	 * retombe à zéro de lui-même.
	 */
	status: CatalogProductStatus
	brand: string | null
	categories: string[]
}

export type ExportCategory = WithChecksum & {
	name: string
	slug: string | null
	description: string | null
	parent: string | null
	is_featured: boolean
}

export type ExportBrand = WithChecksum & {
	name: string
	slug: string | null
	description: string | null
}

export type ExportBatch = {
	contractVersion: number
	exportedAt: string
	products: ExportProduct[]
	categories: ExportCategory[]
	brands: ExportBrand[]
}

/** État d'une entité au regard de la base SQL — §3 du contrat. */
export type SyncState = 'absent' | 'modified' | 'synced'

/** legacy_id → checksum, tel que renvoyé par l'inventaire. */
export type ChecksumIndex = Record<string, string>

// ---------------------------------------------------------------------------
// EMPREINTE
// ---------------------------------------------------------------------------

/**
 * Sérialisation canonique : clés triées, récursivement. Sans elle, deux objets
 * identiques mais construits dans un ordre différent produiraient deux
 * empreintes différentes, et tout paraîtrait modifié en permanence.
 */
function canonical(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`

	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([key]) => key !== 'checksum')
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)

	return `{${entries.join(',')}}`
}

/**
 * SHA-1 de la forme canonique. **Aucune valeur de sécurité** : il ne répond
 * qu'à « cette entité a-t-elle changé depuis son dernier export ? » (§4.4).
 *
 * `crypto.subtle` n'existe que sur une origine sûre — localhost en fait partie,
 * ce qui couvre Wails comme le proxy Vite.
 */
export async function checksumOf(entity: object): Promise<string> {
	const bytes = new TextEncoder().encode(canonical(entity))
	const digest = await crypto.subtle.digest('SHA-1', bytes)
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

// ---------------------------------------------------------------------------
// TRADUCTION
// ---------------------------------------------------------------------------

const nullable = (value: string | undefined): string | null =>
	value && value.trim() !== '' ? value : null

/**
 * `status` est RECOPIÉ, jamais décidé : tout ce qui n'est pas `published` part
 * en `draft`, c'est-à-dire dépublié. Le serveur n'accepte que ces deux valeurs.
 *
 * `site_title` reste délibérément `null` : le nom/référence canonique doit faire
 * foi partout et `catalog.php` retombe sur `name`. Le champ reste au contrat
 * pour ne pas imposer une migration au serveur si cette règle change un jour.
 */
export function toExportProduct(
	product: CatalogProduct,
	categoryLegacyIds: string[],
	brandLegacyId: string | null,
): Omit<ExportProduct, 'checksum'> {
	return {
		legacy_id: product.legacy_id,
		name: product.name,
		site_title: null,
		sku: nullable(product.sku),
		slug: nullable(product.slug),
		description: nullable(product.description),
		price_ttc: product.price_ttc ?? 0,
		tax_rate: product.tax_rate ?? 0,
		stock: product.stock ?? 0,
		status: product.status === 'published' ? 'published' : 'draft',
		brand: brandLegacyId,
		categories: categoryLegacyIds,
	}
}

export function toExportCategory(
	category: CatalogCategory,
	parentLegacyId: string | null,
): Omit<ExportCategory, 'checksum'> {
	return {
		legacy_id: category.legacy_id,
		name: category.name,
		slug: nullable(category.slug),
		description: nullable(category.description),
		parent: parentLegacyId,
		is_featured: Boolean(category.is_featured),
	}
}

export function toExportBrand(
	brand: CatalogBrand,
): Omit<ExportBrand, 'checksum'> {
	return {
		legacy_id: brand.legacy_id,
		name: brand.name,
		slug: nullable(brand.slug),
		description: nullable(brand.description),
	}
}

/** Ajoute l'empreinte à une entité déjà traduite. */
export async function sealed<T extends { legacy_id: string }>(
	entity: T,
): Promise<T & { checksum: string }> {
	return { ...entity, checksum: await checksumOf(entity) }
}

// ---------------------------------------------------------------------------
// ÉTAT
// ---------------------------------------------------------------------------

/**
 * Compare une empreinte à l'inventaire. Trois états, et trois seulement :
 * l'interface ne sait rien de plus (§3).
 */
export function syncStateOf(
	legacyId: string,
	checksum: string | undefined,
	inventory: ChecksumIndex | undefined,
): SyncState {
	if (!inventory) return 'absent'
	const known = inventory[legacyId]
	if (known === undefined) return 'absent'
	if (checksum === undefined) return 'synced' // empreinte pas encore calculée
	return known === checksum ? 'synced' : 'modified'
}

/**
 * Ce qu'un ENVOI EN LOT doit envoyer, parmi ce qui est affiché.
 *
 * Trois exclusions, et elles ne sont pas de même nature.
 *
 * **Ce qui est `synced` est écarté par économie.** L'envoi reste idempotent —
 * rejouer une fiche à la pièce donne le même état, et c'est permis — mais un
 * lot ne refait pas gratuitement : renvoyer les 36 catégories déjà en ligne,
 * c'est 36,3 Mio poussés sur le mutualisé pour aboutir exactement où l'on est.
 *
 * **Ce qui n'a pas d'empreinte mesurée est écarté par RÈGLE**, et c'est le
 * point délicat. `syncStateOf` rend `synced` quand l'empreinte n'est pas encore
 * calculée et que l'entité est connue de l'inventaire — voir juste au-dessus :
 * l'écran ne prétend pas savoir ce qu'il n'a pas mesuré. Filtrer sur le seul
 * état laisserait donc passer des fiches jamais mesurées sous l'étiquette « à
 * jour », et il faudrait leur inventer une empreinte pour les envoyer. On
 * n'envoie jamais une empreinte qu'on n'a pas calculée : elle est stockée telle
 * quelle côté SQL et sert ensuite de référence.
 *
 * **Ce que la base SQL du site ne connaît pas est écarté parce que c'est
 * IMPOSSIBLE**, et c'est l'exclusion qui manquait. Les images sont un ÉTAT de
 * la ligne, pas une entité à part : le miroir refuse en 409 « Entité inconnue
 * de la base du site » (`images-sync.php`). Or toutes les catégories ne sont
 * pas en ligne — une catégorie ne part **qu'avec le premier produit qui la
 * cite** (règle déjà écrite dans `CatalogueEnLignePage`), et 464 existent en
 * local pour 199 portant au moins un produit, mesuré le 19 août 2026. Proposer
 * leurs images, c'est promettre un envoi que le serveur refusera.
 *
 * `online` vaut `undefined` quand l'inventaire d'ENTITÉS n'a pas été lu : on ne
 * sait alors pas, et on n'exclut pas. Ne pas savoir n'est pas la même chose que
 * savoir que non.
 *
 * Gardien : catalog-export.test.ts.
 */
export function aSynchroniser<
	T extends {
		state: SyncState
		checksum: string | undefined
		online?: boolean
	},
>(rows: readonly T[]): T[] {
	return rows.filter(
		(row) =>
			row.checksum !== undefined &&
			row.state !== 'synced' &&
			row.online !== false,
	)
}

// ---------------------------------------------------------------------------
// DÉCOUPAGE
// ---------------------------------------------------------------------------

/**
 * Découpe en lots de `maxPerBatch` entités **tous types confondus** — c'est
 * ainsi que le serveur compte (§6).
 *
 * Les marques et catégories passent en PREMIER : le contrat dit que l'ordre est
 * indifférent, les relations n'étant pas contraintes côté SQL, mais un lot
 * interrompu laisse alors une base cohérente plutôt que des produits qui
 * citent des catégories absentes.
 */
export function buildExportBatches(
	products: ExportProduct[],
	categories: ExportCategory[],
	brands: ExportBrand[],
	exportedAt: string,
	maxPerBatch: number = MAX_ENTITIES_PER_BATCH,
	maxBytes: number = MAX_BATCH_BYTES,
): ExportBatch[] {
	const batches: ExportBatch[] = []

	let current: ExportBatch = {
		contractVersion: CATALOG_CONTRACT_VERSION,
		exportedAt,
		products: [],
		categories: [],
		brands: [],
	}
	let count = 0
	let bytes = 0

	const flush = () => {
		if (count > 0) batches.push(current)
		current = {
			contractVersion: CATALOG_CONTRACT_VERSION,
			exportedAt,
			products: [],
			categories: [],
			brands: [],
		}
		count = 0
		bytes = 0
	}

	/**
	 * Ajoute une entité, en fermant le lot AVANT si elle le ferait déborder —
	 * jamais après. Fermer après laisserait partir un lot au-dessus du plafond,
	 * c'est-à-dire précisément ce qu'on cherche à éviter.
	 *
	 * Une entité seule plus grosse que le plafond part quand même, seule : la
	 * couper serait pire, et le serveur dira ce qu'il en pense.
	 */
	const push = (entity: object, into: (b: ExportBatch) => void) => {
		const size = JSON.stringify(entity).length
		if (count > 0 && (count >= maxPerBatch || bytes + size > maxBytes)) flush()
		into(current)
		count++
		bytes += size
	}

	// Marques et catégories d'abord : un export interrompu laisse alors une base
	// cohérente plutôt que des produits citant des catégories absentes.
	for (const brand of brands) push(brand, (b) => b.brands.push(brand))
	for (const category of categories)
		push(category, (b) => b.categories.push(category))
	for (const product of products) push(product, (b) => b.products.push(product))

	flush()

	return batches
}
