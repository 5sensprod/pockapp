// frontend/modules/connect/index.ts
import { FilePen, Receipt, Users } from 'lucide-react'
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
	requiresCompany: true,

	// 1 item par groupe → rail d'icônes seul, pas de panneau coulissant
	// Le bouton "Nouveau" est dans chaque page, pas dans la sidebar
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
			id: 'invoices',
			label: 'Factures',
			icon: Receipt,
			items: [{ label: 'Factures', to: '/connect/invoices/', icon: Receipt }],
		},
	],
}

export { ConnectPage }
export { InvoicesPage } from './components/InvoicesPage'
export { InvoiceCreatePage } from './components/InvoiceCreatePage'
export { QuotesPage } from './components/QuotesPage'
export { CustomerCreatePage } from './components/CustomerCreatePage'
