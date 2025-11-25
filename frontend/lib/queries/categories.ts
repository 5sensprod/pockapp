import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePocketBase } from '@/lib/use-pocketbase'
import type { CategoriesRecord, CategoriesResponse } from '@/lib/pocketbase-types'

export interface CategoriesListOptions {
  filter?: string
  sort?: string
  expand?: string
  [key: string]: unknown
}

// 📋 Liste toutes les catégories
export function useCategories(options: CategoriesListOptions = {}) {
  const pb = usePocketBase()
  return useQuery({
    queryKey: ['categories', options],
    queryFn: async () => {
      return await pb.collection('categories').getFullList<CategoriesResponse>({
        sort: 'order,name',
        expand: 'parent',
        ...options,
      })
    },
  })
}

// 📂 Catégories racines (sans parent)
export function useRootCategories() {
  const pb = usePocketBase()
  return useQuery({
    queryKey: ['categories', 'root'],
    queryFn: async () => {
      return await pb.collection('categories').getFullList<CategoriesResponse>({
        filter: 'parent = ""',
        sort: 'order,name',
      })
    },
  })
}

// 📂 Sous-catégories d'un parent
export function useChildCategories(parentId?: string) {
  const pb = usePocketBase()
  return useQuery({
    queryKey: ['categories', 'children', parentId],
    queryFn: async () => {
      if (!parentId) return []
      return await pb.collection('categories').getFullList<CategoriesResponse>({
        filter: `parent = "${parentId}"`,
        sort: 'order,name',
      })
    },
    enabled: !!parentId,
  })
}

// 📦 Détails d'une catégorie
export function useCategory(categoryId?: string) {
  const pb = usePocketBase()
  return useQuery({
    queryKey: ['categories', categoryId],
    queryFn: async () => {
      if (!categoryId) throw new Error('categoryId is required')
      return await pb.collection('categories').getOne<CategoriesResponse>(categoryId, {
        expand: 'parent',
      })
    },
    enabled: !!categoryId,
  })
}

// ➕ Créer une catégorie
export function useCreateCategory() {
  const pb = usePocketBase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CategoriesRecord) => {
      return await pb.collection('categories').create<CategoriesResponse>(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

// ✏️ Modifier une catégorie
export function useUpdateCategory() {
  const pb = usePocketBase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CategoriesRecord> }) => {
      return await pb.collection('categories').update<CategoriesResponse>(id, data)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories', variables.id] })
    },
  })
}

// 🗑️ Supprimer une catégorie
export function useDeleteCategory() {
  const pb = usePocketBase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (categoryId: string) => {
      return await pb.collection('categories').delete(categoryId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

// 🌳 Helper : construire l'arbre des catégories
export interface CategoryNode extends CategoriesResponse {
  children: CategoryNode[]
}

export function buildCategoryTree(categories: CategoriesResponse[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>()
  const roots: CategoryNode[] = []

  // Créer les nodes
  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] })
  }

  // Construire l'arbre
  for (const cat of categories) {
    const node = map.get(cat.id)!
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