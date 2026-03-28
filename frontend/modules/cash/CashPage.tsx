// frontend/modules/cash/CashPage.tsx
//
// AVANT : 230 lignes (logique + JSX mélangés)
// APRÈS : 25 lignes — assemblage pur
//
// Responsabilité unique : brancher useCashModule() sur ModulePageShell + CashView.
// Zéro logique métier ici.

import { ModulePageShell, StatusBadge } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import { CashView } from './CashView'
import { manifest } from './manifest'
import { useCashModule } from './useCashModule'

export function CashPage() {
	const cash = useCashModule()

	return (
		<ModulePageShell
			manifest={manifest}
			badge={
				<StatusBadge
					label={cash.sessionLabel}
					variant={cash.sessionVariant}
					sublabel={cash.today}
				/>
			}
			actions={
				cash.selectedRegisterId ? (
					<div className='flex items-center gap-2'>
						{/* Sélecteur caisse */}
						<select
							className='h-7 rounded-md border bg-card px-2 text-[11px]'
							value={cash.selectedRegisterId}
							onChange={(e) => cash.setSelectedRegisterId(e.target.value)}
						>
							{cash.registers?.map((reg) => (
								<option key={reg.id} value={reg.id}>
									{reg.code ? `${reg.code} — ${reg.name}` : reg.name}
								</option>
							))}
						</select>

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

						{/* CTA principal */}
						<Button
							size='sm'
							onClick={cash.handleToggleSession}
							disabled={!cash.canToggleSession}
						>
							{cash.isSessionOpen
								? 'Clôturer la session'
								: 'Ouvrir une session'}
						</Button>
					</div>
				) : null
			}
		>
			<CashView {...cash} />
		</ModulePageShell>
	)
}
