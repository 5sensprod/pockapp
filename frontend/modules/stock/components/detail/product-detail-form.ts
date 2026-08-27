import { z } from 'zod'

import type {
	CatalogProductShape,
	CatalogProductWrite,
} from '@/lib/queries/catalog-products'

// Un champ numérique HTML rend une chaîne. La coercition garde exactement la
// règle de la modale : PocketBase reçoit toujours un nombre positif.
const money = z.coerce.number().min(0, 'Valeur négative impossible')

export const productDetailSchema = z.object({
	name: z.string().min(1, 'Le nom est requis').max(255),
	designation: z.string().max(255).optional(),
	sku: z.string().max(50).optional(),
	barcode: z.string().max(50).optional(),
	description: z.string().max(20000).optional(),
	type: z.enum(['simple', 'service']),
	status: z.enum(['draft', 'published']),
	commercial_state: z.enum(['', 'used', 'rental']),
	// Axe SÉPARÉ de `commercial_state` : vide = « normal ». Un produit peut
	// être `used` ET `sale` — voir `CatalogSaleState`.
	sale_state: z.enum(['', 'sale', 'promo']),
	price_ttc: money,
	purchase_price_ht: money,
	tax_rate: z.coerce.number().min(0).max(100),
	stock: z.coerce.number().int('Le stock est un entier'),
	min_stock: z.coerce.number().int().min(0),
	manage_stock: z.boolean(),
	brand: z.string().optional(),
	supplier: z.string().optional(),
	categories: z.array(z.string()),
})

export type ProductDetailValues = z.infer<typeof productDetailSchema>

export const EMPTY_PRODUCT_DETAIL_VALUES: ProductDetailValues = {
	name: '',
	designation: '',
	sku: '',
	barcode: '',
	description: '',
	type: 'simple',
	status: 'draft',
	commercial_state: '',
	sale_state: '',
	price_ttc: 0,
	purchase_price_ht: 0,
	tax_rate: 20,
	stock: 0,
	min_stock: 0,
	manage_stock: true,
	brand: '',
	supplier: '',
	categories: [],
}

/**
 * ── LE NOM DE LA FICHE EN LIGNE, QUAND IL N'EN EST PAS UN ──────────────────
 *
 * `name` titre la page publique et donne le slug ; `designation` est le nom du
 * TICKET. Deux cas produisent une page sans titre lisible, et le second ne se
 * voit pas :
 *
 *  1. `name` vide.
 *  2. `name` qui n'est QUE le `sku` — mesuré au comptoir le 27 août 2026 :
 *     `name` = « ABGS14SH » pour un `sku` « ABG S14SH », désignation
 *     « Cordons - Cordon confort crochet à pompe ». La chaîne n'est pas égale
 *     au `sku` caractère pour caractère : elle en est la forme sans espace.
 *
 * D'où la comparaison sur une forme RÉDUITE — sans espace, sans tiret, sans
 * point, casse ignorée. Une référence ne fait pas un titre de page.
 *
 * ⚠️ Ce repli est un repli d'AFFICHAGE, à l'ouverture du formulaire. Il ne
 * réécrit rien tout seul : c'est l'enregistrement qui fixe la valeur. Et comme
 * le slug se dérive de `name` à la SEULE création, réparer le nom d'une fiche
 * déjà publiée ne déplace pas sa page (un slug non vide ne se retouche jamais).
 */
function reduire(valeur: string): string {
	return valeur.toLowerCase().replace(/[\s\-._/]/g, '')
}

export function nomFicheParDefaut(product: {
	name?: string
	designation?: string
	sku?: string
}): string {
	const name = (product.name ?? '').trim()
	const designation = (product.designation ?? '').trim()
	const sku = (product.sku ?? '').trim()

	if (!designation) return name
	if (!name) return designation
	// `reduire('')` vaut `''` : sans le garde sur `sku`, un produit sans
	// référence verrait TOUT nom jugé « identique au sku ».
	if (sku && reduire(name) === reduire(sku)) return designation
	return name
}

export function productDetailValues(
	product: CatalogProductShape,
): ProductDetailValues {
	return {
		...EMPTY_PRODUCT_DETAIL_VALUES,
		// Vide, ou réduit au `sku` : voir `nomFicheParDefaut`.
		name: nomFicheParDefaut(product),
		designation: product.designation ?? '',
		sku: product.sku ?? '',
		barcode: product.barcode ?? '',
		description: product.description ?? '',
		type: product.type ?? 'simple',
		status: product.status ?? 'draft',
		commercial_state: product.commercial_state ?? '',
		sale_state: product.sale_state ?? '',
		price_ttc: product.price_ttc ?? 0,
		purchase_price_ht: product.purchase_price_ht ?? 0,
		tax_rate: product.tax_rate ?? 20,
		stock: product.stock ?? 0,
		min_stock: product.min_stock ?? 0,
		manage_stock: product.manage_stock ?? true,
		brand: product.brand ?? '',
		supplier: product.supplier ?? '',
		categories: product.categories ?? [],
	}
}

/** Le stock est volontairement absent : il part par `/api/stock/adjust`, dans
 * une transaction serveur, et jamais dans le patch de la fiche. */
export function productDetailPayload(
	data: ProductDetailValues,
): Partial<CatalogProductWrite> {
	return {
		name: data.name.trim(),
		designation: data.designation ?? '',
		sku: data.sku ?? '',
		barcode: data.barcode ?? '',
		description: data.description ?? '',
		type: data.type,
		status: data.status,
		commercial_state: data.commercial_state,
		sale_state: data.sale_state,
		price_ttc: data.price_ttc,
		purchase_price_ht: data.purchase_price_ht,
		tax_rate: data.tax_rate,
		min_stock: data.min_stock,
		manage_stock: data.manage_stock,
		brand: data.brand ?? '',
		supplier: data.supplier ?? '',
		categories: data.categories,
	}
}
