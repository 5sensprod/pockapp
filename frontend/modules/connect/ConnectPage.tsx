// frontend/modules/connect/ConnectPage.tsx

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
