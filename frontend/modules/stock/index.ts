// frontend/modules/stock/index.ts
import {
	Building2,
	ClipboardList,
	Database,
	Package,
	Tags,
	Truck,
} from 'lucide-react'
import type { ModuleManifest } from '../_registry'

import { StockPageAppPos as StockPage } from './StockPageAppPos'

export const manifest: ModuleManifest = {
	id: 'stock',
	name: 'PocketStock',
	description: 'Stock & Catalogue',
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
				// Première entité branchée sur PocketBase (13 août 2026). Entrée
				// distincte, et non un onglet du catalogue produits : celui-ci lit
				// AppPos, et mélanger les deux dans un même écran est précisément ce
				// que la migration doit défaire.
				{
					label: 'Produits (PocketBase)',
					to: '/stock/produits',
					icon: Package,
				},
				{ label: 'Marques', to: '/stock/marques', icon: Building2 },
				{ label: 'Catégories', to: '/stock/categories', icon: Tags },
				{ label: 'Fournisseurs', to: '/stock/fournisseurs', icon: Truck },
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
