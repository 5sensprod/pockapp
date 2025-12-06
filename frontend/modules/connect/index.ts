// frontend/modules/connect/index.ts
import { FilePen, FilePlus2, Receipt, Users } from 'lucide-react'
import type { ModuleManifest } from '../_registry'
import { ConnectPage } from './ConnectPage'

export const manifest: ModuleManifest = {
	id: 'connect',
	name: 'PocketConnect',
	description: 'Clients & relation',
	pole: 'commerce',
	icon: Users,
	iconColor: 'text-blue-600',
	route: '/connect',
	color: 'text-blue-600',
	enabled: true,
	minVersion: '1.0.0',

	// 👉 chaque entrée du tableau = item de la première bande de menu
	sidebarMenu: [
		{
			id: 'customers',
			label: 'Clients',
			icon: Users,
			items: [
				{ label: 'Clients', to: '/connect/customers/', icon: Users }, // 1er item = liste
				{
					label: 'Nouveau client',
					to: '/connect/customers/new',
					icon: FilePlus2,
				},
			],
		},
		{
			id: 'quotes',
			label: 'Devis',
			icon: FilePen,
			items: [
				{ label: 'Devis', to: '/connect/quotes/', icon: FilePen }, // 1er item = liste
				{ label: 'Nouveau devis', to: '/connect/quotes/new', icon: FilePlus2 },
			],
		},
		{
			id: 'invoices',
			label: 'Factures',
			icon: Receipt,
			items: [
				{ label: 'Factures', to: '/connect/invoices/', icon: Receipt }, // 1er item = liste
				{
					label: 'Nouvelle facture',
					to: '/connect/invoices/new',
					icon: FilePlus2,
				},
			],
		},
	],
}

export { ConnectPage }
export { InvoicesPage } from './components/InvoicesPage'
export { InvoiceCreatePage } from './components/InvoiceCreatePage'
export { QuotesPage } from './components/QuotesPage'
export { CustomerCreatePage } from './components/CustomerCreatePage' // 👈 important pour la route
