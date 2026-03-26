// frontend/modules/cash/CashView.tsx
//
// Composant PRESENTATIONAL — zéro logique métier, zéro hook.
// Reçoit tout via les props (type CashModuleData depuis useCashModule).
//
// Remplace le JSX de l'ancien CashPage à partir de la ligne 111.
// Les dialogs sont inclus ici car ils font partie de la vue,
// mais leur état (open/onOpenChange) vient du hook.

// import { EmptyState } from '@/components/module-ui'
// import { ShoppingCart } from 'lucide-react'
import { CashMovementDialog } from './components/movements/CashMovementDialog'
import { RapportXDialog } from './components/reports/RapportXDialog'
import { CloseSessionDialog } from './components/sessions/CloseSessionDialog'

import {
	CashShortcutsCard,
	DisplaySettingsCard,
	NoRegisterState,
	OpenSessionDialog,
	PaymentMethodsCard,
	PrinterSettingsCard,
	QuickJournalCard,
	SessionManagerCard,
	StoreInfoCard,
} from './components'

import { ScannerSettingsCard } from './ScannerSettingsCard'
import type { CashModuleData } from './useCashModule'

// CashView reçoit exactement ce que retourne useCashModule()
type CashViewProps = CashModuleData

export function CashView({
	// Registres
	registers,
	selectedRegisterId,
	selectedRegister,
	setSelectedRegisterId,
	isRegistersLoading,
	handleCreateRegister,
	isCreatingRegister,
	hasNoRegisters,

	// Session
	isSessionOpen,
	activeSession,
	sessionLabel,
	canToggleSession,
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
	handleToggleSession,
	handleOpenSession,
	handleShowRapportX,
	handleShowMovement,

	// Data
	rapportX,
	selectedStore,
}: CashViewProps) {
	// ── Early return : aucune caisse configurée ──────────────────────────────
	// Utilise EmptyState mutualisé ou NoRegisterState si sa logique est spécifique
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
				{/* Section 1 : Session + Configurations (3 colonnes sur xl) */}
				<section className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
					<SessionManagerCard
						registers={registers}
						selectedRegisterId={selectedRegisterId}
						onRegisterChange={setSelectedRegisterId}
						isRegistersLoading={isRegistersLoading}
						isSessionOpen={isSessionOpen}
						selectedRegisterName={selectedRegister?.name}
						openingFloat={(activeSession as any)?.opening_float}
						sessionLabel={sessionLabel}
						canToggleSession={canToggleSession}
						onToggleSession={handleToggleSession}
						onShowRapportX={handleShowRapportX}
						onShowMovement={handleShowMovement}
						selectedStore={selectedStore}
					/>

					<StoreInfoCard selectedStore={selectedStore} />

					<PrinterSettingsCard />

					<DisplaySettingsCard />

					<ScannerSettingsCard />

					<PaymentMethodsCard />
				</section>

				{/* Section 2 : Raccourcis + Journal (3 colonnes sur lg) */}
				<section className='grid gap-4 lg:grid-cols-3'>
					<CashShortcutsCard
						isSessionOpen={isSessionOpen}
						selectedRegisterId={selectedRegisterId}
						selectedRegisterName={selectedRegister?.name}
					/>

					<QuickJournalCard />
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
