// frontend/modules/cash/CashPage.tsx
//
// Responsabilité unique : brancher CashModuleShell sur CashView.
// Zéro logique métier, zéro dialogs — tout est dans CashModuleShell.

import { Settings } from 'lucide-react'
import { CashModuleShell } from './CashModuleShell'
import { CashView } from './CashView'
import { useCashModule } from './useCashModule'

export function CashPage() {
	const cash = useCashModule()

	return (
		<CashModuleShell pageTitle='Configuration' pageIcon={Settings}>
			<CashView {...cash} />
		</CashModuleShell>
	)
}
