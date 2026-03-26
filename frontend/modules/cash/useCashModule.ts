// frontend/modules/cash/useCashModule.ts
//
// Hook CONTAINER — toute la logique métier de la CashPage.
// Aucun JSX, aucun import de composant UI.
// Retourne un objet plat consommé par CashView via spread {...cash}.

import * as React from 'react'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useXReport } from '@/lib/queries/cash'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useRegisterManager, useSessionManager } from './components'
import type { StatusVariant } from '@/components/module-ui/StatusBadge'

// Mapping interne : couleur Tailwind de session → variant StatusBadge
function toStatusVariant(pillColor: string): StatusVariant {
  if (pillColor.includes('emerald') || pillColor.includes('green')) return 'open'
  if (pillColor.includes('red')) return 'error'
  if (pillColor.includes('orange') || pillColor.includes('amber')) return 'warning'
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
  const { data: rapportX, refetch: refetchRapportX } = useXReport(sessionId ?? '')

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
    selectedStore,
    today,
  }
}

// Type exporté — utilisé par CashView pour typer ses props
export type CashModuleData = ReturnType<typeof useCashModule>
