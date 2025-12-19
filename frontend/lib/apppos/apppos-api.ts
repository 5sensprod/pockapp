// frontend/lib/apppos/apppos-api.ts
// Service API pour communiquer avec l'API AppPOS (NeDB/Express)

import type {
	AppPosApiResponse,
	AppPosBrand,
	AppPosCategory,
	AppPosLoginResponse,
	AppPosProduct,
	AppPosSupplier,
	CreateAppPosProductInput,
} from './apppos-types'

// ============================================================================
// CONFIGURATION
// ============================================================================
const APPPOS_BASE_URL = 'http://localhost:3000/api'

// Stockage du token (simple, à améliorer avec un state manager)
let authToken: string | null = null

// ============================================================================
// HELPERS
// ============================================================================
async function fetchAppPos<T>(
	endpoint: string,
	options: RequestInit = {},
): Promise<T> {
	const url = `${APPPOS_BASE_URL}${endpoint}`

	const headers: HeadersInit = {
		'Content-Type': 'application/json',
		...(options.headers || {}),
	}

	// Ajouter le token si disponible
	if (authToken) {
		;(headers as Record<string, string>).Authorization = `Bearer ${authToken}`
	}

	const response = await fetch(url, {
		...options,
		headers,
	})

	if (!response.ok) {
		let errorMessage = `AppPOS API Error: ${response.status}`
		let errorDetails = null

		try {
			const errorData = await response.json()
			errorDetails = errorData
			errorMessage = errorData.message || errorData.error || errorMessage

			// Afficher plus de détails si c'est une erreur de validation
			if (errorData.details || errorData.errors) {
				console.error(
					'❌ Détails erreur validation:',
					errorData.details || errorData.errors,
				)
			}

			console.error('❌ Erreur API complète:', errorData)
		} catch (parseError) {
			console.error("❌ Impossible de parser l'erreur:", parseError)
		}

		throw new Error(errorMessage)
	}

	return response.json()
}

// ============================================================================
// AUTH
// ============================================================================
export async function loginToAppPos(
	username: string,
	password: string,
): Promise<AppPosLoginResponse> {
	const response = await fetchAppPos<AppPosLoginResponse>('/auth/login', {
		method: 'POST',
		body: JSON.stringify({ username, password }),
	})

	if (response.success && response.token) {
		authToken = response.token
	}

	return response
}

export function setAppPosToken(token: string) {
	authToken = token
}

export function getAppPosToken(): string | null {
	return authToken
}

export function clearAppPosToken() {
	authToken = null
}

// ============================================================================
// PRODUCTS
// ============================================================================
export async function getAppPosProducts(): Promise<AppPosProduct[]> {
	const response =
		await fetchAppPos<AppPosApiResponse<AppPosProduct[]>>('/products')
	return response.data || []
}

export async function getAppPosProduct(id: string): Promise<AppPosProduct> {
	const response = await fetchAppPos<AppPosApiResponse<AppPosProduct>>(
		`/products/${id}`,
	)
	return response.data
}

export async function searchAppPosProductByBarcode(
	barcode: string,
): Promise<AppPosProduct | null> {
	try {
		const response = await fetchAppPos<AppPosApiResponse<AppPosProduct>>(
			`/products/barcode/${barcode}`,
		)
		return response.data || null
	} catch {
		return null
	}
}

export async function searchAppPosProductBySku(
	sku: string,
): Promise<AppPosProduct | null> {
	try {
		const response = await fetchAppPos<AppPosApiResponse<AppPosProduct>>(
			`/products/sku/${sku}`,
		)
		return response.data || null
	} catch {
		return null
	}
}

