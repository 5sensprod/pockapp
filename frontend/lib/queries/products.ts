import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePocketBase } from '@/lib/use-pocketbase'
import type { ProductsRecord, ProductsResponse } from '@/lib/pocketbase-types'

export interface ProductsListOptions {
  filter?: string
  sort?: string
  [key: string]: unknown
}

// 📋 Liste tous les produits
export function useProducts(options: ProductsListOptions = {}) {
  const pb = usePocketBase()
  return useQuery({
    queryKey: ['products', options],
    queryFn: async () => {
      return await pb.collection('products').getList<ProductsResponse>(1, 50, {
        sort: '-created',
        ...options,
      })
    },
  })
}

// 📦 Détails d'un produit
export function useProduct(productId?: string) {
  const pb = usePocketBase()
  return useQuery({
    queryKey: ['products', productId],
    queryFn: async () => {
      if (!productId) throw new Error('productId is required')
      return await pb.collection('products').getOne<ProductsResponse>(productId)
    },
    enabled: !!productId,
  })
}

// 🔍 Recherche par code-barres
export function useProductByBarcode(barcode?: string) {
  const pb = usePocketBase()
  return useQuery({
    queryKey: ['products', 'barcode', barcode],
    queryFn: async () => {
      if (!barcode) throw new Error('barcode is required')
      return await pb.collection('products').getFirstListItem<ProductsResponse>(`barcode = "${barcode}"`)
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

// ✏️ Modifier un produit
export function useUpdateProduct() {
  const pb = usePocketBase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProductsRecord> }) => {
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