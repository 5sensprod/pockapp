// frontend/lib/queries/cash.ts
// ✨ VERSION AMÉLIORÉE avec nouvelles queries pour rapports Z

import type {
	CashMovement,
	CashMovementType,
	CashRegister,
	CashSession,
	RapportZ,
	ZReportCheckResponse,
	ZReportListItem,
} from '@/lib/types/cash.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import {
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query'

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
	xReport: (sessionId: string) =>
		[...cashKeys.reports(), 'x', sessionId] as const,

	// 🆕 Rapports Z
	zReports: () => [...cashKeys.reports(), 'z'] as const,
	zReportGenerate: (cashRegisterId: string, date: string) =>
		[...cashKeys.zReports(), 'generate', cashRegisterId, date] as const,
	zReportCheck: (cashRegisterId: string, date: string) =>
		[...cashKeys.zReports(), 'check', cashRegisterId, date] as const,
	zReportList: (cashRegisterId: string) =>
		[...cashKeys.zReports(), 'list', cashRegisterId] as const,
	zReportById: (id: string) => [...cashKeys.zReports(), 'detail', id] as const,
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
		refetchInterval: 30000,
	})
}

// ============================================================================
// 🆕 LECTURE : AU MOINS UNE SESSION OUVERTE POUR L'ENTREPRISE
// ============================================================================
// Utile quand on doit juste savoir "y a-t-il une caisse ouverte ?" sans se
// soucier de laquelle précisément (ex: bloquer l'enregistrement d'un
// paiement de facture si aucune session n'est active).

export function useHasAnyOpenCashSession(ownerCompanyId?: string | null) {
	const pb = usePocketBase()
	const { data: registers = [], isLoading: isLoadingRegisters } =
		useCashRegisters(ownerCompanyId ?? undefined)

	const sessionQueries = useQueries({
		queries: registers.map((register) => ({
			queryKey: cashKeys.activeSession(register.id),
			enabled: !!register.id,
			queryFn: async () => {
				const token = pb.authStore.token
				const res = await fetch(
					`/api/cash/session/active?cash_register=${encodeURIComponent(register.id)}`,
					{ headers: { Authorization: token ? `Bearer ${token}` : '' } },
				)
				if (!res.ok) return null
				const data = await res.json()
				return (data.session || null) as CashSession | null
			},
			refetchInterval: 30000,
		})),
	})

	const isLoading =
		isLoadingRegisters || sessionQueries.some((q) => q.isLoading)

	const openSessions = sessionQueries
		.map((q) => q.data)
		.filter((s): s is CashSession => !!s && s.status === 'open')

	return {
		isLoading,
		hasOpenSession: openSessions.length > 0,
		openSessions,
	}
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
		refetchInterval: 30000,
	})
}

// ============================================================================
// 🆕 RAPPORT Z - VÉRIFICATION
// ============================================================================

export function useZReportCheck(
	cashRegisterId: string,
	date: string,
	options?: { enabled?: boolean },
) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.zReportCheck(cashRegisterId, date),
		queryFn: async () => {
			const token = pb.authStore.token

			const res = await fetch(
				`/api/cash/reports/z/check?cash_register=${encodeURIComponent(cashRegisterId)}&date=${date}`,
				{
					headers: {
						Authorization: token ? `Bearer ${token}` : '',
					},
				},
			)

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.message || 'Erreur vérification rapport Z')
			}

			return (await res.json()) as ZReportCheckResponse
		},
		enabled: options?.enabled ?? (!!cashRegisterId && !!date),
		staleTime: 1000 * 30, // 30 secondes
	})
}

// ============================================================================
// 🆕 RAPPORT Z - GÉNÉRATION
// ============================================================================

export function useZReport(
	cashRegisterId: string,
	date: string,
	options?: { enabled?: boolean },
) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.zReportGenerate(cashRegisterId, date),
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

			return (await res.json()) as RapportZ
		},
		enabled: options?.enabled ?? (!!cashRegisterId && !!date),
		staleTime: 1000 * 60 * 5, // 5 minutes
		retry: 1,
	})
}

// ============================================================================
// 🆕 RAPPORT Z - LISTE
// ============================================================================

