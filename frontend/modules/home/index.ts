// frontend/modules/home/index.ts
import {
	BarChart2,
	BarChart3,
	Building2,
	ClipboardList,
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
	Store,
	Tags,
	Truck,
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
		// Les entrées reprennent celles du module (`modules/stock/index.ts`) : la
		// barre principale doit ouvrir les mêmes écrans que la barre du module,
		// sinon des pages n'existent que pour qui est déjà dedans. `/stock-apppos`
		// figurait ici et n'existe plus depuis le 18 août 2026 — le lien était
		// mort, et avec lui le seul accès à AppStock depuis l'accueil.
		{
			id: 'stock',
			label: 'PocketStock',
			icon: Package,
			items: [
				{ label: 'Catalogue produits', to: '/stock/produits', icon: Package },
				{ label: 'Marques', to: '/stock/marques', icon: Building2 },
				{ label: 'Catégories', to: '/stock/categories', icon: Tags },
				{ label: 'Fournisseurs', to: '/stock/fournisseurs', icon: Truck },
				{
					label: 'Inventaire physique',
					to: '/stock/inventaire',
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
			items: [
				{ label: 'Catalogue en ligne', to: '/site/catalogue', icon: Store },
				{ label: 'Menu de navigation', to: '/site/menu', icon: Menu },
			],
		},

		// ── PocketStats ──────────────────────────────────────────────────
		{
			id: 'stats',
			label: 'PocketStats',
			icon: BarChart3,
			items: [{ label: 'Journal des ventes', to: '/stats', icon: BarChart3 }],
		},
	],
}

export { manifest as homeDashboardManifest }
