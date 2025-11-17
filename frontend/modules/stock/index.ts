// frontend/modules/cash/index.ts
import { Package } from 'lucide-react'
import type { ModuleManifest } from '../_registry'
import { StockPage } from './StockPage'

export const manifest: ModuleManifest = {
  id: "stock",
  name: "PocketStock",
  description: "Catalogue & produits",
  pole: 'commerce',
  icon: Package,
  route: "/stock",
  color: 'text-blue-600',
  iconColor: 'text-blue-600',
  enabled: true,
  minVersion: '1.0.0',
  paid: true,
  plan: 'pro',
}

export { StockPage }
