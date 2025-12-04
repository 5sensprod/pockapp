// frontend/lib/apppos/apppos-hooks.ts
// Hooks React Query pour fetcher les données depuis l'API AppPOS

import { useQuery } from '@tanstack/react-query'
import { appPosApi } from './apppos-api'
import { appPosTransformers } from './apppos-transformers'

// ============================================================================
// PRODUCTS
// ============================================================================

export interface UseAppPosProductsOptions {
	enabled?: boolean
	filter?: string
	searchTerm?: string
	categoryId?: string
}

export function useAppPosProducts(options: UseAppPosProductsOptions = {}) {
	const { enabled = true, searchTerm, categoryId } = options

	return useQuery({
		queryKey: ['apppos', 'products', searchTerm, categoryId],
		queryFn: async () => {
			const products = await appPosApi.getProducts()

			// Filtrer côté client (car l'API AppPOS ne supporte peut-être pas tous les filtres)
			let filtered = products

			// Filtre par terme de recherche
			if (searchTerm) {
				const term = searchTerm.toLowerCase()
				filtered = filtered.filter(
					(p) =>
						p.name?.toLowerCase().includes(term) ||
						p.sku?.toLowerCase().includes(term) ||
						p.designation?.toLowerCase().includes(term) ||
						p.meta_data?.some(
							(m) =>
								m.key === 'barcode' && m.value.toLowerCase().includes(term),
						),
				)
			}

			// Filtre par catégorie
			if (categoryId) {
				filtered = filtered.filter(
					(p) =>
						p.categories?.includes(categoryId) || p.category_id === categoryId,
				)
			}

			// Transformer vers le format PocketBase
			const transformed = appPosTransformers.products(filtered)

			return {
				items: transformed,
				totalItems: transformed.length,
				totalPages: 1,
				page: 1,
			}
		},
		enabled,
		staleTime: 30000, // 30 secondes
		refetchOnMount: 'always',
	})
}

export function useAppPosProduct(productId?: string) {
	return useQuery({
		queryKey: ['apppos', 'products', productId],
		queryFn: async () => {
			if (!productId) throw new Error('productId is required')
			const product = await appPosApi.getProduct(productId)
			return appPosTransformers.product(product)
		},
		enabled: !!productId,
	})
}

// ============================================================================
// CATEGORIES
// ============================================================================

export interface UseAppPosCategoriesOptions {
	enabled?: boolean
}

export function useAppPosCategories(options: UseAppPosCategoriesOptions = {}) {
	const { enabled = true } = options

	return useQuery({
		queryKey: ['apppos', 'categories'],
		queryFn: async () => {
			const categories = await appPosApi.getCategories()
			return appPosTransformers.categories(categories)
		},
		enabled,
		staleTime: 60000, // 1 minute
		refetchOnMount: 'always',
	})
}

export function useAppPosCategory(categoryId?: string) {
	return useQuery({
		queryKey: ['apppos', 'categories', categoryId],
		queryFn: async () => {
			if (!categoryId) throw new Error('categoryId is required')
			const category = await appPosApi.getCategory(categoryId)
			return appPosTransformers.category(category)
		},
		enabled: !!categoryId,
	})
}

// ============================================================================
// BRANDS
// ============================================================================

export interface UseAppPosBrandsOptions {
	enabled?: boolean
}

export function useAppPosBrands(options: UseAppPosBrandsOptions = {}) {
	const { enabled = true } = options

	return useQuery({
		queryKey: ['apppos', 'brands'],
		queryFn: async () => {
			const brands = await appPosApi.getBrands()
			return appPosTransformers.brands(brands)
		},
		enabled,
		staleTime: 60000, // 1 minute
		refetchOnMount: 'always',
	})
}

// ============================================================================
// SUPPLIERS
// ============================================================================

export interface UseAppPosSuppliersOptions {
	enabled?: boolean
}

export function useAppPosSuppliers(options: UseAppPosSuppliersOptions = {}) {
	const { enabled = true } = options

	return useQuery({
		queryKey: ['apppos', 'suppliers'],
		queryFn: async () => {
			const suppliers = await appPosApi.getSuppliers()
			return appPosTransformers.suppliers(suppliers)
		},
		enabled,
		staleTime: 60000, // 1 minute
		refetchOnMount: 'always',
	})
}

// ============================================================================
// HELPER: Build Category Tree (compatible avec CategoryTree.tsx)
// ============================================================================

import type { CategoriesResponse } from '@/lib/pocketbase-types'

export interface CategoryNode extends CategoriesResponse {
	children: CategoryNode[]
}

export function buildAppPosCategoryTree(
	categories: CategoriesResponse[],
): CategoryNode[] {
	const map = new Map<string, CategoryNode>()
	const roots: CategoryNode[] = []

	// Créer les nodes
	for (const cat of categories) {
		map.set(cat.id, { ...cat, children: [] })
	}

	// Construire l'arbre
	for (const cat of categories) {
		const node = map.get(cat.id)
		if (!node) continue

		if (cat.parent) {
			const parentNode = map.get(cat.parent)
			if (parentNode) {
				parentNode.children.push(node)
			} else {
				roots.push(node)
			}
		} else {
			roots.push(node)
		}
	}

	return roots
}

// ============================================================================
// EXPORT
// ============================================================================

export const appPosHooks = {
	useProducts: useAppPosProducts,
	useProduct: useAppPosProduct,
	useCategories: useAppPosCategories,
	useCategory: useAppPosCategory,
	useBrands: useAppPosBrands,
	useSuppliers: useAppPosSuppliers,
	buildCategoryTree: buildAppPosCategoryTree,
}

export default appPosHooks
