// frontend/modules/cash/CashView.tsx
//
// Grille bento asymétrique — style Stitch "Editorial Precision"
// PrinterSettingsCard : col-span-7 featured
// DisplaySettingsCard : col-span-5
// ScannerSettingsCard : col-span-4
// PaymentMethodsCard  : col-span-8

import { ScannerSettingsCard } from './ScannerSettingsCard'
import {
	DisplaySettingsCard,
	NoRegisterState,
	OpenSessionDialog,
	PaymentMethodsCard,
	PrinterSettingsCard,
} from './components'
import { CashMovementDialog } from './components/movements/CashMovementDialog'
import { RapportXDialog } from './components/reports/RapportXDialog'
import { CloseSessionDialog } from './components/sessions/CloseSessionDialog'
import type { CashModuleData } from './useCashModule'

type CashViewProps = CashModuleData

export function CashView({
	selectedRegisterId,
	handleCreateRegister,
	isCreatingRegister,
	hasNoRegisters,
	activeSession,
	lastKnownFloat,
	lastClosedAtLabel,
	openSessionMutationPending,
	showOpenDialog,
	setShowOpenDialog,
	showCloseDialog,
	setShowCloseDialog,
	showRapportX,
	setShowRapportX,
	showMovement,
	setShowMovement,
	handleOpenSession,
	rapportX,
}: CashViewProps) {
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
			<OpenSessionDialog
				open={showOpenDialog}
				onOpenChange={setShowOpenDialog}
				onSubmit={handleOpenSession}
				lastKnownFloat={lastKnownFloat}
				lastClosedAtLabel={lastClosedAtLabel}
				isSubmitting={openSessionMutationPending}
			/>

			{/* ── Bento grid asymétrique 12 colonnes — style Stitch ─────────────── */}
			{/* Fond surface-container-low (#F1F3FF) → cards bg-card ressortent par lift tonal */}
			<div className='grid grid-cols-1 md:grid-cols-12 gap-6'>
				{/* Imprimante — featured, col 7 */}
				<div className='md:col-span-7'>
					<PrinterSettingsCard />
				</div>

				{/* Afficheur client — col 5 */}
				<div className='md:col-span-5'>
					<DisplaySettingsCard />
				</div>

				{/* Scanette — col 4 */}
				<div className='md:col-span-4'>
					<ScannerSettingsCard />
				</div>

				{/* Moyens de paiement — col 8 */}
				<div className='md:col-span-8'>
					<PaymentMethodsCard />
				</div>
			</div>

			{/* Dialogs conditionnels */}
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
