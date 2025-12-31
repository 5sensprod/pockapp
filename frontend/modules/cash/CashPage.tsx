// frontend/modules/cash/CashPage.tsx
import { CalendarDays } from 'lucide-react'
import * as React from 'react'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useXReport } from '@/lib/queries/cash'
import { useAuth } from '@/modules/auth/AuthProvider'

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
	useRegisterManager,
	useSessionManager,
} from './components'

import { manifest } from './index'

export function CashPage() {
	const Icon = manifest.icon
	const { isAuthenticated, user } = useAuth()
	const { activeCompanyId } = useActiveCompany()

	const ownerCompanyId = activeCompanyId ?? undefined

	// =========================
	// GESTION DES CAISSES
	// =========================
	const registerManager = useRegisterManager({ ownerCompanyId })

	// =========================
	// GESTION DES SESSIONS
	// =========================
	const sessionManager = useSessionManager({
		selectedRegisterId: registerManager.selectedRegisterId,
		userId: user?.id,
		ownerCompanyId,
		isAuthenticated,
	})

	// =========================
	// DIALOGS (Close / X / Movement / Opening)
	// =========================
	const [showCloseDialog, setShowCloseDialog] = React.useState(false)
	const [showRapportX, setShowRapportX] = React.useState(false)
	const [showMovement, setShowMovement] = React.useState(false)
	const [showOpenDialog, setShowOpenDialog] = React.useState(false)

	const sessionId = sessionManager.activeSession?.id
	const canFetchXReport = typeof sessionId === 'string' && sessionId.length > 0

	const { data: rapportX, refetch: refetchRapportX } = useXReport(
		sessionId ?? '',
	)

	// =========================
	// DONNÉES STATIQUES (MOCK)
	// =========================
	const [selectedStore] = React.useState('Axe Musique — Centre-ville')

	const today = new Date().toLocaleDateString('fr-FR', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
	})

	// =========================
	// HANDLERS
	// =========================
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

	// =========================
	// EARLY RETURN : AUCUNE CAISSE
	// =========================
	if (
		!registerManager.isRegistersLoading &&
		(!registerManager.registers || registerManager.registers.length === 0)
	) {
		return (
			<NoRegisterState
				onCreateRegister={registerManager.handleCreateRegister}
				isCreating={registerManager.createRegister.isPending}
			/>
		)
	}

	return (
		<>
			{/* Dialog d'ouverture de session */}
			<OpenSessionDialog
				open={showOpenDialog}
				onOpenChange={setShowOpenDialog}
				onSubmit={handleOpenSession}
				lastKnownFloat={sessionManager.lastKnownFloat}
				lastClosedAtLabel={sessionManager.lastClosedAtLabel}
				isSubmitting={sessionManager.openSessionMutation.isPending}
			/>

			{/* Contenu principal de la page */}
			<div className='container mx-auto flex flex-col gap-6 px-6 py-8'>
				{/* Header */}
				<header className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
					<div className='flex items-center gap-3'>
						<div className='flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white'>
							<Icon className='h-5 w-5' />
						</div>
						<div>
							<h1 className='text-2xl font-semibold tracking-tight'>
								{manifest.name}
							</h1>
							<p className='text-sm text-muted-foreground'>
								Configuration de la caisse, des sessions et du point de vente.
							</p>
						</div>
					</div>

					<div className='flex flex-wrap items-center gap-3 text-xs'>
						<div className='flex items-center gap-2 rounded-full bg-emerald-500/5 px-3 py-1'>
							<span
								className={`h-2 w-2 rounded-full ${sessionManager.sessionPillColor}`}
							/>
							<span
								className={`font-medium ${sessionManager.sessionTextColor}`}
							>
								{sessionManager.sessionLabel}
							</span>
						</div>

						<div className='flex items-center gap-2 text-muted-foreground'>
							<CalendarDays className='h-3.5 w-3.5' />
							<span className='font-medium'>{today}</span>
						</div>
					</div>
				</header>

				{/* Section principale : Session, Point de vente, Imprimante */}
				<section className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
					<SessionManagerCard
						registers={registerManager.registers}
						selectedRegisterId={registerManager.selectedRegisterId}
						onRegisterChange={registerManager.setSelectedRegisterId}
						isRegistersLoading={registerManager.isRegistersLoading}
						isSessionOpen={sessionManager.isSessionOpen}
						selectedRegisterName={registerManager.selectedRegister?.name}
						openingFloat={(sessionManager.activeSession as any)?.opening_float}
						sessionLabel={sessionManager.sessionLabel}
						canToggleSession={sessionManager.canToggleSession}
						onToggleSession={handleToggleSession}
						onShowRapportX={() => {
							if (canFetchXReport) refetchRapportX()
							setShowRapportX(true)
						}}
						onShowMovement={() => setShowMovement(true)}
						selectedStore={selectedStore}
					/>

					<StoreInfoCard selectedStore={selectedStore} />

					<PrinterSettingsCard />

					<DisplaySettingsCard />

					<PaymentMethodsCard />
				</section>

				{/* Section secondaire : Raccourcis et Journal */}
				<section className='grid gap-4 lg:grid-cols-3'>
					<CashShortcutsCard />

					<QuickJournalCard />
				</section>
			</div>

			{/* Dialogs conditionnels (clôture, rapport X, mouvement) */}
			{sessionManager.activeSession && registerManager.selectedRegisterId && (
				<>
					<CloseSessionDialog
						open={showCloseDialog}
						onOpenChange={setShowCloseDialog}
						session={sessionManager.activeSession}
					/>

					<RapportXDialog
						open={showRapportX}
						onOpenChange={setShowRapportX}
						rapport={rapportX}
					/>

					<CashMovementDialog
						open={showMovement}
						onOpenChange={setShowMovement}
						sessionId={sessionManager.activeSession.id ?? ''}
						cashRegisterId={registerManager.selectedRegisterId}
					/>
				</>
			)}
		</>
	)
}
