// frontend/lib/queries/categories.ts
//
// ⚠️ LE TRI NE PEUT PAS PORTER SUR `order` : LE CHAMP N'EXISTE PLUS.
// La collection `categories` installée porte, mesuré le 13 août 2026 dans
// `_collections` de `pb_data/data.db` :
//   name, slug, description, image, wp_image_url, is_featured, legacy_id,
//   company, parent
// `order` appartenait au schéma v1 (`backend/migrations/catalog.go`), remplacé
// par `catalog_v2.go`. Un tri sur un champ inconnu est rejeté par PocketBase :
// l'appel part en erreur, il ne rend pas une liste désordonnée. Le tri est donc
// `name` seul — et il n'y a rien à remettre à sa place, l'ordre manuel des
// catégories n'existe plus au modèle.
//
// Même remarque pour les types importés ci-dessous : `CategoriesRecord` de
// `pocketbase-types.ts` déclare `color`, `icon` et `order`, qui n'existent pas,
// et **omet `legacy_id`**, qui est la clé de l'export vers le site. Le fichier
// est retouché à la main et `pnpm typegen` reste interdit (CLAUDE.md) : il ne
// protège pas ici, il couvre l'erreur. Détail : §6bis.4 du rituel de migration
// AppStock.

import type {
	CatalogCategoryShape,
	PocketBaseRecord,
} from '@/lib/queries/catalog-shapes'
import { type ImageIntent, buildWritePayload } from '@/lib/queries/image-upload'
import { withLegacyKey } from '@/lib/queries/legacy-key'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

/** Ce qu'on peut écrire. `legacy_id` en est exclu : il vient de NeDB. */
export type CategoryWrite = Partial<
	Omit<CatalogCategoryShape, keyof PocketBaseRecord | 'legacy_id' | 'image'>
> & { name: string; company?: string } & ImageIntent

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

			return await pb
				.collection('categories')
				.getFullList<CatalogCategoryShape>({
					sort: sort || 'name',
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

			return await pb
				.collection('categories')
				.getFullList<CatalogCategoryShape>({
					filter: filters.join(' && '),
					sort: 'name',
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

			return await pb
				.collection('categories')
				.getFullList<CatalogCategoryShape>({
					filter: filters.join(' && '),
					sort: 'name',
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
				.getOne<CatalogCategoryShape>(categoryId, {
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
		mutationFn: async (data: CategoryWrite) => {
			// Clé stable posée par la couche, jamais par l'écran : c'est l'absence de
			// cette clé qui a fait refuser une catégorie à l'export le 13 août 2026,
			// et disparaître en silence le rattachement du produit qui la citait.
			return await pb
				.collection('categories')
				.create<CatalogCategoryShape>(buildWritePayload(withLegacyKey(data)))
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
		mutationFn: async ({ id, data }: { id: string; data: CategoryWrite }) => {
			return await pb
				.collection('categories')
				.update<CatalogCategoryShape>(id, buildWritePayload(data))
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
export interface CategoryNode extends CatalogCategoryShape {
	children: CategoryNode[]
}

export function buildCategoryTree(
	categories: CatalogCategoryShape[],
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
