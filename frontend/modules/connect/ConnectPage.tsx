// frontend/modules/connect/ConnectPage.tsx
//
// AVANT : 80 lignes (logique + JSX mélangés)
// APRÈS : ~20 lignes — assemblage pur

import { ModulePageShell } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import { ConnectView } from './ConnectView'
import { manifest } from './index'
import { useConnectModule } from './useConnectModule'

export function ConnectPage() {
	const connect = useConnectModule()

	return (
		<ModulePageShell
			manifest={manifest}
			actions={
				<Button size='sm' onClick={connect.handleNewCustomer}>
					Nouveau client
				</Button>
			}
		>
			<ConnectView {...connect} />
		</ModulePageShell>
	)
}
