// frontend/modules/stock/index.ts
import { Package } from 'lucide-react'
import type { ModuleManifest } from '../_registry'

// ✅ Import de la version AppPOS au lieu de PocketBase
import { StockPageAppPos as StockPage } from './StockPageAppPos'

export const manifest: ModuleManifest = {
	id: 'stock',
	name: 'PocketStock',
	description: 'Catalogue & produits',
	pole: 'commerce',
	icon: Package,
	route: '/stock',
	color: 'text-blue-600',
	iconColor: 'text-blue-600',
	enabled: true,
	minVersion: '1.0.0',
	requiresCompany: true,
	paid: true,
	plan: 'pro',
}

export { StockPage }
