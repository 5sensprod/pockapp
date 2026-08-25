// frontend/modules/stock/index.ts
import { Building2, ClipboardList, Package, Tags, Truck } from 'lucide-react'
import type { ModuleManifest } from '../_registry'

// `/stock` rend le catalogue PocketBase, comme `/stock/produits` : l'écran
// AppPos a été retiré le 18 août 2026, il n'avait plus de données à lui.
import { ProductsPage as StockPage } from './ProductsPage'

export const manifest: ModuleManifest = {
	id: 'stock',
	name: 'PocketStock',
	description: 'Stock & Catalogue',
	pole: 'commerce',
	icon: Package,
	route: '/stock/produits',
	color: 'text-orange-500',
	iconColor: 'text-orange-500',
	enabled: true,
	minVersion: '1.0.0',
	requiresCompany: true,
	paid: true,
	plan: 'pro',

	// /stock gardé en alias au cas où des liens internes l'utilisent encore.
	// /inventory-apppos est l'ancienne URL de l'inventaire physique : la route
	// redirige vers /stock/inventaire depuis le 19 août 2026.
	aliases: ['/stock', '/inventory-apppos'],

	sidebarMenu: [
		{
			id: 'products',
			label: 'Catalogue produits',
			icon: Package,
			items: [
				// Une seule entrée depuis le 18 août 2026 : « Catalogue produits » et
				// « Produits (PocketBase) » désignaient deux écrans sur deux bases.
				// Il n'en reste qu'un, sur PocketBase.
				{ label: 'Catalogue produits', to: '/stock/produits', icon: Package },
			],
		},
		{
			id: 'brands',
			label: 'Marques',
			icon: Building2,
			items: [{ label: 'Marques', to: '/stock/marques', icon: Building2 }],
		},
		{
			id: 'categories',
			label: 'Catégories',
			icon: Tags,
			items: [{ label: 'Catégories', to: '/stock/categories', icon: Tags }],
		},
		{
			id: 'suppliers',
			label: 'Fournisseurs',
			icon: Truck,
			items: [
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
					to: '/stock/inventaire',
					icon: ClipboardList,
				},
			],
		},
	],
}

export { StockPage }
