// frontend/modules/site/manifest.ts
//
// Isolé de index.ts pour éviter les imports circulaires :
// AppSitePage → manifest  ET  index → AppSitePage

import { Globe, History, Menu, Store } from 'lucide-react'
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
			id: 'catalogue',
			label: 'Catalogue en ligne',
			icon: Store,
			items: [
				{
					label: 'Catalogue en ligne',
					to: '/site/catalogue',
					icon: Store,
				},
			],
		},
		{
			id: 'navigation',
			label: 'Menu de navigation',
			icon: Menu,
			items: [
				{
					label: 'Menu de navigation',
					to: '/site/menu',
					icon: Menu,
				},
			],
		},
		{
			// Ramener un rangement de catalogue depuis une sauvegarde, sans
			// toucher aux ventes. Elle vit ici, et pas dans les réglages où vit
			// la sauvegarde : c'est un geste d'ORGANISATION du catalogue, pas
			// d'administration du poste — et son effet le plus visible est que
			// des fiches repartent vers le site.
			id: 'restauration',
			label: 'Restauration sélective',
			icon: History,
			items: [
				{
					label: 'Restauration sélective',
					to: '/site/restauration',
					icon: History,
				},
			],
		},
	],
}
