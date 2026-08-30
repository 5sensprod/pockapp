import { BarChart3, Coins } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import {
	findSidebarGroupByPath,
	findSidebarItemByPath,
} from '../lib/sidebar-navigation'
import type { SidebarGroup } from './_registry'

const statsGroups: SidebarGroup[] = [
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
]

describe('sélection de la route la plus précise dans la sidebar', () => {
	it('ne sélectionne pas Journal des ventes sur /stats/especes', () => {
		expect(findSidebarGroupByPath(statsGroups, '/stats/especes')?.id).toBe(
			'journal-especes',
		)
		expect(findSidebarItemByPath(statsGroups, '/stats/especes')?.item.to).toBe(
			'/stats/especes',
		)
	})

	it('conserve la section parente pour une vraie page de détail', () => {
		expect(
			findSidebarItemByPath(statsGroups, '/stats/detail/42')?.item.to,
		).toBe('/stats')
	})
})
