// frontend/lib/apppos/apppos-types.ts
// Types pour les réponses de l'API AppPOS (NeDB/Express)

// ============================================================================
// AUTH
// ============================================================================
export interface AppPosLoginResponse {
	success: boolean
	token: string
	user: {
		username: string
		role: string
		createdAt: string
		_id: string
	}
	tokenInfo: {
		persistent: boolean
		message: string
		environment: string
		expiresIn: string
		server_id: string | null
	}
}

// ============================================================================
// PRODUCTS
// ============================================================================
export interface AppPosProductImage {
	src: string
	local_path: string
	status: string
	type: string
	metadata: {
		original_name: string
		size: number
		mimetype: string
	}
	_id: string
	dimensions?: {
		width: number
		height: number
	}
	width?: number
	height?: number
}

export interface AppPosCategoryRef {
	id: string
	name: string
	woo_id: number | null
	path: string[]
	path_ids: string[]
	path_string: string
}

export interface AppPosProduct {
	_id: string
	name: string
	designation?: string
	sku?: string
	description?: string | null
	type: 'simple' | 'variable'
	status: 'draft' | 'publish' | 'pending'

	// Prix
	price: number
	regular_price?: number | null
	sale_price?: number | null
	purchase_price?: number | null
	tax_rate?: number
	margin_rate?: number
	margin_amount?: number
	promo_rate?: number | null
	promo_amount?: number | null

	// Stock
	stock: number
	min_stock?: number | null
	manage_stock: boolean

	// Relations (IDs)
	category_id?: string
	categories: string[]
	brand_id?: string
	supplier_id?: string

	// Relations (refs enrichies)
	brand_ref?: {
		id: string
		name: string
	} | null
	supplier_ref?: {
		id: string
		name: string
	} | null
	category_ref?: AppPosCategoryRef | null
	categories_refs?: AppPosCategoryRef[]
	category_info?: {
		refs: AppPosCategoryRef[]
		primary: AppPosCategoryRef | null
	}

	// Images
	image?: AppPosProductImage | null
	gallery_images?: AppPosProductImage[]

	// Meta
	meta_data?: Array<{
		key: string
		value: string
	}>

	// Stats ventes
	total_sold: number
	sales_count: number
	last_sold_at: string | null
	revenue_total: number
}

// ============================================================================
// CATEGORIES
// ============================================================================
export interface AppPosCategory {
	_id: string
	name: string
	parent_id?: string | null
	level: number
	woo_id?: number | null
	last_sync?: string | null
	image?: string | null
	pending_sync?: boolean
	is_featured?: boolean
	slug?: string
}

// ============================================================================
// BRANDS
// ============================================================================
export interface AppPosBrand {
	_id: string
	name: string
	slug?: string
	description?: string
	suppliers?: string[]
	suppliersRefs?: Array<{
		id: string
		name: string
	}>
	woo_id?: number | null
	last_sync?: string | null
	products_count?: number
	pending_sync?: boolean
}

// ============================================================================
// SUPPLIERS
// ============================================================================
export interface AppPosSupplier {
	_id: string
	name: string
	supplier_code?: string
	brands?: string[]
	brandsRefs?: Array<{
		id: string
		name: string
	}>
	contact?: {
		name?: string
		email?: string
		phone?: string
		address?: string
	}
	banking?: {
		iban?: string
		bic?: string
	}
	payment_terms?: {
		type?: string
		discount?: number
	}
	products_count?: number
}

// ============================================================================
// CREATE PRODUCT INPUT
// ============================================================================
export interface CreateAppPosProductInput {
	// Champs obligatoires
	name: string
	price_ttc: number

	// Champs optionnels
	designation?: string
	sku?: string
	barcode?: string
	description?: string
	tva_rate?: number
	cost_price?: number
	stock_quantity?: number
	stock_min?: number
	category_ids?: string[]
	brand_id?: string
	supplier_id?: string
}

// ============================================================================
// API RESPONSES
// ============================================================================
export interface AppPosApiResponse<T> {
	success: boolean
	data: T
	message?: string
	error?: string
}

export interface AppPosListResponse<T> {
	success: boolean
	data: T[]
	total?: number
	page?: number
	limit?: number
}
