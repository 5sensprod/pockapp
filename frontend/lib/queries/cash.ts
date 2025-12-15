// frontend/lib/queries/cash.ts

import type {
	CashMovement,
	CashMovementType,
	CashRegister,
	CashSession,
} from '@/lib/types/cash.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ============================================================================
// QUERY KEYS
// ============================================================================

export const cashKeys = {
	all: ['cash'] as const,
	registers: () => [...cashKeys.all, 'registers'] as const,
	registersByCompany: (companyId?: string) =>
		[...cashKeys.registers(), companyId ?? 'all'] as const,

	sessions: () => [...cashKeys.all, 'sessions'] as const,
	activeSession: (cashRegisterId?: string) =>
		[...cashKeys.sessions(), 'active', cashRegisterId ?? 'default'] as const,

	movements: () => [...cashKeys.all, 'movements'] as const,
	movementsBySession: (sessionId?: string) =>
		[...cashKeys.movements(), sessionId ?? 'none'] as const,
}

// ============================================================================
// LECTURE : CAISSES (cash_registers)
// ============================================================================

export function useCashRegisters(ownerCompanyId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.registersByCompany(ownerCompanyId),
		queryFn: async () => {
			const filters: string[] = []
			if (ownerCompanyId) {
				filters.push(`owner_company = "${ownerCompanyId}"`)
			}
			filters.push('is_active = true')

			const finalFilter = filters.join(' && ')

			const list = await pb
				.collection('cash_registers')
				.getFullList<CashRegister>({
					filter: finalFilter,
					sort: 'code',
				})

			return list
		},
		enabled: !!ownerCompanyId,
	})
}

// ============================================================================
// LECTURE : SESSION ACTIVE
// ============================================================================

export function useActiveCashSession(cashRegisterId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.activeSession(cashRegisterId),
		enabled: !!cashRegisterId, // 👈 évite d'appeler l'API sans caisse
		queryFn: async () => {
			const token = pb.authStore.token
			const qs = cashRegisterId
				? `?cash_register=${encodeURIComponent(cashRegisterId)}`
				: ''

			const res = await fetch(`/api/cash/session/active${qs}`, {
				headers: {
					Authorization: token ? `Bearer ${token}` : '',
				},
			})

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(
					err.message || 'Erreur lors du chargement de la session de caisse',
				)
			}

			const data = await res.json()
			return (data.session || null) as CashSession | null
		},
	})
}

// ============================================================================
// MUTATIONS : OUVERTURE / FERMETURE SESSION
// ============================================================================

// 2) OU si tu veux vraiment envoyer openedBy : ajoute-le au type + au body dans useOpenCashSession

// frontend/lib/queries/cash.ts
export function useOpenCashSession() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (params: {
			ownerCompanyId: string
			cashRegisterId: string
			openingFloat?: number
			openedBy?: string
		}) => {
			const token = pb.authStore.token

			const res = await fetch('/api/cash/session/open', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: token ? `Bearer ${token}` : '',
				},
				body: JSON.stringify({
					owner_company: params.ownerCompanyId,
					cash_register: params.cashRegisterId,
					opening_float: params.openingFloat ?? 0,
					opened_by: params.openedBy ?? null,
				}),
			})

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(
					err.message || "Erreur lors de l'ouverture de la session de caisse",
				)
			}

			const session = (await res.json()) as CashSession
			return session
		},
		onSuccess: (session) => {
			queryClient.invalidateQueries({
				queryKey: cashKeys.activeSession(session.cash_register),
			})
		},
	})
}

export function useCloseCashSession() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (params: {
			sessionId: string
			cashRegisterId?: string
			countedCashTotal?: number
		}) => {
			const token = pb.authStore.token

			const res = await fetch(
				`/api/cash/session/${encodeURIComponent(params.sessionId)}/close`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: token ? `Bearer ${token}` : '',
					},
					body: JSON.stringify({
						counted_cash_total: params.countedCashTotal ?? 0,
					}),
				},
			)

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(
					err.message || 'Erreur lors de la clôture de la session de caisse',
				)
			}

			const session = (await res.json()) as CashSession
			return session
		},
		onSuccess: (_, params) => {
			queryClient.invalidateQueries({
				queryKey: cashKeys.activeSession(params.cashRegisterId),
			})
		},
	})
}

// ============================================================================
// MUTATION : CRÉATION CAISSE
// ============================================================================

export function useCreateCashRegister() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (params: {
			name: string
			code?: string
			ownerCompanyId: string
		}) => {
			const res = await pb.collection('cash_registers').create({
				name: params.name,
				code: params.code,
				owner_company: params.ownerCompanyId,
				is_active: true,
			})

			return res as CashRegister
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: cashKeys.registers() })
		},
	})
}

// ============================================================================
// MUTATIONS : MOUVEMENTS D'ESPECES
// ============================================================================

export function useCreateCashMovement() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (params: {
			sessionId: string
			movementType: CashMovementType
			amount: number
			reason?: string
			meta?: Record<string, any>
			cashRegisterId?: string
		}) => {
			const token = pb.authStore.token

			const res = await fetch('/api/cash/movements', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: token ? `Bearer ${token}` : '',
				},
				body: JSON.stringify({
					session: params.sessionId,
					movement_type: params.movementType,
					amount: params.amount,
					reason: params.reason,
					meta: params.meta,
				}),
			})

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(
					err.message || 'Erreur lors de la création du mouvement de caisse',
				)
			}

			const movement = (await res.json()) as CashMovement
			return movement
		},
		onSuccess: (_, params) => {
			if (params.cashRegisterId) {
				queryClient.invalidateQueries({
					queryKey: cashKeys.activeSession(params.cashRegisterId),
				})
			}
			// Si plus tard tu listes les mouvements :
			// queryClient.invalidateQueries({ queryKey: cashKeys.movementsBySession(params.sessionId) })
		},
	})
}
