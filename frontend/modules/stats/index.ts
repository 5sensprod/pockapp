// frontend/modules/stats/index.ts
import { BarChart3, Coins, PieChart } from 'lucide-react'
import type { ModuleManifest } from '../_registry'
import { JournalDesEspecesPage } from './JournalDesEspecesPage'
import { JournalDesVentesPage } from './JournalDesVentesPage'
import ReportsPage from './reports/ReportsPage'
import { StatsPage } from './StatsPage'

export const manifest: ModuleManifest = {
	id: 'stats',
	name: 'PocketStats',
	description: 'Journal des ventes — ce qui est entré en caisse, jour par jour',
	pole: 'pilotage',
	icon: BarChart3,
	route: '/stats',
	color: 'text-blue-600',
	iconColor: 'text-blue-600',
	enabled: true,
	minVersion: '1.0.0',
	paid: true,
	plan: 'pro',

	sidebarMenu: [
		{
			id: 'journal-ventes',
			label: 'Journal des ventes',
			icon: BarChart3,
			items: [{ label: 'Journal des ventes', to: '/stats', icon: BarChart3 }],
		},
		{
			id: 'rapports-stock',
			label: 'Rapports de stock',
			icon: PieChart,
			items: [
				{ label: 'Rapports de stock', to: '/stats/rapports', icon: PieChart },
			],
		},
		{
			id: 'journal-especes',
			label: 'Journal des espèces',
			icon: Coins,
			items: [
				{ label: 'Journal des espèces', to: '/stats/especes', icon: Coins },
			],
		},
	],
}

export { StatsPage, JournalDesVentesPage, JournalDesEspecesPage, ReportsPage }
export * from './useJournalDesVentes'
export * from './useJournalDesEspeces'