// ============================================================================
// 🆕 CREATE PRODUCT
// ============================================================================
export async function createAppPosProduct(
	input: CreateAppPosProductInput,
): Promise<AppPosProduct> {
	// Structure EXACTE attendue par le schéma de validation backend
	const productData: any = {
		// ✅ Champs OBLIGATOIRES
		name: input.name,
		price: input.price_ttc, // Prix de vente TTC (OBLIGATOIRE)

		// ✅ Champs avec valeurs par défaut
		designation: input.designation || input.name,
		sku: input.sku || '',
		description: input.description || '',
		status: 'published', // ⚠️ IMPORTANT: 'published' (pas 'publish')
		manage_stock: true,
		stock: input.stock_quantity || 0,
		min_stock: input.stock_min || 0,

		// ✅ Prix (tous optionnels sauf price)
		regular_price: null, // Prix de vente HT
		sale_price: null, // Prix promo TTC
		purchase_price: input.cost_price || null, // Prix d'achat HT
		tax_rate: input.tva_rate || 20,
		margin_rate: null,
		margin_amount: null,
		promo_rate: null,
		promo_amount: null,

		// ✅ Statistiques de vente (initialisées à 0)
		total_sold: 0,
		sales_count: 0,
		last_sold_at: null,
		revenue_total: 0,

		// ✅ Relations (IDs vides acceptés)
		brand_id: input.brand_id || '',
		supplier_id: input.supplier_id || '',
		categories: input.category_ids || [],
		category_id: input.category_ids?.[0] || '',

		// ✅ Refs (null accepté)
		brand_ref: null,
		supplier_ref: null,

		// ✅ Images (null accepté)
		image: null,
		gallery_images: [],

		// ✅ Autres champs optionnels
		slug: '',
		description_short: '',
		specifications: null,

		// ✅ Meta data pour le barcode
		meta_data: input.barcode ? [{ key: 'barcode', value: input.barcode }] : [],
	}

	console.log('📤 Données produit envoyées:', productData)

	const response = await fetchAppPos<AppPosApiResponse<AppPosProduct>>(
		'/products',
		{
			method: 'POST',
			body: JSON.stringify(productData),
		},
	)

	return response.data
}

// ============================================================================
// CATEGORIES
// ============================================================================
export async function getAppPosCategories(): Promise<AppPosCategory[]> {
	const response =
		await fetchAppPos<AppPosApiResponse<AppPosCategory[]>>('/categories')
	return response.data || []
}

export async function getAppPosCategory(id: string): Promise<AppPosCategory> {
	const response = await fetchAppPos<AppPosApiResponse<AppPosCategory>>(
		`/categories/${id}`,
	)
	return response.data
}

// ============================================================================
// BRANDS
// ============================================================================
export async function getAppPosBrands(): Promise<AppPosBrand[]> {
	const response =
		await fetchAppPos<AppPosApiResponse<AppPosBrand[]>>('/brands')
	return response.data || []
}

export async function getAppPosBrand(id: string): Promise<AppPosBrand> {
	const response = await fetchAppPos<AppPosApiResponse<AppPosBrand>>(
		`/brands/${id}`,
	)
	return response.data
}

// ============================================================================
// SUPPLIERS
// ============================================================================
export async function getAppPosSuppliers(): Promise<AppPosSupplier[]> {
	const response =
		await fetchAppPos<AppPosApiResponse<AppPosSupplier[]>>('/suppliers')
	return response.data || []
}

export async function getAppPosSupplier(id: string): Promise<AppPosSupplier> {
	const response = await fetchAppPos<AppPosApiResponse<AppPosSupplier>>(
		`/suppliers/${id}`,
	)
	return response.data
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================
export const appPosApi = {
	// Auth
	login: loginToAppPos,
	setToken: setAppPosToken,
	getToken: getAppPosToken,
	clearToken: clearAppPosToken,

	// Products
	getProducts: getAppPosProducts,
	getProduct: getAppPosProduct,
	createProduct: createAppPosProduct, // 🆕
	searchByBarcode: searchAppPosProductByBarcode,
	searchBySku: searchAppPosProductBySku,

	// Categories
	getCategories: getAppPosCategories,
	getCategory: getAppPosCategory,

	// Brands
	getBrands: getAppPosBrands,
	getBrand: getAppPosBrand,

	// Suppliers
	getSuppliers: getAppPosSuppliers,
	getSupplier: getAppPosSupplier,
}

export default appPosApi
