import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePocketBase } from '@/lib/use-pocketbase'
import type { BrandsRecord, BrandsResponse } from '@/lib/pocketbase-types'

export function useBrands() {
  const pb = usePocketBase()
  return useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      return await pb.collection('brands').getFullList<BrandsResponse>({
        sort: 'name',
      })
    },
  })
}

export function useBrand(brandId?: string) {
  const pb = usePocketBase()
  return useQuery({
    queryKey: ['brands', brandId],
    queryFn: async () => {
      if (!brandId) throw new Error('brandId is required')
      return await pb.collection('brands').getOne<BrandsResponse>(brandId)
    },
    enabled: !!brandId,
  })
}

export function useCreateBrand() {
  const pb = usePocketBase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: BrandsRecord) => {
      return await pb.collection('brands').create<BrandsResponse>(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
    },
  })
}

export function useUpdateBrand() {
  const pb = usePocketBase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BrandsRecord> }) => {
      return await pb.collection('brands').update<BrandsResponse>(id, data)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      queryClient.invalidateQueries({ queryKey: ['brands', variables.id] })
    },
  })
}

export function useDeleteBrand() {
  const pb = usePocketBase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (brandId: string) => {
      return await pb.collection('brands').delete(brandId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
    },
  })
}