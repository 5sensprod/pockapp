// frontend/modules/cash/CashModuleShell.tsx
//
// Shell mutualisé pour TOUTES les pages du module PocketCash.
// Wrape ModulePageShell avec :
//   - StatusBadge session + date
//   - Sélecteur de caisse
//   - Fond de caisse
//   - Boutons Rapport X / Mouvement / Ouvrir / Clôturer
//   - Tous les dialogs session (Open, Close, RapportX, Movement)
//
// Usage :
//   <CashModuleShell>
//     <MonContenu />
//   </CashModuleShell>
//
// Pour forcer une caisse spécifique (ex: CashTerminalPage) :
//   <CashModuleShell forcedRegisterId={cashRegisterId}>
//     ...
//   </CashModuleShell>

import { ModulePageShell, StatusBadge } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'
import * as React from 'react'
import { OpenSessionDialog } from './components'
import { CashMovementDialog } from './components/movements/CashMovementDialog'
import { RapportXDialog } from './components/reports/RapportXDialog'
import { CloseSessionDialog } from './components/sessions/CloseSessionDialog'
import { manifest } from './manifest'
import { useCashModule } from './useCashModule'

interface CashModuleShellProps {
	children: ReactNode
	/** Optionnel — force la caisse active (ex: terminal lié à une caisse URL) */
	forcedRegisterId?: string
	/** Actions supplémentaires à droite du header (ex: boutons spécifiques à une page) */
	extraActions?: ReactNode
}

export function CashModuleShell({
	children,
	forcedRegisterId,
	extraActions,
}: CashModuleShellProps) {
	const cash = useCashModule()

	// Synchroniser avec la caisse forcée si fournie (CashTerminalPage)
	React.useEffect(() => {
		if (forcedRegisterId && cash.selectedRegisterId !== forcedRegisterId) {
			cash.setSelectedRegisterId(forcedRegisterId)
		}
	}, [forcedRegisterId, cash.selectedRegisterId, cash.setSelectedRegisterId])

	// ── Heure temps réel (synchronisée sur le début de chaque minute) ─────────
	const [time, setTime] = React.useState(() =>
		new Date().toLocaleTimeString('fr-FR', {
			hour: '2-digit',
			minute: '2-digit',
		}),
	)
	React.useEffect(() => {
		const tick = () =>
			setTime(
				new Date().toLocaleTimeString('fr-FR', {
					hour: '2-digit',
					minute: '2-digit',
				}),
			)
		// Attendre le début de la prochaine minute, puis ticker toutes les 60s
		const msUntilNextMinute = (60 - new Date().getSeconds()) * 1000
		const timeout = setTimeout(() => {
			tick()
			const interval = setInterval(tick, 60_000)
			// Cleanup de l'interval dans le cleanup du timeout
			;(timeout as any)._interval = interval
		}, msUntilNextMinute)
		return () => {
			clearTimeout(timeout)
			if ((timeout as any)._interval) clearInterval((timeout as any)._interval)
		}
	}, [])

	const badge = (
		<StatusBadge
			label={cash.sessionLabel}
			variant={cash.sessionVariant}
			sublabel={`${cash.today} · ${time}`}
		/>
	)

	const actions = (
		<div className='flex items-center gap-2'>
			{/* Sélecteur caisse */}
			{cash.registers && cash.registers.length > 0 && (
				<select
					className='h-7 rounded-md border bg-card px-2 text-[11px]'
					value={cash.selectedRegisterId ?? ''}
					onChange={(e) => cash.setSelectedRegisterId(e.target.value)}
				>
					{cash.registers.map((reg) => (
						<option key={reg.id} value={reg.id}>
							{reg.code ? `${reg.code} — ${reg.name}` : reg.name}
						</option>
					))}
				</select>
			)}

			{/* Fond de caisse */}
			<span className='text-[11px] text-muted-foreground border-l pl-2'>
				Fond{' '}
				<span className='font-medium text-foreground'>
					{cash.activeSession?.opening_float?.toFixed(2) ?? '—'} €
				</span>
			</span>

			{/* Actions session ouverte */}
			{cash.isSessionOpen && (
				<>
					<Button size='sm' variant='outline' onClick={cash.handleShowRapportX}>
						Rapport X
					</Button>
					<Button size='sm' variant='outline' onClick={cash.handleShowMovement}>
						Mouvement
					</Button>
				</>
			)}

			{/* Actions supplémentaires injectées par la page */}
			{extraActions}

			{/* CTA session */}
			<Button
				size='sm'
				onClick={cash.handleToggleSession}
				disabled={!cash.canToggleSession}
			>
				{cash.isSessionOpen ? 'Clôturer la session' : 'Ouvrir une session'}
			</Button>
		</div>
	)

	return (
		<ModulePageShell manifest={manifest} badge={badge} actions={actions}>
			{/* ── Dialogs session (montés sur toutes les pages) ─────────────────── */}
			<OpenSessionDialog
				open={cash.showOpenDialog}
				onOpenChange={cash.setShowOpenDialog}
				onSubmit={cash.handleOpenSession}
				lastKnownFloat={cash.lastKnownFloat}
				lastClosedAtLabel={cash.lastClosedAtLabel}
				isSubmitting={cash.openSessionMutationPending}
			/>

			{cash.activeSession && cash.selectedRegisterId && (
				<>
					<CloseSessionDialog
						open={cash.showCloseDialog}
						onOpenChange={cash.setShowCloseDialog}
						session={cash.activeSession}
					/>
					<RapportXDialog
						open={cash.showRapportX}
						onOpenChange={cash.setShowRapportX}
						rapport={cash.rapportX}
					/>
					<CashMovementDialog
						open={cash.showMovement}
						onOpenChange={cash.setShowMovement}
						sessionId={cash.activeSession.id ?? ''}
						cashRegisterId={cash.selectedRegisterId}
					/>
				</>
			)}

			{/* ── Contenu de la page ────────────────────────────────────────────── */}
			{children}
		</ModulePageShell>
	)
}
