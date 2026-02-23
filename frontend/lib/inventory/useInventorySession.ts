// frontend/lib/inventory/useInventorySession.ts
// Hook principal qui orchestre la session d'inventaire
// Combine PocketBase (persistance) + AppPOS (snapshot + ajustements)

import {
	getAppPosCategories,
	getAppPosProducts,
	updateAppPosProductStock,
} from '@/lib/apppos/apppos-api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { usePocketBase } from '../use-pocketbase'
import {
	cancelInventorySession,
	completeInventorySession,
	computeGaps,
	countInventoryProduct,
	createInventoryEntries,
	createInventorySession,
	getActiveInventorySession,
	getInventoryEntries,
	getInventoryEntriesByCategory,
	getInventorySessionHistory,
	isCategoryFullyCounted,
	markEntryAsAdjusted,
	resetInventoryProduct,
	startInventorySession,
	validateInventoryCategory,
} from './inventory-pocketbase'
import type {
	CategoryInventorySummary,
	CreateInventorySessionInput,
	InventoryEntry,
	InventorySessionSummary,
} from './inventory-types'

// ============================================================================
// QUERY KEYS
// ============================================================================
export const inventoryKeys = {
	all: ['inventory'] as const,
	activeSession: () => [...inventoryKeys.all, 'active-session'] as const,
	session: (id: string) => [...inventoryKeys.all, 'session', id] as const,
	entries: (sessionId: string) =>
		[...inventoryKeys.all, 'entries', sessionId] as const,
	entriesByCategory: (sessionId: string, categoryId: string) =>
		[...inventoryKeys.all, 'entries', sessionId, categoryId] as const,
}

// ============================================================================
// HOOK: Session active
// ============================================================================
export function useActiveInventorySession() {
	const pb = usePocketBase()

	return useQuery({
		queryKey: inventoryKeys.activeSession(),
		queryFn: () => getActiveInventorySession(pb),
		staleTime: 30 * 1000,
		refetchOnWindowFocus: true,
	})
}

// ============================================================================
// HOOK: Entrees d une session
// ============================================================================
export function useInventoryEntries(sessionId: string | undefined) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: inventoryKeys.entries(sessionId ?? ''),
		queryFn: async () => {
			if (!sessionId) throw new Error('sessionId est requis')
			console.log('[useInventoryEntries] fetch pour sessionId:', sessionId)
			const result = await getInventoryEntries(pb, sessionId)
			console.log('[useInventoryEntries] résultat React Query:', result.length)
			return result
		},
		enabled: !!sessionId,
		staleTime: 0,
		refetchOnMount: true,
		refetchOnWindowFocus: true,
		refetchInterval: 5000,
	})
}

export function useInventoryEntriesByCategory(
	sessionId: string | undefined,
	categoryId: string | undefined,
) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: inventoryKeys.entriesByCategory(
			sessionId ?? '',
			categoryId ?? '',
		),
		queryFn: () => {
			if (!sessionId) throw new Error('sessionId est requis')
			if (!categoryId) throw new Error('categoryId est requis')
			return getInventoryEntriesByCategory(pb, sessionId, categoryId)
		},
		enabled: !!sessionId && !!categoryId,
		staleTime: 5 * 1000,
		refetchOnWindowFocus: false,
	})
}

