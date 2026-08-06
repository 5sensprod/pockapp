// frontend/modules/site/index.ts
import { Globe } from 'lucide-react'
import type { ModuleManifest } from '../_registry'
import { AppSitePage } from './AppSitePage'

export const manifest: ModuleManifest = {
	id: 'site',
	name: 'PocketSite',
	description: 'Pilotage du site axemusique.shop',
	pole: 'digital',
	icon: Globe,
	route: '/site',
	color: 'text-purple-600',
	iconColor: 'text-purple-600',
	enabled: true,
	minVersion: '1.0.0',
}

export { AppSitePage }
