// frontend/modules/cash/components/terminal/types/cart.ts
export type LineDiscountMode = 'percent' | 'unit'
export type DisplayMode = 'name' | 'designation' | 'sku'

export interface CartItem {
	id: string
	productId: string
	name: string
	designation?: string
	sku?: string
	image?: string
	unitPrice: number
	originalUnitPrice?: number // prix catalogue (pour reset + affichage barré)
	unitPriceRaw?: string // saisie brute pour l'input
	quantity: number
	tvaRate: number
	lineDiscountMode?: LineDiscountMode
	lineDiscountValue?: number
	lineDiscountRaw?: string
	displayMode?: DisplayMode
}

export interface VatBreakdown {
	rate: number
	base_ht: number
	vat: number
	total_ttc: number
}

/** Le produit tel que la caisse l'affiche et le met au panier.
 *  Structurel, et il ne nomme plus aucune base : il s'appelait
 *  `AppPosProduct` jusqu'au 19 août 2026, et portait `images` — un chemin que
 *  seul AppServe savait servir — et `price_ht`, qui n'existe plus au schéma.
 *  L'URL de l'image arrive RÉSOLUE, par `pb.files.getUrl`. */
export type PosProduct = {
	id: string
	name: string
	designation?: string | null
	sku?: string | null
	barcode?: string | null
	price_ttc?: number | null
	stock?: number | null
	/** Prête à poser dans un `<img src>`, ou `null`. */
	imageUrl?: string | null
	/** Taux de TVA du schéma `catalog_v2`. Le nom `tva_rate` était celui du
	 *  transformateur AppPos. */
	tax_rate?: number | null
}
