// frontend/lib/queries/deposits.ts
// Hooks React Query pour la gestion des acomptes et factures de solde.
// À importer dans les composants qui en ont besoin.

import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invoiceKeys } from './invoices'

// ============================================================================
// TYPES
// ============================================================================

export interface CreateDepositInput {
	parentId: string
	percentage?: number // ex: 30 pour 30% — exclusif avec amount
	amount?: number     // montant TTC fixe — exclusif avec percentage
	paymentMethod?: 'virement' | 'cb' | 'especes' | 'cheque' | 'autre'
	paymentMethodLabel?: string // si paymentMethod = 'autre'
}

export interface DepositResult {
	deposit: InvoiceResponse
	parentUpdated: InvoiceResponse
}

export interface BalanceInvoiceResult {
	balanceInvoice: InvoiceResponse
	parentUpdated: InvoiceResponse
}

export interface DepositsForInvoice {
	deposits: InvoiceResponse[]
	balanceInvoice: InvoiceResponse | null
	depositsCount: number
	paidCount: number
	pendingCount: number
	depositsTotal: number
	balanceDue: number
	parentTotalTtc: number
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const depositKeys = {
	all: ['deposits'] as const,
	forInvoice: (invoiceId: string) =>
		[...depositKeys.all, 'for-invoice', invoiceId] as const,
}

// ============================================================================
// useCreateDeposit
// POST /api/invoices/deposit
// ============================================================================

export function useCreateDeposit() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (input: CreateDepositInput): Promise<DepositResult> => {
			// Validations client
			if (!input.parentId) throw new Error('parentId est requis')
			if (!input.percentage && !input.amount) {
				throw new Error('percentage ou amount est requis')
			}
			if (input.percentage && input.amount) {
				throw new Error('percentage et amount sont mutuellement exclusifs')
			}
			if (input.percentage && (input.percentage <= 0 || input.percentage > 100)) {
				throw new Error('percentage invalide (doit être entre 1 et 100)')
			}
			if (input.amount && input.amount <= 0) {
				throw new Error('amount invalide (doit être positif)')
			}

			const payload: Record<string, unknown> = {
				parent_id: input.parentId,
			}
			if (input.percentage) payload.percentage = input.percentage
			if (input.amount) payload.amount = input.amount
			if (input.paymentMethod) payload.payment_method = input.paymentMethod
			if (input.paymentMethodLabel) {
				payload.payment_method_label = input.paymentMethodLabel
			}

			const res = await pb.send('/api/invoices/deposit', {
				method: 'POST',
				body: JSON.stringify(payload),
				headers: { 'Content-Type': 'application/json' },
			})

			return {
				deposit: res.deposit as InvoiceResponse,
				parentUpdated: res.parent_updated as InvoiceResponse,
			}
		},
		onSuccess: (_data, variables) => {
			// Invalider la facture parente et la liste des acomptes
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({
				queryKey: depositKeys.forInvoice(variables.parentId),
			})
		},
	})
}

// ============================================================================
// useCreateBalanceInvoice
// POST /api/invoices/balance
// ============================================================================

export function useCreateBalanceInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (parentId: string): Promise<BalanceInvoiceResult> => {
			if (!parentId) throw new Error('parentId est requis')

			const res = await pb.send('/api/invoices/balance', {
				method: 'POST',
				body: JSON.stringify({ parent_id: parentId }),
				headers: { 'Content-Type': 'application/json' },
			})

			return {
				balanceInvoice: res.balance_invoice as InvoiceResponse,
				parentUpdated: res.parent_updated as InvoiceResponse,
			}
		},
		onSuccess: (_data, parentId) => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({
				queryKey: depositKeys.forInvoice(parentId),
			})
		},
	})
}

// ============================================================================
// useDepositsForInvoice
// GET /api/invoices/:id/deposits
// ============================================================================

export function useDepositsForInvoice(invoiceId: string | undefined) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: depositKeys.forInvoice(invoiceId ?? ''),
		queryFn: async (): Promise<DepositsForInvoice> => {
			if (!invoiceId) throw new Error('invoiceId est requis')

			const res = await pb.send(`/api/invoices/${invoiceId}/deposits`, {
				method: 'GET',
			})

			return {
				deposits: res.deposits as InvoiceResponse[],
				balanceInvoice: (res.balance_invoice as InvoiceResponse) ?? null,
				depositsCount: res.deposits_count as number,
				paidCount: res.paid_count as number,
				pendingCount: res.pending_count as number,
				depositsTotal: res.deposits_total as number,
				balanceDue: res.balance_due as number,
				parentTotalTtc: res.parent_total_ttc as number,
			}
		},
		enabled: !!invoiceId,
	})
}
