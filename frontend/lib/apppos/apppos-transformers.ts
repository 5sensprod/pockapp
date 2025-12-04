// frontend/lib/apppos/apppos-transformers.ts
// Transforme les données AppPOS vers le format attendu par les composants PocketBase

import type {
	BrandsResponse,
	CategoriesResponse,
	ProductsResponse,
	SuppliersResponse,
} from '@/lib/pocketbase-types'
import type {
	AppPosBrand,
	AppPosCategory,
	AppPosProduct,
	AppPosSupplier,
} from './apppos-types'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extrait le barcode depuis meta_data
 */
function extractBarcode(product: AppPosProduct): string {
	if (product.meta_data) {
		const barcodeEntry = product.meta_data.find(
			(m) => m.key === 'barcode' || m.key === 'ean',
		)
		if (barcodeEntry) return barcodeEntry.value
	}
	return ''
}

/**
 * Convertit le status AppPOS en boolean active
 */
function statusToActive(status: string): boolean {
	return status === 'publish'
}

/**
 * Génère une date ISO factice pour les champs created/updated
 * (car AppPOS n'a pas ces champs systématiquement)
 */
function generateIsoDate(): string {
	return new Date().toISOString()
}

// ============================================================================
// PRODUCT TRANSFORMER
// ============================================================================

export function transformAppPosProduct(
	product: AppPosProduct,
): ProductsResponse {
	return {
		// System fields (simulés)
		id: product._id,
		created: generateIsoDate(),
		updated: generateIsoDate(),
		collectionId: 'apppos_products',
		collectionName: 'products' as any,

		// Product fields
		name: product.name || product.designation || '',
		barcode: extractBarcode(product),
		sku: product.sku || '',
		description: product.description || '',

		// Prix
		price_ttc: product.price ?? 0,
		price_ht: product.price
			? product.price / (1 + (product.tax_rate || 20) / 100)
			: 0,
		cost_price: product.purchase_price ?? 0,
		tva_rate: product.tax_rate ?? 20,

		// Stock
		stock_quantity: product.stock ?? 0,
		stock_min: product.min_stock ?? 0,
		stock_max: 0,

		// Relations
		categories: product.categories || [],
		brand: product.brand_id || '',
		supplier: product.supplier_id || '',
		company: '', // Pas de concept d'entreprise dans AppPOS

		// Status
		active: statusToActive(product.status),

		// Autres
		images: product.image?.src || '',
		unit: '',
		weight: 0,
	}
}

export function transformAppPosProducts(
	products: AppPosProduct[],
): ProductsResponse[] {
	return products.map(transformAppPosProduct)
}

// ============================================================================
// CATEGORY TRANSFORMER
// ============================================================================

export function transformAppPosCategory(
	category: AppPosCategory,
): CategoriesResponse {
	return {
		// System fields (simulés)
		id: category._id,
		created: generateIsoDate(),
		updated: generateIsoDate(),
		collectionId: 'apppos_categories',
		collectionName: 'categories' as any,

		// Category fields
		name: category.name,
		parent: category.parent_id || '',
		company: '', // Pas de concept d'entreprise dans AppPOS
		color: '',
		icon: '',
		order: category.level ?? 0,
	}
}

export function transformAppPosCategories(
	categories: AppPosCategory[],
): CategoriesResponse[] {
	return categories.map(transformAppPosCategory)
}

// ============================================================================
// BRAND TRANSFORMER
// ============================================================================

export function transformAppPosBrand(brand: AppPosBrand): BrandsResponse {
	return {
		// System fields (simulés)
		id: brand._id,
		created: generateIsoDate(),
		updated: generateIsoDate(),
		collectionId: 'apppos_brands',
		collectionName: 'brands' as any,

		// Brand fields
		name: brand.name,
		description: brand.description || '',
		company: '', // Pas de concept d'entreprise dans AppPOS
		logo: '',
		website: '',
	}
}

export function transformAppPosBrands(brands: AppPosBrand[]): BrandsResponse[] {
	return brands.map(transformAppPosBrand)
}

// ============================================================================
// SUPPLIER TRANSFORMER
// ============================================================================

export function transformAppPosSupplier(
	supplier: AppPosSupplier,
): SuppliersResponse {
	return {
		// System fields (simulés)
		id: supplier._id,
		created: generateIsoDate(),
		updated: generateIsoDate(),
		collectionId: 'apppos_suppliers',
		collectionName: 'suppliers' as any,

		// Supplier fields
		name: supplier.name,
		company: '', // Pas de concept d'entreprise dans AppPOS
		active: true,
		address: supplier.contact?.address || '',
		contact: supplier.contact?.name || '',
		email: supplier.contact?.email || '',
		phone: supplier.contact?.phone || '',
		notes: '',
		brands: supplier.brands || [],
	}
}

export function transformAppPosSuppliers(
	suppliers: AppPosSupplier[],
): SuppliersResponse[] {
	return suppliers.map(transformAppPosSupplier)
}

// ============================================================================
// EXPORT
// ============================================================================

export const appPosTransformers = {
	product: transformAppPosProduct,
	products: transformAppPosProducts,
	category: transformAppPosCategory,
	categories: transformAppPosCategories,
	brand: transformAppPosBrand,
	brands: transformAppPosBrands,
	supplier: transformAppPosSupplier,
	suppliers: transformAppPosSuppliers,
}

export default appPosTransformers
