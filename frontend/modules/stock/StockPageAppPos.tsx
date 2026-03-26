// frontend/modules/stock/StockPageAppPos.tsx
//
// AVANT : ~280 lignes (logique + JSX mélangés, bouton Inventaire hardcodé)
// APRÈS : ~25 lignes — assemblage pur
//
// Le bouton Inventaire est retiré → désormais dans le sidebarMenu (index.ts)
// Le badge "Connecté / AppPOS" est passé en badge du ModulePageShell

import { ModulePageShell, StatusBadge } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
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
			actions={
				stock.isAppPosConnected ? (
					<Button
						variant='outline'
						size='sm'
						onClick={stock.handleRefresh}
						className='gap-2'
					>
						<RefreshCw className='h-4 w-4' />
						Rafraîchir
					</Button>
				) : undefined
			}
		>
			<StockView {...stock} />
		</ModulePageShell>
	)
}
