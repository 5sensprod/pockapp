// frontend/lib/catalog/assistant-catalogue.ts
//
// L'ASSISTANT DU CATALOGUE, CÔTÉ ÉCRAN (6 octobre 2026).
// Doc : frontend/modules/stock/PocketStock-docs/06-assistant-catalogue.md.
//
// La route `POST /api/assistant/catalogue` rend des CRITÈRES — les valeurs des
// filtres de `/stock/produits`, dans les mots de `CatalogProductQuery`. Ce
// fichier en fait deux choses, et rien d'autre :
//
//   • la requête que l'écran poserait lui-même (`queryDepuisCriteres`), pour
//     que le nombre annoncé soit compté par `buildCatalogProductsFilter`, le
//     filtre de la liste — il n'y a pas de second filtre ;
//   • la phrase de l'assistant (`phraseAssistant`), écrite ICI à partir des
//     critères validés et du nombre rendu par la liste. Le modèle n'écrit ni
//     l'un ni l'autre : il ne connaît pas le catalogue.
//
// Fonctions pures, sans client PocketBase : elles se testent seules.

import type {
	CatalogCommercialStateFilter,
	CatalogProductQuery,
	CatalogProductStatus,
	CatalogSaleStateFilter,
} from '@/lib/queries/catalog-products'
import {
	type CategoryNode,
	collectBranchIds,
} from '@/lib/queries/category-tree'

/** `criteresCatalogue` de `backend/routes/assistant_catalogue_routes.go`. */
export type CriteresAssistant = {
	search: string
	status: '' | CatalogProductStatus
	brandId: string
	withoutBrand: boolean
	categoryId: string
	withoutCategory: boolean
	commercialState: '' | CatalogCommercialStateFilter
	saleState: '' | CatalogSaleStateFilter
	missingImage: boolean
	missingDescription: boolean
	missingPurchasePrice: boolean
	emptyStock: boolean
	withStockB: boolean
	featured: boolean
	priceMin: number | null
	priceMax: number | null
	/** Vide : l'écran garde son tri. */
	sortId: string
	sortDesc: boolean
}

export type EffetAssistant = {
	/** `filtrer` : l'écran pose les critères. `compter` : il ne bouge pas. */
	action: 'filtrer' | 'compter'
	criteres: CriteresAssistant
	libelles: { marque: string; categorie: string }
	/** Ce qui a été compris, à renvoyer tel quel au tour suivant. Opaque ici :
	 *  c'est le Go qui le revalide. */
	reglages: Record<string, unknown>
}

export type QuestionAssistant = {
	genre: 'marque' | 'categorie'
	demande: string
	candidats: { nom: string; chemin: string; total: number }[]
}

export type ReponseAssistant = {
	texte: string
	effet?: EffetAssistant
	question?: QuestionAssistant
}

export type TourAssistant = { role: 'user' | 'model'; texte: string }

/** Tours gardés pour le fil de la conversation — la borne du serveur. */
export const TOURS_ASSISTANT_MAX = 8

/** Ce que l'historique garde d'un effet. JAMAIS la phrase affichée : elle
 *  porte le nombre de produits, et l'historique part chez Google. */
export const TEXTE_EFFET_HISTORIQUE = {
	filtrer: 'Filtres réglés.',
	compter: 'Décompte affiché.',
} as const

/**
 * La requête de l'écran pour ces critères. La branche de catégorie est celle
 * que l'écran calcule (`ProductsPage`, `categoryBranch`) : un produit est
 * rattaché à ses feuilles, et le repli sur `[categoryId]` évite qu'une liste
 * vide soit lue comme « pas de filtre ».
 */
export function queryDepuisCriteres(
	criteres: CriteresAssistant,
	categories: CategoryNode[],
	companyId: string,
): CatalogProductQuery {
	let categoryIds: string[] | undefined
	if (criteres.categoryId) {
		const branche = collectBranchIds(categories, criteres.categoryId)
		categoryIds = branche.length ? branche : [criteres.categoryId]
	}
	return {
		companyId,
		page: 1,
		perPage: 1,
		search: criteres.search || undefined,
		status: criteres.status || undefined,
		brandId: criteres.brandId || undefined,
		withoutBrand: criteres.withoutBrand,
		categoryIds,
		withoutCategory: criteres.withoutCategory,
		missingImage: criteres.missingImage,
		missingDescription: criteres.missingDescription,
		missingPurchasePrice: criteres.missingPurchasePrice,
		emptyStock: criteres.emptyStock,
		withStockB: criteres.withStockB,
		featured: criteres.featured,
		commercialState: criteres.commercialState || undefined,
		saleState: criteres.saleState || undefined,
		priceMin: criteres.priceMin ?? undefined,
		priceMax: criteres.priceMax ?? undefined,
	}
}

const euros = (valeur: number) =>
	`${valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`

const ETATS = { new: 'neuf', used: 'occasion', rental: 'location' } as const
const TARIFS = {
	regular: 'plein tarif',
	sale: 'soldé',
	promo: 'en promotion',
} as const

/** Les filtres posés, dans les mots de l'écran. */
export function filtresEnMots(effet: EffetAssistant): string[] {
	const { criteres: c, libelles } = effet
	const mots: string[] = []
	if (c.search) mots.push(`« ${c.search} »`)
	if (c.brandId) mots.push(`marque ${libelles.marque}`)
	if (c.withoutBrand) mots.push('sans marque')
	if (c.categoryId) mots.push(`catégorie ${libelles.categorie}`)
	if (c.withoutCategory) mots.push('sans catégorie')
	if (c.commercialState) mots.push(ETATS[c.commercialState])
	if (c.saleState) mots.push(TARIFS[c.saleState])
	if (c.priceMin !== null && c.priceMax !== null) {
		mots.push(`de ${euros(c.priceMin)} à ${euros(c.priceMax)}`)
	} else if (c.priceMin !== null) {
		mots.push(`à partir de ${euros(c.priceMin)}`)
	} else if (c.priceMax !== null) {
		mots.push(`jusqu'à ${euros(c.priceMax)}`)
	}
	if (c.status === 'published') mots.push('publiés')
	if (c.status === 'draft') mots.push('non publiés')
	if (c.missingImage) mots.push('sans image')
	if (c.missingDescription) mots.push('sans description')
	if (c.missingPurchasePrice) mots.push("sans prix d'achat")
	if (c.emptyStock) mots.push('stock à 0')
	if (c.withStockB) mots.push('avec Stock B')
	if (c.featured) mots.push('mis en avant')
	return mots
}

/**
 * La phrase de l'assistant. `total` est le `totalItems` de la liste pour ces
 * critères — le seul nombre qu'elle porte.
 */
export function phraseAssistant(effet: EffetAssistant, total: number): string {
	const mots = filtresEnMots(effet)
	const nombre =
		total === 0
			? 'Aucun produit'
			: `${total.toLocaleString('fr-FR')} produit${total > 1 ? 's' : ''}`
	if (effet.action === 'compter') {
		return mots.length
			? `${nombre} : ${mots.join(', ')}. La liste n'a pas changé.`
			: `${nombre} dans le catalogue. La liste n'a pas changé.`
	}
	return mots.length
		? `${nombre} : ${mots.join(', ')}.`
		: `Filtres retirés : ${nombre.toLocaleLowerCase('fr')}.`
}

/** Les derniers tours, bornés, pour la demande suivante. */
export function historiquePourEnvoi(tours: TourAssistant[]): TourAssistant[] {
	return tours.slice(-TOURS_ASSISTANT_MAX)
}
