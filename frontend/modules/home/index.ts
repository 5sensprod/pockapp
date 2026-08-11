// frontend/modules/home/index.ts
import {
	BarChart2,
	ClipboardList,
	Database,
	FileImage,
	FilePen,
	Globe,
	LayoutDashboard,
	Menu,
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
	name: 'Pocket App',
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
				{
					label: 'Bons de commande',
					to: '/connect/orders/',
					icon: ClipboardList,
				}, // ← ajouter
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

		// ── PocketSite ───────────────────────────────────────────────────
		{
			id: 'site',
			label: 'PocketSite',
			icon: Globe,
			items: [{ label: 'Menu de navigation', to: '/site/', icon: Menu }],
		},
	],
}

export { manifest as homeDashboardManifest }
