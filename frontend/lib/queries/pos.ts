// frontend/lib/queries/pos.ts
// 🎫 Queries React Query pour les routes POS centralisées
// ✅ CORRIGÉ : Ajout de payment_method_label

import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ============================================================================
// TYPES
// ============================================================================

export interface PosItemInput {
	product_id?: string
	name: string
	quantity: number
	unit_price_ttc: number
	tva_rate: number
	line_discount_mode?: 'percent' | 'amount'
	line_discount_value?: number
}

export interface PosTicketInput {
	owner_company: string
	cash_register: string
	session_id: string
	customer_id?: string
	items: PosItemInput[]
	payment_method: 'especes' | 'cb' | 'cheque' | 'virement' | 'autre'
	payment_method_label?: string // 🆕 AJOUTÉ pour les moyens customs
	amount_paid?: number // Pour espèces uniquement
	cart_discount_mode?: 'percent' | 'amount'
	cart_discount_value?: number
}

export interface PosTicketTotals {
	subtotal_ttc: number
	line_discounts_ttc: number
	cart_discount_ttc: number
	total_ht: number
	total_tva: number
	total_ttc: number
	vat_breakdown: Array<{
		rate: number
		base_ht: number
		vat_amount: number
		vat: number
		total_ttc: number
	}>
}

export interface PosTicketResult {
	ticket: any // Record PocketBase
	cash_movement?: any // Record PocketBase (si espèces)
	change: number
	totals: PosTicketTotals
}

export interface PosTicketDetails {
	ticket: any
	credit_notes: any[]
	can_refund: boolean
	remaining_amount: number
}

export interface SessionTicketsResult {
	tickets: any[]
	stats: {
		count: number
		invoices_count: number
		credit_notes_count: number
		net_total_ttc: number
	}
}

// ============================================================================
// HELPER: Convertir un CartItem frontend en PosItemInput backend
// ============================================================================

type DisplayMode = 'name' | 'designation' | 'sku'

interface CartItem {
	id: string
	productId: string
	name: string
	designation?: string
	sku?: string
	unitPrice: number
	quantity: number
	tvaRate: number
	lineDiscountMode?: 'percent' | 'unit'
	lineDiscountValue?: number
	displayMode?: DisplayMode
}

/**
 * Convertit un item du panier frontend vers le format attendu par l'API backend
 */
function round2(n: number) {
	return Math.round(n * 100) / 100
}

export function cartItemToPosItem(item: CartItem): PosItemInput {
	const displayMode = item.displayMode || 'name'
	let displayName = item.name
	if (displayMode === 'designation') {
		displayName = item.designation || item.name
	} else if (displayMode === 'sku') {
		displayName = item.sku || item.name
	}

	const qty = Number(item.quantity) || 1
	const unitPrice = Number(item.unitPrice) || 0

	// UI "unit" = prix TTC saisi (override), pas une remise
	if (item.lineDiscountMode === 'unit' && item.lineDiscountValue != null) {
		const desiredUnitTtc = Number(item.lineDiscountValue) || 0
		const discountTotalTtc = round2(
			Math.max(0, (unitPrice - desiredUnitTtc) * qty),
		)

		return {
			product_id: item.productId,
			name: displayName,
			quantity: qty,
			unit_price_ttc: unitPrice,
			tva_rate: Number(item.tvaRate ?? 0),
			line_discount_mode: discountTotalTtc > 0 ? 'amount' : undefined,
			line_discount_value: discountTotalTtc > 0 ? discountTotalTtc : undefined,
		}
	}

	return {
		product_id: item.productId,
		name: displayName,
		quantity: qty,
		unit_price_ttc: unitPrice,
		tva_rate: Number(item.tvaRate ?? 0),
		line_discount_mode:
			item.lineDiscountMode === 'percent' ? 'percent' : undefined,
		line_discount_value:
			item.lineDiscountMode === 'percent' && item.lineDiscountValue != null
				? Number(item.lineDiscountValue)
				: undefined,
	}
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Hook pour créer un ticket POS via la route backend centralisée
 * Remplace useCreateInvoice + useCreateCashMovement
 */
export function useCreatePosTicket() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (input: PosTicketInput): Promise<PosTicketResult> => {
			// Validation côté client (fail-fast)
			if (!input.owner_company) throw new Error('owner_company requis')
			if (!input.cash_register) throw new Error('cash_register requis')
			if (!input.session_id) throw new Error('session_id requis')
			if (!input.items || input.items.length === 0) {
				throw new Error('Le panier est vide')
			}
			console.log('📦 POS payload:', JSON.stringify(input, null, 2))
			// Appel API backend
			const response = await pb.send('/api/pos/ticket', {
				method: 'POST',
				body: JSON.stringify(input),
				headers: {
					'Content-Type': 'application/json',
				},
			})

			return response as PosTicketResult
		},
		onSuccess: (_data, variables) => {
			// Invalider les caches pertinents
			queryClient.invalidateQueries({ queryKey: ['invoices'] })
			queryClient.invalidateQueries({ queryKey: ['tickets'] })
			queryClient.invalidateQueries({
				queryKey: ['cash_movements', variables.session_id],
			})
			queryClient.invalidateQueries({
				queryKey: ['session_tickets', variables.session_id],
			})
			queryClient.invalidateQueries({
				queryKey: ['x_report', variables.session_id],
			})
			queryClient.invalidateQueries({
				queryKey: ['cash_session', variables.cash_register],
			})
		},
	})
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Hook pour récupérer les détails d'un ticket avec ses avoirs
 */
export function usePosTicket(ticketId: string | undefined) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: ['pos_ticket', ticketId],
		queryFn: async (): Promise<PosTicketDetails> => {
			if (!ticketId) throw new Error('ticketId requis')

			const response = await pb.send(`/api/pos/ticket/${ticketId}`, {
				method: 'GET',
			})

			return response as PosTicketDetails
		},
		enabled: !!ticketId,
	})
}

/**
 * Hook pour récupérer tous les tickets d'une session
 */
export function useSessionTickets(sessionId: string | undefined) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: ['session_tickets', sessionId],
		queryFn: async (): Promise<SessionTicketsResult> => {
			if (!sessionId) throw new Error('sessionId requis')

			const response = await pb.send(`/api/pos/session/${sessionId}/tickets`, {
				method: 'GET',
			})

			return response as SessionTicketsResult
		},
		enabled: !!sessionId,
		refetchInterval: 30000, // Rafraîchir toutes les 30s
	})
}