// LIMITE PAR DÉFAUT : 500, ET C'EST DÉLIBÉRÉ.
//
// Elle valait 50. La base de production porte 66 rapports Z au 1er septembre
// 2026 : seize n'étaient PAS affichés, sans message ni pagination — l'écran
// disait simplement « historique des rapports Z » et en montrait une partie.
// Un historique fiscal tronqué en silence est pire qu'une requête un peu plus
// grosse ; à un Z par jour, 500 couvre seize mois.
const Z_PAR_DEFAUT = 500

export function useZReportList(
	cashRegisterId: string,
	options?: { limit?: number; enabled?: boolean },
) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.zReportList(cashRegisterId),
		queryFn: async () => {
			const token = pb.authStore.token
			const limit = options?.limit ?? Z_PAR_DEFAUT

			const res = await fetch(
				`/api/cash/reports/z/list?cash_register=${encodeURIComponent(cashRegisterId)}&limit=${limit}`,
				{
					headers: {
						Authorization: token ? `Bearer ${token}` : '',
					},
				},
			)

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.message || 'Erreur chargement liste rapports Z')
			}

			const data = await res.json()
			return data.reports as ZReportListItem[]
		},
		enabled: options?.enabled ?? !!cashRegisterId,
		// ⚠️ TOUJOURS REFAIT AU MONTAGE, ET SANS FRAÎCHEUR.
		//
		// Un Z est émis par la clôture, depuis un AUTRE écran (le terminal) et
		// parfois depuis un autre poste. Une liste servie depuis le cache y
		// arrive donc systématiquement en retard, et c'est ce qui obligeait à
		// recharger la page pour voir les derniers Z — signalé les 31 août et
		// 1er septembre 2026. La liste est courte et le coût d'une requête est
		// sans commune mesure avec un historique fiscal incomplet à l'écran.
		staleTime: 0,
		refetchOnMount: 'always',
	})
}

// ============================================================================
// 🆕 RAPPORT Z - PAR ID
// ============================================================================

export function useZReportById(id: string, options?: { enabled?: boolean }) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: cashKeys.zReportById(id),
		queryFn: async () => {
			const token = pb.authStore.token

			const res = await fetch(`/api/cash/reports/z/${id}`, {
				headers: {
					Authorization: token ? `Bearer ${token}` : '',
				},
			})

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.message || 'Erreur chargement rapport Z')
			}

			const data = await res.json()

			// Parser le full_report si c'est une string
			if (typeof data.full_report === 'string') {
				data.full_report = JSON.parse(data.full_report)
			}

			return data.full_report as RapportZ
		},
		enabled: options?.enabled ?? !!id,
		staleTime: Number.POSITIVE_INFINITY, // Les rapports Z sont immuables
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

			// Depuis le 31 août 2026, la route CLÔTURE ET ÉMET LE Z : elle rend
			// la session fermée, la journée clôturée et le rapport. Le front ne
			// déclenche plus la génération — voir backend/routes/cash_routes.go.
			return (await res.json()) as {
				session: CashSession
				date: string
				z_report: RapportZ
			}
		},
		onSuccess: (data, params) => {
			queryClient.invalidateQueries({
				queryKey: cashKeys.activeSession(params.cashRegisterId),
			})
			queryClient.invalidateQueries({
				queryKey: cashKeys.sessionHistory(params.cashRegisterId),
			})

			if (!params.cashRegisterId) return

			// ⚠️ `refetchType: 'all'`, ET C'EST LE POINT.
			//
			// Par défaut, invalidateQueries ne REFAIT que les requêtes actives.
			// L'historique des Z (`zReportList`) ne l'est pas au moment de la
			// clôture : on est encore sur le terminal, la page Rapport Z n'est
			// pas montée. Elle était donc seulement marquée périmée, et selon
			// l'ordre du montage et de la navigation la liste s'affichait telle
			// qu'elle était AVANT la clôture — d'où « je dois rafraîchir la page
			// pour voir tous les Z ». 'all' la refait tout de suite, montée ou
			// non.
			queryClient.invalidateQueries({
				queryKey: cashKeys.zReports(),
				refetchType: 'all',
			})

			// Le rapport est DANS la réponse : on le pose dans le cache plutôt
			// que d'aller le redemander. La page Rapport Z l'affiche alors sans
			// une seule requête — et sans qu'aucun rendu n'ait à le fabriquer.
			// Après l'invalidation, jamais avant : l'inverse le marquerait
			// périmé aussitôt posé.
			if (data.z_report && data.date) {
				queryClient.setQueryData(
					cashKeys.zReportGenerate(params.cashRegisterId, data.date),
					data.z_report,
				)
				queryClient.setQueryData(
					cashKeys.zReportCheck(params.cashRegisterId, data.date),
					{
						exists: true,
						can_generate: false,
						available_sessions: 0,
						number: data.z_report.number,
						message: 'Rapport Z déjà généré pour cette date',
					} satisfies ZReportCheckResponse,
				)
			}
		},
	})
}

