// frontend/lib/queries/cash.ts
// ✨ Queries React Query pour le système de caisse - VERSION COMPLÈTE

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
	sessionHistory: (cashRegisterId?: string, filters?: any) =>
		[...cashKeys.sessions(), 'history', cashRegisterId, filters] as const,

	movements: () => [...cashKeys.all, 'movements'] as const,
	movementsBySession: (sessionId?: string) =>
		[...cashKeys.movements(), sessionId ?? 'none'] as const,

	reports: () => [...cashKeys.all, 'reports'] as const,
	sessionReport: (sessionId: string) =>
		[...cashKeys.reports(), 'session', sessionId] as const,
	zReport: (cashRegisterId: string, date: string) =>
		[...cashKeys.reports(), 'z', cashRegisterId, date] as const,
	xReport: (sessionId: string) =>
		[...cashKeys.reports(), 'x', sessionId] as const,
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
		enabled: !!cashRegisterId,
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
		// Rafraîchir automatiquement toutes les 30 secondes
		refetchInterval: 30000,
	})
}

// ============================================================================
// LECTURE : HISTORIQUE DES SESSIONS
// ============================================================================

export function useCashSessionHistory(params?: {
	cashRegisterId?: string
	status?: 'open' | 'closed' | 'canceled'
	dateFrom?: string
	dateTo?: string
}) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.sessionHistory(params?.cashRegisterId, params),
		queryFn: async () => {
			const token = pb.authStore.token
			const searchParams = new URLSearchParams()

			if (params?.cashRegisterId) {
				searchParams.append('cash_register', params.cashRegisterId)
			}
			if (params?.status) {
				searchParams.append('status', params.status)
			}
			if (params?.dateFrom) {
				searchParams.append('date_from', params.dateFrom)
			}
			if (params?.dateTo) {
				searchParams.append('date_to', params.dateTo)
			}

			const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''

			const res = await fetch(`/api/cash/sessions${qs}`, {
				headers: {
					Authorization: token ? `Bearer ${token}` : '',
				},
			})

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.message || 'Erreur lors du chargement des sessions')
			}

			const data = await res.json()
			return data.sessions as CashSession[]
		},
		enabled: !!params?.cashRegisterId,
	})
}

// ============================================================================
// LECTURE : MOUVEMENTS D'UNE SESSION
// ============================================================================

export function useCashMovements(sessionId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.movementsBySession(sessionId),
		queryFn: async () => {
			if (!sessionId) return []

			const list = await pb
				.collection('cash_movements')
				.getFullList<CashMovement>({
					filter: `session = "${sessionId}"`,
					sort: 'created',
				})

			return list
		},
		enabled: !!sessionId,
	})
}

// ============================================================================
// LECTURE : RAPPORTS
// ============================================================================

export function useSessionReport(sessionId: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.sessionReport(sessionId),
		queryFn: async () => {
			const token = pb.authStore.token

			const res = await fetch(`/api/cash/session/${sessionId}/report`, {
				headers: {
					Authorization: token ? `Bearer ${token}` : '',
				},
			})

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.message || 'Erreur lors du chargement du rapport')
			}

			return await res.json()
		},
		enabled: !!sessionId,
	})
}

export function useZReport(cashRegisterId: string, date: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.zReport(cashRegisterId, date),
		queryFn: async () => {
			const token = pb.authStore.token

			const res = await fetch(
				`/api/cash/reports/z?cash_register=${encodeURIComponent(cashRegisterId)}&date=${date}`,
				{
					headers: {
						Authorization: token ? `Bearer ${token}` : '',
					},
				},
			)

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.message || 'Erreur lors du chargement du rapport Z')
			}

			return await res.json()
		},
		enabled: !!cashRegisterId && !!date,
	})
}

export function useXReport(sessionId: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.xReport(sessionId),
		queryFn: async () => {
			const token = pb.authStore.token

			const res = await fetch(`/api/cash/reports/x?session=${sessionId}`, {
				headers: {
					Authorization: token ? `Bearer ${token}` : '',
				},
			})

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.message || 'Erreur lors du chargement du rapport X')
			}

			return await res.json()
		},
		enabled: !!sessionId,
		// Rafraîchir automatiquement toutes les 30 secondes
		refetchInterval: 30000,
	})
}

// ============================================================================
// MUTATIONS : OUVERTURE / FERMETURE SESSION
// ============================================================================

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
			queryClient.invalidateQueries({
				queryKey: cashKeys.sessionHistory(session.cash_register),
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
			queryClient.invalidateQueries({
				queryKey: cashKeys.sessionHistory(params.cashRegisterId),
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
// MUTATIONS : MOUVEMENTS D'ESPÈCES
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

			return (await res.json()) as CashMovement
		},

		onSuccess: (_, params) => {
			// mouvements listés
			queryClient.invalidateQueries({
				queryKey: cashKeys.movementsBySession(params.sessionId),
			})

			// ✅ Rapport X (source pour "espèces attendues")
			queryClient.invalidateQueries({
				queryKey: cashKeys.xReport(params.sessionId),
			})

			// session active (si affichage fond, statut, etc.)
			if (params.cashRegisterId) {
				queryClient.invalidateQueries({
					queryKey: cashKeys.activeSession(params.cashRegisterId),
				})

				// si tu as un écran historique basé sur ce key
				queryClient.invalidateQueries({
					queryKey: cashKeys.sessionHistory(params.cashRegisterId),
				})
			}
		},
	})
}

export function useLastClosedCashSession(cashRegisterId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.sessionHistory(cashRegisterId, {
			status: 'closed',
			perPage: 1,
			page: 1,
			last: true,
		}),
		enabled: typeof cashRegisterId === 'string' && cashRegisterId.length > 0,
		queryFn: async () => {
			if (!cashRegisterId) return null

			const token = pb.authStore.token
			const url = `/api/cash/sessions?cash_register=${encodeURIComponent(cashRegisterId)}&status=closed&perPage=1&page=1`

			const res = await fetch(url, {
				headers: { Authorization: token ? `Bearer ${token}` : '' },
			})

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.message || 'Erreur chargement sessions')
			}

			const data = await res.json()
			const sessions = (data.sessions ?? []) as CashSession[]

			return sessions.length > 0 ? sessions[0] : null
		},
	})
}

// ============================================================================
// HELPER : GET/CREATE CLIENT PAR DÉFAUT
// ============================================================================

/**
 * Récupère ou crée le client "Client de passage" pour les ventes POS
 * Ce client est utilisé quand on ne veut pas associer de client spécifique
 */
export async function getOrCreateDefaultCustomer(
	pb: any,
	ownerCompanyId: string,
): Promise<string> {
	try {
		// Chercher le client par défaut
		const existing = await pb
			.collection('customers')
			.getFirstListItem(
				`name = "Client de passage" && owner_company = "${ownerCompanyId}"`,
			)

		return existing.id
	} catch {
		// Créer le client par défaut
		const created = await pb.collection('customers').create({
			name: 'Client de passage',
			owner_company: ownerCompanyId,
			email: 'pos@default.local',
			notes: 'Client par défaut pour les ventes POS sans client spécifique',
		})

		return created.id
	}
}
