import type {
	CategoriesRecord,
	CategoriesResponse,
} from '@/lib/pocketbase-types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface CategoriesListOptions {
	companyId?: string
	filter?: string
	sort?: string
	expand?: string
	[key: string]: unknown
}

// 📋 Liste toutes les catégories
export function useCategories(options: CategoriesListOptions = {}) {
	const pb = usePocketBase()
	const { companyId, filter, sort, expand, ...otherOptions } = options

	return useQuery({
		queryKey: ['categories', companyId, filter, sort, expand],
		queryFn: async () => {
			const filters: string[] = []

			// Filtrer par entreprise si un companyId est fourni
			if (companyId) {
				filters.push(`company = "${companyId}"`)
			}

			// Ajouter les autres filtres s'ils existent
			if (filter) {
				filters.push(filter)
			}

			const finalFilter = filters.length > 0 ? filters.join(' && ') : undefined

			return await pb.collection('categories').getFullList<CategoriesResponse>({
				sort: sort || 'order,name',
				expand: expand || 'parent',
				filter: finalFilter,
				...otherOptions,
			})
		},
		enabled: !!companyId,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

// 📂 Catégories racines (sans parent)
export function useRootCategories(companyId?: string) {
	const pb = usePocketBase()
	return useQuery({
		queryKey: ['categories', 'root', companyId],
		queryFn: async () => {
			const filters: string[] = ['parent = ""']

			if (companyId) {
				filters.push(`company = "${companyId}"`)
			}

			return await pb.collection('categories').getFullList<CategoriesResponse>({
				filter: filters.join(' && '),
				sort: 'order,name',
			})
		},
		enabled: !!companyId,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

// 📂 Sous-catégories d'un parent
export function useChildCategories(parentId?: string, companyId?: string) {
	const pb = usePocketBase()
	return useQuery({
		queryKey: ['categories', 'children', parentId, companyId],
		queryFn: async () => {
			if (!parentId) return []

			const filters: string[] = [`parent = "${parentId}"`]

			if (companyId) {
				filters.push(`company = "${companyId}"`)
			}

			return await pb.collection('categories').getFullList<CategoriesResponse>({
				filter: filters.join(' && '),
				sort: 'order,name',
			})
		},
		enabled: !!parentId && !!companyId,
	})
}

// 📦 Détails d'une catégorie
export function useCategory(categoryId?: string) {
	const pb = usePocketBase()
	return useQuery({
		queryKey: ['categories', categoryId],
		queryFn: async () => {
			if (!categoryId) throw new Error('categoryId is required')
			return await pb
				.collection('categories')
				.getOne<CategoriesResponse>(categoryId, {
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
		mutationFn: async ({
			id,
			data,
		}: { id: string; data: Partial<CategoriesRecord> }) => {
			return await pb
				.collection('categories')
				.update<CategoriesResponse>(id, data)
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

export function buildCategoryTree(
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
		if (!node) continue // Skip si le node n'existe pas

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
