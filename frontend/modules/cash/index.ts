import {
	BarChart2,
	Monitor,
	Receipt,
	Settings,
	ShoppingCart,
} from 'lucide-react'
import type { ModuleManifest } from '../_registry'
import { CashPage } from './CashPage'

export const manifest: ModuleManifest = {
	id: 'cash',
	name: 'PocketCash',
	description: 'Caisse & facturation',
	pole: 'commerce',
	icon: ShoppingCart,
	route: '/cash',
	color: 'text-blue-600',
	iconColor: 'text-blue-600',
	enabled: true,
	minVersion: '1.0.0',
	paid: true,
	plan: 'pro',
	sidebarMenu: [
		{
			id: 'terminal',
			label: 'Terminal',
			icon: Monitor,
			items: [
				{ label: 'Terminal de vente', to: '/cash/terminal/', icon: Monitor }, // ✅ avec slash final
			],
		},
		{
			id: 'tickets',
			label: 'Tickets',
			icon: Receipt,
			items: [{ label: 'Tickets', to: '/cash/tickets', icon: Receipt }],
		},
		{
			id: 'rapport',
			label: 'Rapports',
			icon: BarChart2,
			items: [{ label: 'Rapport Z', to: '/cash/rapport-z', icon: BarChart2 }],
		},
		{
			id: 'config',
			label: 'Configuration',
			icon: Settings,
			items: [{ label: 'Configuration caisse', to: '/cash', icon: Settings }],
		},
	],
}

export { CashPage }
export * from './CashTerminalPage'
