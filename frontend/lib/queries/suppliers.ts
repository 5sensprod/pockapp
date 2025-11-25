import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePocketBase } from '@/lib/use-pocketbase'
import type { SuppliersRecord, SuppliersResponse } from '@/lib/pocketbase-types'

export function useSuppliers() {
  const pb = usePocketBase()
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      return await pb.collection('suppliers').getFullList<SuppliersResponse>({
        sort: 'name',
        expand: 'brands',
      })
    },
  })
}

export function useSupplier(supplierId?: string) {
  const pb = usePocketBase()
  return useQuery({
    queryKey: ['suppliers', supplierId],
    queryFn: async () => {
      if (!supplierId) throw new Error('supplierId is required')
      return await pb.collection('suppliers').getOne<SuppliersResponse>(supplierId, {
        expand: 'brands',
      })
    },
    enabled: !!supplierId,
  })
}

export function useCreateSupplier() {
  const pb = usePocketBase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: SuppliersRecord) => {
      return await pb.collection('suppliers').create<SuppliersResponse>(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}

export function useUpdateSupplier() {
  const pb = usePocketBase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SuppliersRecord> }) => {
      return await pb.collection('suppliers').update<SuppliersResponse>(id, data)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['suppliers', variables.id] })
    },
  })
}

export function useDeleteSupplier() {
  const pb = usePocketBase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (supplierId: string) => {
      return await pb.collection('suppliers').delete(supplierId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}