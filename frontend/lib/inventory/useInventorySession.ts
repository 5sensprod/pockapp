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
	completeInventorySessionWithStats,
	computeGaps,
	countAndAdjustProduct,
	createInventoryEntries,
	createInventorySession,
	getActiveSessions,
	getInventoryEntries,
	getInventoryEntriesByCategory,
	getInventoryEntriesForHistory,
	getInventorySessionHistory,
	getSessionProgress,
	resetInventoryProduct,
	startInventorySession,
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
	sessionDetail: (sessionId: string) =>
		[...inventoryKeys.all, 'detail', sessionId] as const,
}

// ============================================================================
// HOOK: Sessions actives (plusieurs simultanées possibles)
// ============================================================================
export function useActiveSessions() {
	const pb = usePocketBase()

	return useQuery({
		queryKey: inventoryKeys.activeSession(),
		queryFn: () => getActiveSessions(pb),
		staleTime: 30 * 1000,
		refetchOnWindowFocus: true,
	})
}

// ============================================================================
// HOOK: Progression d'une session (pour l'affichage en card sur l'accueil)
// ============================================================================
export function useSessionProgress(sessionId: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: [...inventoryKeys.all, 'progress', sessionId],
		queryFn: () => getSessionProgress(pb, sessionId),
		staleTime: 10 * 1000,
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
		if (!sessionId) return null

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
					productBarcode: entry.product_barcode,
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
				productBarcode: entry.product_barcode,
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
	}, [entries, sessionId])

	const countProduct = useMutation({
		mutationFn: ({
			entry,
			stockCompte,
		}: {
			entry: import('./inventory-types').InventoryEntry
			stockCompte: number
		}) =>
			countAndAdjustProduct(pb, entry, stockCompte, updateAppPosProductStock),
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

	const completeSession = useMutation({
		mutationFn: () => {
			if (!sessionId) throw new Error('Pas de session active')
			if (!summary) throw new Error('Résumé de session indisponible')

			// Collecter les noms de catégories uniques depuis les entrées
			const categoryNames = [
				...new Set(entries.map((e) => e.category_name).filter(Boolean)),
			].sort()

			return completeInventorySessionWithStats(pb, sessionId, {
				totalProducts: summary.totalProducts,
				countedProducts: summary.countedProducts,
				totalGaps: summary.totalGaps.length,
				categoryNames,
			})
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

		countProduct: (
			entry: import('./inventory-types').InventoryEntry,
			stockCompte: number,
		) => countProduct.mutateAsync({ entry, stockCompte }),
		resetProduct: (entryId: string) => resetProduct.mutateAsync(entryId),
		completeSession: () => completeSession.mutateAsync(),
		cancelSession: () => cancelSession.mutateAsync(),

		isCountingProduct: countProduct.isPending,
		isCompletingSession: completeSession.isPending,
		isCancellingSession: cancelSession.isPending,

		countError: countProduct.error,
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
				// Extraire le code-barres depuis meta_data AppPOS
				const barcode = Array.isArray(p.meta_data)
					? (p.meta_data.find((m: any) => m.key === 'barcode')?.value ?? '')
					: ''
				return {
					product_id: p._id,
					product_name: p.name ?? '',
					product_sku: p.sku ?? '',
					product_barcode: String(barcode),
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
// HOOK: Détail d'une session (pour l'historique) — produits comptés + écarts
// ============================================================================
export function useInventorySessionDetail(sessionId: string | undefined) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: inventoryKeys.sessionDetail(sessionId ?? ''),
		queryFn: async () => {
			if (!sessionId) throw new Error('sessionId est requis')
			const entries = await getInventoryEntriesForHistory(pb, sessionId)

			// Grouper par catégorie
			const byCategory = new Map<
				string,
				{ name: string; entries: typeof entries }
			>()
			for (const e of entries) {
				const existing = byCategory.get(e.category_id)
				if (existing) {
					existing.entries.push(e)
				} else {
					byCategory.set(e.category_id, {
						name: e.category_name,
						entries: [e],
					})
				}
			}

			const categories = Array.from(byCategory.entries())
				.map(([categoryId, { name, entries: catEntries }]) => {
					const gaps = catEntries
						.filter((e) => e.stock_compte !== null)
						.map((e) => ({
							entry: e,
							ecart: (e.stock_compte ?? 0) - e.stock_theorique,
						}))
					const withGap = gaps.filter((g) => g.ecart !== 0)
					return {
						categoryId,
						categoryName: name,
						totalProducts: catEntries.length,
						gapCount: withGap.length,
						entries: catEntries,
					}
				})
				.sort((a, b) => a.categoryName.localeCompare(b.categoryName))

			return {
				totalEntries: entries.length,
				totalGaps: categories.reduce((acc, c) => acc + c.gapCount, 0),
				categories,
			}
		},
		enabled: !!sessionId,
		staleTime: 5 * 60 * 1000, // 5 min — données historiques stables
		refetchOnWindowFocus: false,
	})
}

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