// ============================================================================
// HOOK PRINCIPAL : useInventorySession
// ============================================================================
export function useInventorySession(sessionId: string | undefined) {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	const { data: entries = [], isLoading: entriesLoading } =
		useInventoryEntries(sessionId)

	const summary = useMemo<InventorySessionSummary | null>(() => {
		if (!sessionId || entriesLoading) return null

		const byCategory = new Map<string, InventoryEntry[]>()
		for (const entry of entries) {
			const existing = byCategory.get(entry.category_id) ?? []
			byCategory.set(entry.category_id, [...existing, entry])
		}

		const categories: CategoryInventorySummary[] = []
		let totalGaps: ReturnType<typeof computeGaps> = []

		for (const [categoryId, catEntries] of byCategory) {
			const counted = catEntries.filter((e) => e.status === 'counted').length
			const pending = catEntries.filter((e) => e.status === 'pending').length
			const gaps = computeGaps(catEntries)
			totalGaps = [...totalGaps, ...gaps]

			let status: CategoryInventorySummary['status'] = 'todo'
			if (counted > 0 && pending > 0) status = 'in_progress'
			else if (counted === catEntries.length && catEntries.length > 0)
				status = 'counted'

			categories.push({
				categoryId,
				categoryName: catEntries[0]?.category_name ?? '',
				status,
				totalProducts: catEntries.length,
				countedProducts: counted,
				pendingProducts: pending,
				gaps: gaps.map(({ entry, ecart }) => ({
					productId: entry.product_id,
					productName: entry.product_name,
					productSku: entry.product_sku,
					categoryId: entry.category_id,
					categoryName: entry.category_name,
					stockTheorique: entry.stock_theorique,
					// stock_compte garanti non-null par computeGaps (filtre status === 'counted')
					stockCompte: entry.stock_compte ?? 0,
					ecart,
					entryId: entry.id,
				})),
				totalGapCount: gaps.length,
				isValidated: false,
			})
		}

		const totalProducts = entries.length
		const countedProducts = entries.filter((e) => e.status === 'counted').length

		return {
			session: null as any,
			totalProducts,
			countedProducts,
			pendingProducts: totalProducts - countedProducts,
			totalCategories: categories.length,
			completedCategories: categories.filter(
				(c) => c.status === 'counted' || c.status === 'validated',
			).length,
			validatedCategories: categories.filter((c) => c.status === 'validated')
				.length,
			progressPercent:
				totalProducts > 0
					? Math.round((countedProducts / totalProducts) * 100)
					: 0,
			totalGaps: totalGaps.map(({ entry, ecart }) => ({
				productId: entry.product_id,
				productName: entry.product_name,
				productSku: entry.product_sku,
				categoryId: entry.category_id,
				categoryName: entry.category_name,
				stockTheorique: entry.stock_theorique,
				stockCompte: entry.stock_compte ?? 0,
				ecart,
				entryId: entry.id,
			})),
			categories,
			canComplete: totalProducts > 0 && countedProducts === totalProducts,
		}
	}, [entries, sessionId, entriesLoading])

	const countProduct = useMutation({
		mutationFn: ({
			entryId,
			stockCompte,
		}: {
			entryId: string
			stockCompte: number
		}) => countInventoryProduct(pb, entryId, stockCompte),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: inventoryKeys.entries(sessionId ?? ''),
			})
		},
	})

	const resetProduct = useMutation({
		mutationFn: (entryId: string) => resetInventoryProduct(pb, entryId),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: inventoryKeys.entries(sessionId ?? ''),
			})
		},
	})

	const validateCategory = useMutation({
		mutationFn: async (categoryId: string) => {
			if (!sessionId) throw new Error('Pas de session active')

			const catEntries = await getInventoryEntriesByCategory(
				pb,
				sessionId,
				categoryId,
			)

			if (!isCategoryFullyCounted(catEntries)) {
				throw new Error(
					'Tous les produits doivent etre comptes avant de valider la categorie',
				)
			}

			const gaps = computeGaps(catEntries)

			const result = {
				categoryId,
				categoryName: catEntries[0]?.category_name ?? '',
				adjustedCount: 0,
				skippedCount: catEntries.length - gaps.length,
				errors: [] as Array<{
					productId: string
					productName: string
					error: string
				}>,
			}

			for (const { entry } of gaps) {
				const newStock = entry.stock_compte ?? 0
				try {
					await updateAppPosProductStock(entry.product_id, newStock)
					await markEntryAsAdjusted(pb, entry.id)
					result.adjustedCount++
				} catch (error) {
					result.errors.push({
						productId: entry.product_id,
						productName: entry.product_name,
						error: error instanceof Error ? error.message : 'Erreur inconnue',
					})
				}
			}

			await validateInventoryCategory(pb, sessionId, categoryId)

			return result
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
		},
	})

	const completeSession = useMutation({
		mutationFn: () => {
			if (!sessionId) throw new Error('Pas de session active')
			return completeInventorySession(pb, sessionId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
		},
	})

	const cancelSession = useMutation({
		mutationFn: () => {
			if (!sessionId) throw new Error('Pas de session active')
			return cancelInventorySession(pb, sessionId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
		},
	})

	return {
		entries,
		summary,
		entriesLoading,

		countProduct: (entryId: string, stockCompte: number) =>
			countProduct.mutateAsync({ entryId, stockCompte }),
		resetProduct: (entryId: string) => resetProduct.mutateAsync(entryId),
		validateCategory: (categoryId: string) =>
			validateCategory.mutateAsync(categoryId),
		completeSession: () => completeSession.mutateAsync(),
		cancelSession: () => cancelSession.mutateAsync(),

		isCountingProduct: countProduct.isPending,
		isValidatingCategory: validateCategory.isPending,
		isCompletingSession: completeSession.isPending,
		isCancellingSession: cancelSession.isPending,

		countError: countProduct.error,
		validateError: validateCategory.error,
		completeError: completeSession.error,
	}
}

// ============================================================================
// HOOK: Creer une session + snapshot AppPOS
// ============================================================================
export function useCreateInventorySession() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()
	const [progress, setProgress] = useState<{
		done: number
		total: number
	} | null>(null)

	const mutation = useMutation({
		mutationFn: async (input: CreateInventorySessionInput) => {
			const [allProducts, allCategories] = await Promise.all([
				getAppPosProducts(),
				getAppPosCategories(),
			])

			const categoryNameById = new Map(
				allCategories.map((c) => [c._id, c.name]),
			)

			let products = allProducts
			if (input.scope === 'selection' && input.scope_category_ids?.length) {
				const scopeIds = new Set(input.scope_category_ids)
				products = products.filter(
					(p) =>
						(p.category_id != null && scopeIds.has(p.category_id)) ||
						(Array.isArray(p.categories) &&
							p.categories.some((cid) => scopeIds.has(cid))),
				)
			}

			if (products.length === 0) {
				throw new Error(
					'Aucun produit trouve pour ce perimetre. Verifiez la selection de categories.',
				)
			}

			const session = await createInventorySession(pb, input)

			const entries = products.map((p) => {
				const categoryId = p.category_id ?? p.categories?.[0] ?? ''
				return {
					product_id: p._id,
					product_name: p.name ?? '',
					product_sku: p.sku ?? '',
					product_image: p.image?.src ?? '',
					category_id: categoryId,
					category_name: categoryNameById.get(categoryId) ?? 'Sans categorie',
					stock_theorique: Number(p.stock) || 0,
				}
			})

			setProgress({ done: 0, total: entries.length })

			await createInventoryEntries(pb, session.id, entries, (done, total) => {
				setProgress({ done, total })
			})

			setProgress(null)

			const started = await startInventorySession(pb, session.id)
			return { session: started, entriesCount: entries.length }
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
		},
		onError: () => {
			setProgress(null)
		},
	})

	return { ...mutation, progress }
}

export { inventoryKeys as inventoryQueryKeys }

// ============================================================================
// HOOK: Historique des sessions
// ============================================================================
export function useInventoryHistory() {
	const pb = usePocketBase()

	return useQuery({
		queryKey: [...inventoryKeys.all, 'history'],
		queryFn: () => getInventorySessionHistory(pb),
		staleTime: 30 * 1000,
		refetchOnWindowFocus: false,
	})
}
