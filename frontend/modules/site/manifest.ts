// frontend/modules/site/manifest.ts
//
// Isolé de index.ts pour éviter les imports circulaires :
// AppSitePage → manifest  ET  index → AppSitePage

import { Globe, Menu, Store } from 'lucide-react'
import type { ModuleManifest } from '../_registry'

export const manifest: ModuleManifest = {
	id: 'site',
	name: 'PocketSite',
	description: 'Pilotage du site axemusique.shop',
	pole: 'digital',
	icon: Globe,
	route: '/site',
	color: 'text-purple-600',
	iconColor: 'text-purple-600',
	enabled: true,
	minVersion: '1.0.0',

	sidebarMenu: [
		{
			id: 'navigation',
			label: 'Navigation',
			icon: Menu,
			items: [
				{
					label: 'Catalogue en ligne',
					to: '/site/catalogue',
					icon: Store,
				},
				{
					label: 'Menu de navigation',
					to: '/site/menu',
					icon: Menu,
				},
			],
		},
	],
}
