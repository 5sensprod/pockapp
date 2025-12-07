// frontend/modules/cash/index.ts
import { ShoppingCart } from 'lucide-react'
import type { ModuleManifest } from '../_registry'
import { CashPage } from './CashPage'

export const manifest: ModuleManifest = {
	id: 'cash',
	name: 'PocketCash',
	description: 'Caisse & facturation',
	pole: 'commerce',
	icon: ShoppingCart,
	route: '/cash',
	color: 'text-blue-600',
	iconColor: 'text-blue-600',
	enabled: true,
	minVersion: '1.0.0',
	paid: true,
	plan: 'pro',
}

export { CashPage }
export * from './CashTerminalPage'
