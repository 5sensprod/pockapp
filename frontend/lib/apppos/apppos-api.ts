// frontend/lib/apppos/apppos-api.ts
// Service API pour communiquer avec l'API AppPOS (NeDB/Express)

import type {
	AppPosApiResponse,
	AppPosBrand,
	AppPosCategory,
	AppPosLoginResponse,
	AppPosProduct,
	AppPosSupplier,
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
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.message || `AppPOS API Error: ${response.status}`)
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
