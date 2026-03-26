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
import { manifest } from './index'
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
					<Button
						size='sm'
						onClick={cash.handleToggleSession}
						disabled={!cash.canToggleSession}
					>
						{cash.isSessionOpen ? 'Clôturer la session' : 'Ouvrir la session'}
					</Button>
				) : null
			}
		>
			<CashView {...cash} />
		</ModulePageShell>
	)
}
