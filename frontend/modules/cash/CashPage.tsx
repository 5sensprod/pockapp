// frontend/modules/cash/CashPage.tsx
//
// Responsabilité unique : brancher CashModuleShell sur CashView.
// Zéro logique métier, zéro dialogs — tout est dans CashModuleShell.

import { CashModuleShell } from './CashModuleShell'
import { CashView } from './CashView'
import { useCashModule } from './useCashModule'

export function CashPage() {
	const cash = useCashModule()

	return (
		<CashModuleShell>
			<CashView {...cash} />
		</CashModuleShell>
	)
}
