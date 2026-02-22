// frontend/lib/apppos/apppos-api.ts
// Service API pour communiquer avec l'API AppPOS (NeDB/Express)

import { APPPOS_API_BASE_URL } from './apppos-config'
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
const APPPOS_BASE_URL = APPPOS_API_BASE_URL

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

		try {
			const errorData = await response.json()
			errorMessage = errorData.message || errorData.error || errorMessage

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
// 🆕 UPDATE PRODUCT STOCK
// ============================================================================

/**
 * Met à jour le stock d'un produit dans AppPOS
 * @param productId - ID du produit
 * @param newStock - Nouveau stock (valeur absolue)
 */
export async function updateAppPosProductStock(
	productId: string,
	newStock: number,
): Promise<AppPosProduct> {
	// 1. Récupérer le produit complet
	const currentProduct = await getAppPosProduct(productId)

	// 2. Mettre à jour uniquement le stock
	const updatedProduct = {
		...currentProduct,
		stock: newStock,
	}

	// 3. Envoyer avec PUT (remplacement complet)
	const response = await fetchAppPos<AppPosApiResponse<AppPosProduct>>(
		`/products/${productId}`,
		{
			method: 'PUT', // ✅ Généralement autorisé
			body: JSON.stringify(updatedProduct),
		},
	)

	return response.data
}

/**
 * Décrémente le stock de plusieurs produits (après une vente)
 * @param items - Array de { productId, quantitySold }
 * @returns Array des produits mis à jour
 */
export async function decrementAppPosProductsStock(
	items: Array<{ productId: string; quantitySold: number }>,
): Promise<AppPosProduct[]> {
	const results: AppPosProduct[] = []

	for (const item of items) {
		try {
			// ✅ CORRECTION: Utiliser la route /decrement-stock qui émet l'événement WebSocket
			const response = await fetchAppPos<AppPosApiResponse<AppPosProduct>>(
				`/products/${item.productId}/decrement-stock`,
				{
					method: 'POST',
					body: JSON.stringify({ quantity: item.quantitySold }),
				},
			)

			const updatedProduct = response.data
			results.push(updatedProduct)

			console.log(
				`✅ Stock décrémenté pour ${updatedProduct.name}: -${item.quantitySold}`,
			)
		} catch (error) {
			console.error(
				`❌ Erreur mise à jour stock produit ${item.productId}:`,
				error,
			)
			// On continue même si un produit échoue
		}
	}

	return results
}

export type StockReturnDestination = 'restock' | 'sav' | 'stock_b'

export interface StockReturnItem {
	productId: string
	quantityReturned: number
	destination: StockReturnDestination
	reason?: string
}

export async function incrementAppPosProductsStock(
	items: StockReturnItem[],
): Promise<AppPosProduct[]> {
	const results: AppPosProduct[] = []

	for (const item of items) {
		try {
			const response = await fetchAppPos<AppPosApiResponse<AppPosProduct>>(
				`/products/${item.productId}/increment-stock`,
				{
					method: 'POST',
					body: JSON.stringify({
						quantity: item.quantityReturned,
						destination: item.destination,
						reason: item.reason || '',
					}),
				},
			)
			results.push(response.data)
			console.log(
				`✅ [Retour] ${response.data.name}: +${item.quantityReturned} → ${item.destination}`,
			)
		} catch (error) {
			console.error(
				`❌ [Retour stock] Erreur produit ${item.productId}:`,
				error,
			)
		}
	}

	return results
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
	createProduct: createAppPosProduct,
	updateProductStock: updateAppPosProductStock, // 🆕
	decrementProductsStock: decrementAppPosProductsStock, // 🆕
	incrementProductsStock: incrementAppPosProductsStock,
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
