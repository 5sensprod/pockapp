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

export type AppPosProduct = {
	id: string
	name: string
	designation?: string | null
	sku?: string | null
	barcode?: string | null
	price_ttc?: number | null
	price_ht?: number | null
	stock_quantity?: number | null
	images?: string
	tva_rate?: number
}
