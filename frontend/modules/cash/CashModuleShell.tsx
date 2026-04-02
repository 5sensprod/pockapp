// frontend/modules/cash/CashModuleShell.tsx

import { ModulePageShell, StatusBadge } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import type { ModuleManifest } from '@/modules/_registry'
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
	forcedRegisterId?: string
	extraActions?: ReactNode
	/** Remplace "PocketCash" — masque aussi le badge PRO et la description */
	pageTitle?: string
	/** Contenu injecté dans la barre (filtres, stats…) */
	headerExtras?: ReactNode
	/** Masque sélecteur caisse, fond, Rapport X, Mouvement et Clôturer */
	hideSessionActions?: boolean
}

export function CashModuleShell({
	children,
	forcedRegisterId,
	extraActions,
	pageTitle,
	headerExtras,
	hideSessionActions = false,
}: CashModuleShellProps) {
	const cash = useCashModule()

	React.useEffect(() => {
		if (forcedRegisterId && cash.selectedRegisterId !== forcedRegisterId) {
			cash.setSelectedRegisterId(forcedRegisterId)
		}
	}, [forcedRegisterId, cash.selectedRegisterId, cash.setSelectedRegisterId])

	// ── Heure temps réel ──────────────────────────────────────────────────────
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
		const msUntilNextMinute = (60 - new Date().getSeconds()) * 1000
		const timeout = setTimeout(() => {
			tick()
			const interval = setInterval(tick, 60_000)
			;(timeout as any)._interval = interval
		}, msUntilNextMinute)
		return () => {
			clearTimeout(timeout)
			if ((timeout as any)._interval) clearInterval((timeout as any)._interval)
		}
	}, [])

	// ── Manifest contextuel — pageTitle masque PRO + description ─────────────
	const contextualManifest: ModuleManifest = pageTitle
		? { ...manifest, name: pageTitle, description: '', plan: undefined }
		: manifest

	const badge = (
		<StatusBadge
			label={cash.sessionLabel}
			variant={cash.sessionVariant}
			sublabel={`${cash.today} · ${time}`}
		/>
	)

	const actions = (
		<div className='flex items-center gap-2'>
			{headerExtras}

			{!hideSessionActions && (
				<>
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

					<span className='text-[11px] text-muted-foreground border-l pl-2'>
						Fond{' '}
						<span className='font-medium text-foreground'>
							{cash.activeSession?.opening_float?.toFixed(2) ?? '—'} €
						</span>
					</span>

					{cash.isSessionOpen && (
						<>
							<Button
								size='sm'
								variant='outline'
								onClick={cash.handleShowRapportX}
							>
								Rapport X
							</Button>
							<Button
								size='sm'
								variant='outline'
								onClick={cash.handleShowMovement}
							>
								Mouvement
							</Button>
						</>
					)}

					{extraActions}

					<Button
						size='sm'
						onClick={cash.handleToggleSession}
						disabled={!cash.canToggleSession}
					>
						{cash.isSessionOpen ? 'Clôturer la session' : 'Ouvrir une session'}
					</Button>
				</>
			)}
		</div>
	)

	return (
		<ModulePageShell
			manifest={contextualManifest}
			badge={badge}
			actions={actions}
		>
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

			{children}
		</ModulePageShell>
	)
}
