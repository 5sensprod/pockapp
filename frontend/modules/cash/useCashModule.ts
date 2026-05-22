// frontend/modules/cash/useCashModule.ts
//
// Hook CONTAINER — toute la logique métier de la CashPage.
// Aucun JSX, aucun import de composant UI.
// Retourne un objet plat consommé par CashView via spread {...cash}.

import type { StatusVariant } from '@/components/module-ui/StatusBadge'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useXReport } from '@/lib/queries/cash'
import { useAuth } from '@/modules/auth/AuthProvider'
import * as React from 'react'
import { useRegisterManager, useSessionManager } from './components'

// Mapping interne : couleur Tailwind de session → variant StatusBadge
function toStatusVariant(pillColor: string): StatusVariant {
	if (pillColor.includes('emerald') || pillColor.includes('green'))
		return 'open'
	if (pillColor.includes('red')) return 'error'
	if (pillColor.includes('orange') || pillColor.includes('amber'))
		return 'warning'
	return 'closed'
}

export function useCashModule() {
	const { isAuthenticated, user } = useAuth()
	const { activeCompanyId } = useActiveCompany()
	const ownerCompanyId = activeCompanyId ?? undefined

	// ── Registres (caisses) ──────────────────────────────────────────────────
	const registerManager = useRegisterManager({ ownerCompanyId })

	// ── Sessions ─────────────────────────────────────────────────────────────
	const sessionManager = useSessionManager({
		selectedRegisterId: registerManager.selectedRegisterId,
		userId: user?.id,
		ownerCompanyId,
		isAuthenticated,
	})

	// ── État des dialogs ──────────────────────────────────────────────────────
	const [showCloseDialog, setShowCloseDialog] = React.useState(false)
	const [showRapportX, setShowRapportX] = React.useState(false)
	const [showMovement, setShowMovement] = React.useState(false)
	const [showOpenDialog, setShowOpenDialog] = React.useState(false)

	// ── Rapport X ─────────────────────────────────────────────────────────────
	const sessionId = sessionManager.activeSession?.id
	const canFetchXReport = typeof sessionId === 'string' && sessionId.length > 0
	const { data: rapportX, refetch: refetchRapportX } = useXReport(
		sessionId ?? '',
	)

	// ── Données contextuelles ─────────────────────────────────────────────────
	const [selectedStore] = React.useState('Axe Musique — Centre-ville')

	const today = new Date().toLocaleDateString('fr-FR', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
	})

	// ── Handlers ──────────────────────────────────────────────────────────────
	const handleToggleSession = () => {
		if (sessionManager.isSessionOpen && sessionManager.activeSession) {
			setShowCloseDialog(true)
		} else {
			setShowOpenDialog(true)
		}
	}

	const handleOpenSession = async (openingFloat: number) => {
		await sessionManager.handleOpenSession(openingFloat)
		setShowOpenDialog(false)
	}

	const handleShowRapportX = () => {
		if (canFetchXReport) refetchRapportX()
		setShowRapportX(true)
	}

	// ── Espèces actuelles en caisse ──────────────────────────────────────────
	// Priorité : rapport X (valeur temps réel) → opening_float (fallback session)
	const cashInDrawer: number | null =
		rapportX?.expected_cash?.total ??
		sessionManager.activeSession?.opening_float ??
		null

	// CA net de la session (ventes - avoirs) — depuis rapport X
	const caNet: number | null =
		(rapportX?.sales as any)?.net_ttc ?? rapportX?.sales?.total_ttc ?? null

	// ── Valeur retournée (interface plate, consommée par CashView) ────────────
	return {
		// Registres
		registers: registerManager.registers,
		selectedRegisterId: registerManager.selectedRegisterId,
		selectedRegister: registerManager.selectedRegister,
		setSelectedRegisterId: registerManager.setSelectedRegisterId,
		isRegistersLoading: registerManager.isRegistersLoading,
		handleCreateRegister: registerManager.handleCreateRegister,
		isCreatingRegister: registerManager.createRegister.isPending,
		hasNoRegisters:
			!registerManager.isRegistersLoading &&
			(!registerManager.registers || registerManager.registers.length === 0),

		// Session
		isSessionOpen: sessionManager.isSessionOpen,
		activeSession: sessionManager.activeSession,
		sessionLabel: sessionManager.sessionLabel,
		sessionVariant: toStatusVariant(sessionManager.sessionPillColor),
		canToggleSession: sessionManager.canToggleSession,
		lastKnownFloat: sessionManager.lastKnownFloat,
		lastClosedAtLabel: sessionManager.lastClosedAtLabel,
		openSessionMutationPending: sessionManager.openSessionMutation.isPending,

		// Dialogs state
		showOpenDialog,
		setShowOpenDialog,
		showCloseDialog,
		setShowCloseDialog,
		showRapportX,
		setShowRapportX,
		showMovement,
		setShowMovement,

		// Handlers
		handleToggleSession,
		handleOpenSession,
		handleShowRapportX,
		handleShowMovement: () => setShowMovement(true),

		// Data
		rapportX,
		cashInDrawer,
		caNet,
		selectedStore,
		today,
	}
}

// Type exporté — utilisé par CashView pour typer ses props
export type CashModuleData = ReturnType<typeof useCashModule>
