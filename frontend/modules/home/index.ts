// frontend/modules/home/index.ts
import {
	BarChart2,
	ClipboardList,
	Database,
	FileImage,
	FilePen,
	LayoutDashboard,
	Monitor,
	Package,
	Receipt,
	Settings,
	ShoppingCart,
	Users,
} from 'lucide-react'
import type { ModuleManifest } from '../_registry'

export const manifest: ModuleManifest = {
	id: 'home',
	name: 'Tableau de bord',
	description: "Vue d'ensemble des modules",
	pole: 'pilotage',
	icon: LayoutDashboard,
	route: '/',
	color: 'text-foreground',
	iconColor: 'text-white',
	enabled: false,

	sidebarMenu: [
		// ── PocketCash ──────────────────────────────────────────────────────
		{
			id: 'cash',
			label: 'PocketCash',
			icon: ShoppingCart,
			items: [
				{ label: 'Terminal de vente', to: '/cash/terminal/', icon: Monitor },
				{ label: 'Tickets', to: '/cash/tickets', icon: Receipt },
				{ label: 'Rapport Z', to: '/cash/rapport-z', icon: BarChart2 },
				{ label: 'Configuration', to: '/cash/config', icon: Settings },
			],
		},

		// ── PocketConnect ────────────────────────────────────────────────────
		{
			id: 'connect',
			label: 'PocketConnect',
			icon: Users,
			items: [
				{ label: 'Clients', to: '/connect/customers/', icon: Users },
				{ label: 'Devis', to: '/connect/quotes/', icon: FilePen },
				{ label: 'Factures', to: '/connect/invoices/', icon: Receipt },
			],
		},

		// ── PocketStock ──────────────────────────────────────────────────────
		// Route principale du module = /stock-apppos (plus /stock)
		{
			id: 'stock',
			label: 'PocketStock',
			icon: Package,
			items: [
				{ label: 'Catalogue produits', to: '/stock-apppos', icon: Database },
				{
					label: 'Inventaire physique',
					to: '/inventory-apppos',
					icon: ClipboardList,
				},
			],
		},

		// ── PocketStick ──────────────────────────────────────────────────────
		{
			id: 'stick',
			label: 'PocketStick',
			icon: FileImage,
			items: [{ label: 'Mes affiches', to: '/stick', icon: FileImage }],
		},
	],
}

export { manifest as homeDashboardManifest }
