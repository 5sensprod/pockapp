// frontend/modules/cash/components/hooks/useSessionManager.ts
import * as React from 'react'
import { toast } from 'sonner'
import {
	useActiveCashSession,
	useLastClosedCashSession,
	useOpenCashSession,
	useCloseCashSession,
} from '@/lib/queries/cash'
import { toFiniteNumber } from '../types/denominations'

interface UseSessionManagerProps {
	selectedRegisterId?: string
	userId?: string
	ownerCompanyId?: string
	isAuthenticated: boolean
}

/**
 * Hook pour gérer l'état et les actions de la session de caisse
 */
export function useSessionManager({
	selectedRegisterId,
	userId,
	ownerCompanyId,
	isAuthenticated,
}: UseSessionManagerProps) {
	// Queries
	const {
		data: activeSession,
		isLoading: isSessionLoading,
		isFetching: isSessionFetching,
	} = useActiveCashSession(selectedRegisterId)

	const { data: lastClosedSession } =
		useLastClosedCashSession(selectedRegisterId)

	// Mutations
	const openSessionMutation = useOpenCashSession()
	const closeSessionMutation = useCloseCashSession()

	// État dérivé
	const isSessionOpen = !!activeSession && activeSession.status === 'open'
	const isMutatingSession =
		openSessionMutation.isPending || closeSessionMutation.isPending

	const canToggleSession =
		isAuthenticated &&
		!!selectedRegisterId &&
		!isMutatingSession &&
		!isSessionLoading

	// Dernier fond de caisse connu
	const lastKnownFloat = React.useMemo(() => {
		if (!lastClosedSession) return null

		return (
			toFiniteNumber((lastClosedSession as any).counted_cash_total) ??
			toFiniteNumber((lastClosedSession as any).expected_cash_total) ??
			toFiniteNumber((lastClosedSession as any).opening_float) ??
			null
		)
	}, [lastClosedSession])

	// Label de la dernière clôture
	const lastClosedAtLabel = React.useMemo(() => {
		if (!lastClosedSession) return null

		const raw =
			(lastClosedSession as any).closed_at ??
			(lastClosedSession as any).closedAt ??
			(lastClosedSession as any).updated ??
			null

		if (!raw) return null

		const d = new Date(raw)
		if (Number.isNaN(d.getTime())) return null

		return d.toLocaleString('fr-FR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		})
	}, [lastClosedSession])

	// Label de status
	const sessionLabel = React.useMemo(() => {
		if (!isAuthenticated) return 'Utilisateur non connecté'
		if (isSessionLoading || isSessionFetching)
			return 'Chargement de la session...'
		if (isSessionOpen) return 'Session en cours'
		return 'Aucune session ouverte'
	}, [isAuthenticated, isSessionLoading, isSessionFetching, isSessionOpen])

	// Couleurs du badge
	const sessionPillColor = isSessionOpen ? 'bg-emerald-500' : 'bg-slate-400'
	const sessionTextColor = isSessionOpen ? 'text-emerald-700' : 'text-slate-600'

	// Action d'ouverture de session
	const handleOpenSession = React.useCallback(
		(openingFloat: number) => {
			if (!isAuthenticated) {
				toast.error('Vous devez être connecté pour gérer la caisse.')
				return Promise.reject()
			}
			if (!ownerCompanyId) {
				toast.error("Impossible de déterminer l'entreprise (owner_company).")
				return Promise.reject()
			}
			if (!selectedRegisterId) {
				toast.error('Aucune caisse sélectionnée.')
				return Promise.reject()
			}
			if (!Number.isFinite(openingFloat) || openingFloat < 0) {
				toast.error('Fond de caisse invalide.')
				return Promise.reject()
			}

			return new Promise((resolve, reject) => {
				openSessionMutation.mutate(
					{
						ownerCompanyId,
						cashRegisterId: selectedRegisterId,
						openingFloat,
						openedBy: userId,
					},
					{
						onSuccess: (data) => {
							toast.success('Session ouverte.')
							resolve(data)
						},
						onError: (err: any) => {
							toast.error(
								err?.message ?? "Erreur lors de l'ouverture de la session.",
							)
							reject(err)
						},
					},
				)
			})
		},
		[
			isAuthenticated,
			ownerCompanyId,
			selectedRegisterId,
			userId,
			openSessionMutation,
		],
	)

	return {
		// État de la session
		activeSession,
		isSessionOpen,
		isSessionLoading,
		isSessionFetching,
		isMutatingSession,
		canToggleSession,

		// Dernière session fermée
		lastClosedSession,
		lastKnownFloat,
		lastClosedAtLabel,

		// Labels et couleurs
		sessionLabel,
		sessionPillColor,
		sessionTextColor,

		// Actions
		handleOpenSession,
		openSessionMutation,
		closeSessionMutation,
	}
}
