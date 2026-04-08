// frontend/modules/connect/ConnectPage.tsx
//
// Migré sur ConnectModuleShell — même pattern que les pages cash.
// Le shell gère : badge entreprise, CTA "Nouveau client", manifest.
// La page se concentre sur : données + vue.

import { ConnectModuleShell } from './ConnectModuleShell'
import { ConnectView } from './ConnectView'
import { useConnectModule } from './useConnectModule'

export function ConnectPage() {
	const connect = useConnectModule()

	return (
		<ConnectModuleShell>
			<ConnectView {...connect} />
		</ConnectModuleShell>
	)
}
