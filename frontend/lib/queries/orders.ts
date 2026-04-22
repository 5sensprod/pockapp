// frontend/lib/queries/orders.ts
// Hooks React Query pour la gestion des bons de commande (BC-YYYY-XXXX).
// Numérotation générée automatiquement par le hook backend OnRecordBeforeCreate.

import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ============================================================================
// TYPES
// ============================================================================

export type OrderStatus =
	| 'draft' // Brouillon
	| 'confirmed' // Confirmé (contrat formé)
	| 'in_progress' // En cours d'exécution
	| 'delivered' // Livré / prestation réalisée
	| 'billed' // Facturé
	| 'cancelled' // Annulé

export interface OrderItem {
	id: string
	description: string
	quantity: number
	unit_price_ht: number // HT
	vat_rate: number // ex: 0.20 pour 20%
	total_ht: number
	total_ttc: number
}

export interface OrderResponse {
	id: string
	number: string // ex: "BC-2025-0042" — généré par le backend
	fiscal_year: number
	status: OrderStatus
	customer: string // ID relation
	owner_company: string // ID relation
	issued_by?: string // ID relation users
	customer_name: string // snapshot contractuel

	items: OrderItem[]
	total_ht: number
	total_tva: number
	total_ttc: number

	payment_conditions?: string
	delivery_conditions?: string
	notes?: string

	// Traçabilité
	source_quote_id?: string
	invoice_id?: string
	cancellation_reason?: string

	// Dates métier
	confirmed_at?: string
	delivered_at?: string
	billed_at?: string
	cancelled_at?: string

	// Dates PocketBase
	created: string
	updated: string

	// Expand (optionnel selon les requêtes)
	expand?: {
		customer?: { id: string; name: string; email?: string; company?: string }
		issued_by?: { id: string; name: string; email: string }
	}
}

// ── DTO de création ──────────────────────────────────────────────────────────
// Pas de `number` → généré par le hook backend
export interface OrderCreateDto {
	status: OrderStatus
	customer: string // ID
	owner_company: string // ID
	issued_by?: string // ID
	customer_name: string // snapshot

	items: OrderItem[]
	total_ht: number
	total_tva: number
	total_ttc: number

	payment_conditions?: string
	delivery_conditions?: string
	notes?: string

	source_quote_id?: string // si créé depuis un devis
}

// ── Options de liste ─────────────────────────────────────────────────────────
export interface OrdersListOptions {
	companyId?: string
	customerId?: string
	status?: OrderStatus
	sort?: string
	page?: number
	perPage?: number
}

// ── DTO de patch statut ──────────────────────────────────────────────────────
export interface PatchOrderStatusDto {
	id: string
	status: OrderStatus
	cancellation_reason?: string // requis si status = 'cancelled'
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const orderKeys = {
	all: ['orders'] as const,
	lists: () => [...orderKeys.all, 'list'] as const,
	list: (options: OrdersListOptions) =>
		[...orderKeys.lists(), options] as const,
	details: () => [...orderKeys.all, 'detail'] as const,
	detail: (id: string) => [...orderKeys.details(), id] as const,
}

// ============================================================================
// HOOKS DE LECTURE
// ============================================================================

/**
 * 📋 Liste des bons de commande avec filtres
 */
export function useOrders(options: OrdersListOptions = {}) {
	const pb = usePocketBase()
	const {
		companyId,
		customerId,
		status,
		sort,
		page = 1,
		perPage = 50,
	} = options

	return useQuery({
		queryKey: orderKeys.list(options),
		queryFn: async () => {
			const filters: string[] = []

			if (companyId) filters.push(`owner_company = "${companyId}"`)
			if (customerId) filters.push(`customer = "${customerId}"`)
			if (status) filters.push(`status = "${status}"`)

			const finalFilter = filters.length ? filters.join(' && ') : undefined

			const result = await pb.collection('orders').getList(page, perPage, {
				sort: sort || '-created',
				filter: finalFilter,
				expand: 'customer,issued_by',
			})

			return result as unknown as {
				items: OrderResponse[]
				totalItems: number
				totalPages: number
				page: number
				perPage: number
			}
		},
		enabled: !!companyId,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

/**
 * 📋 Bons de commande d'un client spécifique (pour l'onglet CustomerOrdersTab)
 */
export function useOrdersByCustomer(customerId: string | undefined) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: orderKeys.list({ customerId }),
		queryFn: async () => {
			if (!customerId) throw new Error('customerId requis')

			const result = await pb.collection('orders').getList(1, 100, {
				filter: `customer = "${customerId}"`,
				sort: '-created',
				expand: 'issued_by',
			})

			return result.items as unknown as OrderResponse[]
		},
		enabled: !!customerId,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

/**
 * 🔍 Détail d'un bon de commande
 */
export function useOrder(orderId: string | undefined) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: orderKeys.detail(orderId ?? ''),
		queryFn: async () => {
			if (!orderId) throw new Error('orderId requis')

			const result = await pb.collection('orders').getOne(orderId, {
				expand: 'customer,issued_by',
			})

			return result as unknown as OrderResponse
		},
		enabled: !!orderId,
	})
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * ➕ Créer un bon de commande
 * Le numéro BC-YYYY-XXXX est généré automatiquement par le hook backend.
 */
export function useCreateOrder() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: OrderCreateDto) => {
			// PocketBase attend les champs JSON (items) sérialisés en string
			const payload = {
				...data,
				items: JSON.stringify(data.items ?? []),
			}
			const result = await pb.collection('orders').create(payload)
			return result as unknown as OrderResponse
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orderKeys.all })
		},
	})
}

