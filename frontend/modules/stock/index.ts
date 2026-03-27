// frontend/modules/stock/index.ts
import { ClipboardList, Database, Package } from 'lucide-react'
import type { ModuleManifest } from '../_registry'

import { StockPageAppPos as StockPage } from './StockPageAppPos'

export const manifest: ModuleManifest = {
	id: 'stock',
	name: 'PocketStock',
	description: 'Catalogue & produits',
	pole: 'commerce',
	icon: Package,
	route: '/stock-apppos', // ← route principale corrigée
	color: 'text-orange-500',
	iconColor: 'text-orange-500',
	enabled: true,
	minVersion: '1.0.0',
	requiresCompany: true,
	paid: true,
	plan: 'pro',

	// /stock gardé en alias au cas où des liens internes l'utilisent encore
	// /inventory-apppos reste alias pour l'inventaire physique
	aliases: ['/stock', '/inventory-apppos'],

	sidebarMenu: [
		{
			id: 'stock',
			label: 'Stock',
			icon: Database,
			items: [
				{ label: 'Catalogue produits', to: '/stock-apppos', icon: Database },
			],
		},
		{
			id: 'inventory',
			label: 'Inventaire',
			icon: ClipboardList,
			items: [
				{
					label: 'Inventaire physique',
					to: '/inventory-apppos',
					icon: ClipboardList,
				},
			],
		},
	],
}

export { StockPage }
