// frontend/modules/cash/CashView.tsx
//
// Composant PRESENTATIONAL — zéro logique métier, zéro hook.
// Reçoit tout via les props (type CashModuleData depuis useCashModule).

// import { EmptyState } from '@/components/module-ui'
// import { ShoppingCart } from 'lucide-react'
import { CashMovementDialog } from './components/movements/CashMovementDialog'
import { RapportXDialog } from './components/reports/RapportXDialog'
import { CloseSessionDialog } from './components/sessions/CloseSessionDialog'

import {
	DisplaySettingsCard,
	NoRegisterState,
	OpenSessionDialog,
	PaymentMethodsCard,
	PrinterSettingsCard,
} from './components'

import { ScannerSettingsCard } from './ScannerSettingsCard'
import type { CashModuleData } from './useCashModule'

// CashView reçoit exactement ce que retourne useCashModule()
type CashViewProps = CashModuleData

export function CashView({
	// Registres
	selectedRegisterId,

	handleCreateRegister,
	isCreatingRegister,
	hasNoRegisters,

	// Session

	activeSession,
	lastKnownFloat,
	lastClosedAtLabel,
	openSessionMutationPending,

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
	handleOpenSession,

	// Data
	rapportX,
}: CashViewProps) {
	// ── Early return : aucune caisse configurée ──────────────────────────────
	if (hasNoRegisters) {
		return (
			<NoRegisterState
				onCreateRegister={handleCreateRegister}
				isCreating={isCreatingRegister}
			/>
		)
	}

	return (
		<>
			{/* ── Dialog ouverture de session ─────────────────────────────────── */}
			<OpenSessionDialog
				open={showOpenDialog}
				onOpenChange={setShowOpenDialog}
				onSubmit={handleOpenSession}
				lastKnownFloat={lastKnownFloat}
				lastClosedAtLabel={lastClosedAtLabel}
				isSubmitting={openSessionMutationPending}
			/>

			{/* ── Grille principale ───────────────────────────────────────────── */}
			<div className='flex flex-col gap-6'>
				{/* Section 1 : Configurations (3 colonnes sur xl) */}
				<section className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
					<PrinterSettingsCard />

					<DisplaySettingsCard />

					<ScannerSettingsCard />

					<PaymentMethodsCard />
				</section>
			</div>

			{/* ── Dialogs conditionnels (session active requise) ──────────────── */}
			{activeSession && selectedRegisterId && (
				<>
					<CloseSessionDialog
						open={showCloseDialog}
						onOpenChange={setShowCloseDialog}
						session={activeSession}
					/>

					<RapportXDialog
						open={showRapportX}
						onOpenChange={setShowRapportX}
						rapport={rapportX}
					/>

					<CashMovementDialog
						open={showMovement}
						onOpenChange={setShowMovement}
						sessionId={activeSession.id ?? ''}
						cashRegisterId={selectedRegisterId}
					/>
				</>
			)}
		</>
	)
}