/**
 * ✏️ Mettre à jour un bon de commande (uniquement en statut draft)
 */
export function useUpdateOrder() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string
			data: Partial<OrderCreateDto>
		}) => {
			const payload = {
				...data,
				...(data.items !== undefined && { items: JSON.stringify(data.items) }),
			}
			const result = await pb.collection('orders').update(id, payload)
			return result as unknown as OrderResponse
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: orderKeys.all })
			queryClient.invalidateQueries({
				queryKey: orderKeys.detail(variables.id),
			})
		},
	})
}

/**
 * 🔄 Transition de statut d'un bon de commande
 *
 * Transitions autorisées (machine à états) :
 *   draft       → confirmed | cancelled
 *   confirmed   → in_progress | cancelled
 *   in_progress → delivered | cancelled
 *   delivered   → billed
 *   billed      → (terminal)
 *   cancelled   → (terminal)
 *
 * Le champ `cancellation_reason` est requis si status = 'cancelled'.
 * Les dates métier (confirmed_at, delivered_at, etc.) sont mises à jour automatiquement.
 */
export function usePatchOrderStatus() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			status,
			cancellation_reason,
		}: PatchOrderStatusDto) => {
			if (!id) throw new Error('id requis')
			if (!status) throw new Error('status requis')
			if (status === 'cancelled' && !cancellation_reason) {
				throw new Error(
					'cancellation_reason requis pour annuler un bon de commande',
				)
			}

			// Calcul de la date métier associée à la transition
			const now = new Date().toISOString()
			const dateFields: Partial<Record<string, string>> = {
				confirmed: 'confirmed_at',
				delivered: 'delivered_at',
				billed: 'billed_at',
				cancelled: 'cancelled_at',
			}
			const dateField = dateFields[status]

			const patch: Record<string, unknown> = { status }
			if (dateField) patch[dateField] = now
			if (cancellation_reason) patch.cancellation_reason = cancellation_reason

			const result = await pb.collection('orders').update(id, patch)
			return result as unknown as OrderResponse
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: orderKeys.all })
			queryClient.invalidateQueries({
				queryKey: orderKeys.detail(variables.id),
			})
		},
	})
}

/**
 * 🗑️ Supprimer un bon de commande (uniquement en statut draft)
 */
export function useDeleteDraftOrder() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (orderId: string) => {
			// Vérification côté client avant d'appeler l'API
			const existing = await pb.collection('orders').getOne(orderId)
			if (existing.status !== 'draft') {
				throw new Error('Seuls les brouillons peuvent être supprimés.')
			}
			await pb.collection('orders').delete(orderId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orderKeys.all })
		},
	})
}
