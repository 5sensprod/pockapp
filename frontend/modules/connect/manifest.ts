// frontend/modules/connect/manifest.ts
//
// Isolé de index.ts pour éviter les imports circulaires :
// ConnectModuleShell → manifest  ET  index → ConnectModuleShell
//
// Même pattern que frontend/modules/cash/manifest.ts

import { ClipboardList, FilePen, Receipt, Users } from 'lucide-react'
import type { ModuleManifest } from '../_registry'

export const manifest: ModuleManifest = {
	id: 'connect',
	name: 'PocketConnect',
	description: 'Clients & Factures',
	pole: 'commerce',
	icon: Users,
	iconColor: 'text-blue-600',
	route: '/connect',
	color: 'text-blue-600',
	enabled: true,
	minVersion: '1.0.0',
	requiresCompany: true,

	sidebarMenu: [
		{
			id: 'customers',
			label: 'Clients',
			icon: Users,
			items: [{ label: 'Clients', to: '/connect/customers/', icon: Users }],
		},
		{
			id: 'quotes',
			label: 'Devis',
			icon: FilePen,
			items: [{ label: 'Devis', to: '/connect/quotes/', icon: FilePen }],
		},
		{
			id: 'orders',
			label: 'Commandes',
			icon: ClipboardList,
			items: [
				{
					label: 'Bons de commande',
					to: '/connect/orders/',
					icon: ClipboardList,
				},
			],
		},
		{
			id: 'invoices',
			label: 'Factures',
			icon: Receipt,
			items: [{ label: 'Factures', to: '/connect/invoices/', icon: Receipt }],
		},
	],
}
