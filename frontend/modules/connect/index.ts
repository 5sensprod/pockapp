// frontend/modules/connect/index.ts
import { FilePlus2, FileText, Users } from 'lucide-react'
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
	sidebarMenu: [
		{
			id: 'crm',
			label: 'Relation client',
			icon: Users,
			items: [
				{
					label: 'Clients',
					to: '/connect',
					icon: Users,
				},
				{
					label: 'Nouvelle facture',
					to: '/connect/invoices/new',
					icon: FilePlus2,
				},
				{
					label: 'Factures',
					to: '/connect/invoices',
					icon: FileText,
				},
			],
		},
	],
}

export { ConnectPage }
export { InvoicesPage } from './components/InvoicesPage'
export { InvoiceCreatePage } from './components/InvoiceCreatePage'
