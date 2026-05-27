import { updateAppPosProduct } from '@/lib/apppos'
import type { UpdateAppPosProductInput } from '@/lib/apppos'
import type { ProductWithRefs } from '@/lib/apppos/apppos-transformers'
import { appPosTransformers } from '@/lib/apppos/apppos-transformers'
import type { ProductsRecord, ProductsResponse } from '@/lib/pocketbase-types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface ProductsListOptions {
	filter?: string
	sort?: string
	companyId?: string
	[key: string]: unknown
}

// 📋 Liste tous les produits (filtrés par entreprise)
export function useProducts(options: ProductsListOptions = {}) {
	const pb = usePocketBase()
	const { companyId, filter, sort, ...otherOptions } = options

	return useQuery({
		queryKey: ['products', companyId, filter, sort],
		queryFn: async () => {
			const filters: string[] = []

			if (companyId) {
				filters.push(`company = "${companyId}"`)
			}

			if (filter) {
				filters.push(filter)
			}

			const finalFilter = filters.length > 0 ? filters.join(' && ') : undefined

			const result = await pb
				.collection('products')
				.getList<ProductsResponse>(1, 50, {
					sort: sort || '-created',
					filter: finalFilter,
					expand: 'brand,supplier,categories,company',
					...otherOptions,
				})

			return result
		},
		enabled: !!companyId,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

// 📦 Détails d'un produit
export function useProduct(productId?: string) {
	const pb = usePocketBase()
	return useQuery({
		queryKey: ['products', productId],
		queryFn: async () => {
			if (!productId) throw new Error('productId is required')
			return await pb
				.collection('products')
				.getOne<ProductsResponse>(productId, {
					expand: 'brand,supplier,categories,company',
				})
		},
		enabled: !!productId,
	})
}

// 🔍 Recherche par code-barres (avec filtre entreprise)
export function useProductByBarcode(barcode?: string, companyId?: string) {
	const pb = usePocketBase()
	return useQuery({
		queryKey: ['products', 'barcode', barcode, companyId],
		queryFn: async () => {
			if (!barcode) throw new Error('barcode is required')

			const filters: string[] = [`barcode = "${barcode}"`]
			if (companyId) {
				filters.push(`company = "${companyId}"`)
			}

			return await pb
				.collection('products')
				.getFirstListItem<ProductsResponse>(filters.join(' && '), {
					expand: 'brand,supplier,categories,company',
				})
		},
		enabled: !!barcode,
		retry: false,
	})
}

// ➕ Créer un produit
export function useCreateProduct() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: ProductsRecord) => {
			return await pb.collection('products').create<ProductsResponse>(data)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['products'] })
		},
	})
}

// ✏️ Modifier un produit PocketBase
export function useUpdateProduct() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: { id: string; data: Partial<ProductsRecord> }) => {
			return await pb.collection('products').update<ProductsResponse>(id, data)
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ['products'] })
			queryClient.invalidateQueries({ queryKey: ['products', variables.id] })
		},
	})
}

// 🗑️ Supprimer un produit
export function useDeleteProduct() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (productId: string) => {
			return await pb.collection('products').delete(productId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['products'] })
		},
	})
}

// ✏️ Modifier un produit AppPOS (patch chirurgical du cache catalogue)
export function useUpdateAppPosProduct() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string
			data: UpdateAppPosProductInput
		}) => {
			const raw = await updateAppPosProduct(id, data)
			return appPosTransformers.product(raw)
		},
		onSuccess: (updated, variables) => {
			queryClient.setQueryData<{ items: ProductWithRefs[] }>(
				['apppos', 'products', 'catalog'],
				(old) => {
					if (!old) return old
					return {
						...old,
						items: old.items.map((p) =>
							p.id === variables.id ? { ...p, ...updated } : p,
						),
					}
				},
			)
			queryClient.invalidateQueries({
				queryKey: ['apppos', 'products', variables.id],
			})
		},
	})
}

// ✏️ Modifier un produit — routage automatique AppPOS vs PocketBase
// Détecte la source via collectionId ('apppos_products' = AppPOS, autre = PocketBase)
export function useUpdateProductUniversal() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
			source,
		}: {
			id: string
			data: Partial<ProductsRecord> & UpdateAppPosProductInput
			source?: string
		}) => {
			if (source === 'apppos_products') {
				const raw = await updateAppPosProduct(
					id,
					data as UpdateAppPosProductInput,
				)
				return appPosTransformers.product(raw)
			}
			return await pb
				.collection('products')
				.update<ProductsResponse>(id, data as Partial<ProductsRecord>)
		},
		onSuccess: (_, variables) => {
			if (variables.source === 'apppos_products') {
				queryClient.invalidateQueries({
					queryKey: ['apppos', 'products', 'catalog'],
				})
			} else {
				queryClient.invalidateQueries({ queryKey: ['products'] })
				queryClient.invalidateQueries({ queryKey: ['products', variables.id] })
			}
		},
	})
}
