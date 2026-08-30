// frontend/modules/stats/index.ts
import { BarChart3, Coins } from 'lucide-react'
import type { ModuleManifest } from '../_registry'
import { JournalDesEspecesPage } from './JournalDesEspecesPage'
import { JournalDesVentesPage } from './JournalDesVentesPage'
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
			id: 'journal-especes',
			label: 'Journal des espèces',
			icon: Coins,
			items: [
				{ label: 'Journal des espèces', to: '/stats/especes', icon: Coins },
			],
		},
	],
}

export { StatsPage, JournalDesVentesPage, JournalDesEspecesPage }
export * from './useJournalDesVentes'
export * from './useJournalDesEspeces'