// ============================================================================
// LE FONDS PROPOSÉ POUR LA JOURNÉE
// ============================================================================

/**
 * useFondsDuJour rend ce que le tiroir devrait contenir ce matin : le dernier
 * comptage réel, augmenté des flux écoulés depuis.
 *
 * Il est PROPOSÉ, pas imposé : l'écran « Commencer la journée » le préremplit
 * et le laisse modifier. Le calcul vit dans backend/reports/fonds_reporte.go et
 * lit le journal des espèces — rien n'est recalculé ici.
 */
export function useFondsDuJour(ownerCompanyId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: ['cash', 'fonds-du-jour', ownerCompanyId],
		queryFn: async () => {
			const token = pb.authStore.token
			const res = await fetch(
				`/api/cash/fonds-du-jour?owner_company=${encodeURIComponent(
					ownerCompanyId ?? '',
				)}`,
				{ headers: { Authorization: token ? `Bearer ${token}` : '' } },
			)

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.message || 'Erreur calcul du fonds du jour')
			}

			// La PROVENANCE accompagne le montant depuis le 1er septembre 2026 :
			// l'écran annonçait « tiroir de la veille » un report théorique de
			// huit journées. Voir backend/reports/fonds_reporte.go.
			return (await res.json()) as {
				date: string
				fonds: number
				comptage: number
				jour_du_comptage: string
				flux: number
				jours_de_flux: number
				tiroir_de_la_veille: boolean
			}
		},
		enabled: !!ownerCompanyId,
		staleTime: 1000 * 60,
	})
}

// ============================================================================
// MUTATION : COMPTAGE DU TIROIR — facultatif, ne clôture rien
// ============================================================================

/**
 * useCountCashSession enregistre le comptage du tiroir SANS fermer la session.
 *
 * Depuis le 29 août 2026, les sessions sont implicites — une par journée,
 * ouverte au premier encaissement (backend/session_du_jour.go). Compter le
 * tiroir ne doit donc plus clôturer : une session fermée en milieu de journée
 * serait remplacée par une seconde au prochain encaissement, et la journée en
 * porterait deux au lieu d'une.
 *
 * La fermeture appartient au rapport Z et au passage de journée.
 */
export function useCountCashSession() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (params: {
			sessionId: string
			cashRegisterId?: string
			countedCashTotal: number
		}) => {
			const token = pb.authStore.token

			const res = await fetch(
				`/api/cash/session/${encodeURIComponent(params.sessionId)}/count`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: token ? `Bearer ${token}` : '',
					},
					body: JSON.stringify({
						counted_cash_total: params.countedCashTotal,
					}),
				},
			)

			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(
					err.message || "Erreur lors de l'enregistrement du comptage",
				)
			}

			return (await res.json()) as CashSession
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
			queryClient.invalidateQueries({
				queryKey: cashKeys.movementsBySession(params.sessionId),
			})

			queryClient.invalidateQueries({
				queryKey: cashKeys.xReport(params.sessionId),
			})

			if (params.cashRegisterId) {
				queryClient.invalidateQueries({
					queryKey: cashKeys.activeSession(params.cashRegisterId),
				})

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

export async function getOrCreateDefaultCustomer(
	pb: any,
	ownerCompanyId: string,
): Promise<string> {
	try {
		const existing = await pb
			.collection('customers')
			.getFirstListItem(
				`name = "Client de passage" && owner_company = "${ownerCompanyId}"`,
			)

		return existing.id
	} catch {
		const created = await pb.collection('customers').create({
			name: 'Client de passage',
			owner_company: ownerCompanyId,
			email: 'pos@default.local',
			notes: 'Client par défaut pour les ventes POS sans client spécifique',
		})

		return created.id
	}
}
