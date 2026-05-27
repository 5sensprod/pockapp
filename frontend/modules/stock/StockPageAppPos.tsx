// frontend/modules/stock/StockPageAppPos.tsx

import { ModulePageShell, StatusBadge } from '@/components/module-ui'
import { StockView } from './StockView'
import { manifest } from './index'
import { useStockModule } from './useStockModule'

export function StockPageAppPos() {
	const stock = useStockModule()

	return (
		<ModulePageShell
			manifest={manifest}
			badge={
				!stock.isConnecting ? (
					<StatusBadge
						label={stock.isAppPosConnected ? 'AppPOS connecté' : 'Déconnecté'}
						variant={stock.isAppPosConnected ? 'open' : 'error'}
						sublabel='http://localhost:3000'
					/>
				) : undefined
			}
		>
			<StockView {...stock} />
		</ModulePageShell>
	)
}
