// frontend/modules/cash/CashModuleShell.tsx
//
// Shell contextuel du module cash.
// Injecte la logique session (useCashModule) dans ModulePageShell.
//
// Slots disponibles pour les pages :
//   headerLeft        → zone gauche du header (bouton retour, infos contextuelles)
//   headerCenter      → zone centre (recherche, infos ticket…)
//   headerRight       → zone droite avant les actions session
//   extraActions      → boutons supplémentaires dans la zone session
//   hideSessionActions → masque tout le bloc session (tickets, détails…)
//   hideBadge         → masque le badge session/heure (détail ticket)

import { ModulePageShell, StatusBadge } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useClock } from '@/hooks/useClock'
import type { ModuleManifest } from '@/modules/_registry'
import { MoreHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import * as React from 'react'
import { OpenSessionDialog } from './components'
import { CashMovementDialog } from './components/movements/CashMovementDialog'
import { RapportXDialog } from './components/reports/RapportXDialog'
import { CloseSessionDialog } from './components/sessions/CloseSessionDialog'
import { manifest } from './manifest'
import { useCashModule } from './useCashModule'

export interface CashModuleShellProps {
	children: ReactNode

	// Sync caisse forcée (terminal)
	forcedRegisterId?: string

	// Override titre/icône du module dans le header
	pageTitle?: string
	pageIcon?: LucideIcon

	// Slots header — remplacent les portails DOM
	headerLeft?: ReactNode // zone gauche : bouton retour, breadcrumb, infos ticket
	headerCenter?: ReactNode // zone centre : recherche, pagination…
	headerRight?: ReactNode // zone droite : actions contextuelles de la page

	// Actions supplémentaires dans le bloc session (Imprimer, Exporter…)
	extraActions?: ReactNode

	// Masquage
	hideSessionActions?: boolean
	hideBadge?: boolean
	hideTitle?: boolean
	hideIcon?: boolean
}

export function CashModuleShell({
	children,
	forcedRegisterId,
	pageTitle,
	pageIcon,
	headerLeft,
	headerCenter,
	headerRight,
	extraActions,
	hideSessionActions = false,
	hideBadge = false,
	hideTitle = false,
	hideIcon = false,
}: CashModuleShellProps) {
	const cash = useCashModule()
	const time = useClock()

	// Sync caisse forcée (terminal POS)
	React.useEffect(() => {
		if (forcedRegisterId && cash.selectedRegisterId !== forcedRegisterId) {
			cash.setSelectedRegisterId(forcedRegisterId)
		}
	}, [forcedRegisterId, cash.selectedRegisterId, cash.setSelectedRegisterId])

	// Override du manifest pour les sous-pages (titre contextuel)
	const contextualManifest: ModuleManifest = pageTitle
		? {
				...manifest,
				name: pageTitle,
				description: '',
				plan: undefined,
				icon: pageIcon ?? manifest.icon,
			}
		: manifest

	// Badge session + horloge
	const badge = hideBadge ? null : (
		<StatusBadge
			label={cash.sessionLabel}
			variant={cash.sessionVariant}
			sublabel={`${cash.today} · ${time}`}
		/>
	)

	// Bloc actions droite : page + session
	const actions = (
		<div className='flex items-center gap-2'>
			{/* Actions contextuelles de la page (ex: Télécharger, Aperçu…) */}
			{headerRight}

			{/* Bloc session — masqué sur les pages détail/rapport */}
			{!hideSessionActions && (
				<>
					{/* Sélecteur de caisse — toujours visible */}
					{cash.registers && cash.registers.length > 0 && (
						<select
							className='h-7 rounded-md border bg-card px-2 text-[11px]'
							value={cash.selectedRegisterId ?? ''}
							onChange={(e) => cash.setSelectedRegisterId(e.target.value)}
						>
							{cash.registers.map((reg) => (
								<option key={reg.id} value={reg.id}>
									{reg.name}
								</option>
							))}
						</select>
					)}

					{/* Fond — visible uniquement ≥ desktop */}
					<span className='hidden desktop:inline text-[11px] text-muted-foreground border-l pl-2 shrink-0'>
						Fond{' '}
						<span className='font-medium text-foreground'>
							{cash.activeSession?.opening_float?.toFixed(2) ?? '—'} €
						</span>
					</span>

					{cash.isSessionOpen && (
						<>
							{/* ≥ desktop : boutons texte en clair */}
							<Button
								size='sm'
								variant='outline'
								onClick={cash.handleShowRapportX}
								className='hidden desktop:inline-flex'
							>
								Rapport X
							</Button>
							<Button
								size='sm'
								variant='outline'
								onClick={cash.handleShowMovement}
								className='hidden desktop:inline-flex'
							>
								Mouvement
							</Button>
							<div className='hidden desktop:flex'>{extraActions}</div>

							{/* < desktop : dropdown ⋯ */}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										size='sm'
										variant='outline'
										className='desktop:hidden px-2'
									>
										<MoreHorizontal className='h-4 w-4' />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align='end'>
									{cash.activeSession?.opening_float != null && (
										<>
											<div className='px-3 py-1.5 text-[11px] text-muted-foreground'>
												Fond :{' '}
												<span className='font-medium text-foreground'>
													{cash.activeSession.opening_float.toFixed(2)} €
												</span>
											</div>
											<DropdownMenuSeparator />
										</>
									)}
									<DropdownMenuItem onClick={cash.handleShowRapportX}>
										Rapport X
									</DropdownMenuItem>
									<DropdownMenuItem onClick={cash.handleShowMovement}>
										Mouvement
									</DropdownMenuItem>
									{extraActions}
								</DropdownMenuContent>
							</DropdownMenu>
						</>
					)}

					{/* Bouton principal — toujours visible */}
					<Button
						size='sm'
						onClick={cash.handleToggleSession}
						disabled={!cash.canToggleSession}
					>
						{cash.isSessionOpen ? 'Clôturer' : 'Ouvrir'}
					</Button>
				</>
			)}
		</div>
	)

	return (
		<ModulePageShell
			manifest={contextualManifest}
			badge={badge}
			headerLeft={headerLeft}
			centerContent={headerCenter}
			actions={actions}
			hideTitle={hideTitle}
			hideIcon={hideIcon}
		>
			{/* Dialogs session — toujours montés, contrôlés par useCashModule */}
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
