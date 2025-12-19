// frontend/lib/apppos/apppos-hooks.ts
// Hooks React Query pour fetcher les données depuis l'API AppPOS
// Optimisations: pas de refetch agressif, catalogue produits caché + filtrage local.

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
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
	page?: number
	limit?: number
}

type ProductsData = {
	items: ReturnType<typeof appPosTransformers.product>[]
	totalItems: number
	totalPages: number
	page: number
}

const norm = (v: unknown) =>
	typeof v === 'string' ? v.trim().toLowerCase() : ''

export function useAppPosProducts(options: UseAppPosProductsOptions = {}) {
	const {
		enabled = true,
		filter,
		searchTerm,
		categoryId,
		page = 1,
		limit = 50,
	} = options

	// IMPORTANT:
	// - queryKey stable => pas de refetch à chaque frappe
	// - on charge le "catalogue" et on filtre en mémoire
	const catalogQuery = useQuery({
		queryKey: ['apppos', 'products', 'catalog'],
		queryFn: async () => {
			const products = await appPosApi.getProducts()
			return appPosTransformers.products(products)
		},
		enabled,
		staleTime: 10 * 60 * 1000, // 10 min
		gcTime: 60 * 60 * 1000, // 1h
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: 1,
	})

	const data: ProductsData = useMemo(() => {
		const all = catalogQuery.data ?? []

		let filtered = all

		if (filter) {
			const f = norm(filter)
			filtered = filtered.filter((p: any) => norm(p.status) === f)
		}

		if (searchTerm) {
			const term = norm(searchTerm)
			filtered = filtered.filter((p: any) => {
				const name = norm(p.name)
				const sku = norm(p.sku)
				const designation = norm(p.designation)

				// meta_data: [{key,value}]
				const barcode = Array.isArray(p.meta_data)
					? norm(p.meta_data.find((m: any) => m?.key === 'barcode')?.value)
					: ''

				return (
					(name ?? '').includes(term) ||
					(sku ?? '').includes(term) ||
					(designation ?? '').includes(term) ||
					(barcode ?? '').includes(term)
				)
			})
		}

		if (categoryId) {
			filtered = filtered.filter((p: any) => {
				const cats = p.categories as string[] | undefined
				return (
					(Array.isArray(cats) && cats.includes(categoryId)) ||
					p.category_id === categoryId
				)
			})
		}

		const totalItems = filtered.length
		const totalPages = Math.max(1, Math.ceil(totalItems / limit))
		const safePage = Math.min(Math.max(1, page), totalPages)
		const start = (safePage - 1) * limit
		const items = filtered.slice(start, start + limit)

		return { items, totalItems, totalPages, page: safePage }
	}, [catalogQuery.data, filter, searchTerm, categoryId, page, limit])

	return { ...catalogQuery, data }
}

export function useAppPosProduct(productId?: string, enabled = true) {
	return useQuery({
		queryKey: ['apppos', 'products', productId],
		queryFn: async () => {
			if (!productId) throw new Error('productId is required')
			const product = await appPosApi.getProduct(productId)
			return appPosTransformers.product(product)
		},
		enabled: enabled && !!productId,
		staleTime: 5 * 60 * 1000,
		gcTime: 30 * 60 * 1000,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: 1,
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
		staleTime: 60 * 60 * 1000, // 1h
		gcTime: 6 * 60 * 60 * 1000, // 6h
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: 1,
	})
}

export function useAppPosCategory(categoryId?: string, enabled = true) {
	return useQuery({
		queryKey: ['apppos', 'categories', categoryId],
		queryFn: async () => {
			if (!categoryId) throw new Error('categoryId is required')
			const category = await appPosApi.getCategory(categoryId)
			return appPosTransformers.category(category)
		},
		enabled: enabled && !!categoryId,
		staleTime: 60 * 60 * 1000,
		gcTime: 6 * 60 * 60 * 1000,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: 1,
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
		staleTime: 60 * 60 * 1000,
		gcTime: 6 * 60 * 60 * 1000,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: 1,
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
		staleTime: 60 * 60 * 1000,
		gcTime: 6 * 60 * 60 * 1000,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: 1,
	})
}

// ============================================================================
// HELPER: Build Category Tree (compatible avec CategoryTreeAppPos.tsx)
// (On garde EXACTEMENT la signature/types attendus par ton composant)
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

	for (const cat of categories) {
		map.set(cat.id, { ...cat, children: [] })
	}

	for (const cat of categories) {
		const node = map.get(cat.id)
		if (!node) continue

		if (cat.parent) {
			const parentNode = map.get(cat.parent)
			if (parentNode) parentNode.children.push(node)
			else roots.push(node)
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
