// frontend/modules/stick/index.ts
import { FileImage, Image, LayoutTemplate, Sparkles } from 'lucide-react'
import type { ModuleManifest } from '../_registry'
import { StickPage } from './StickPage'

export const manifest: ModuleManifest = {
	id: 'stick',
	name: 'PocketStick',
	description: 'Affiches & visuels',
	pole: 'digital',
	icon: Image,
	route: '/stick',
	color: 'text-purple-600',
	iconColor: 'text-purple-600',
	enabled: true,
	minVersion: '1.0.0',
	paid: true,
	plan: 'pro',

	// 1 item par groupe → rail d'icônes seul, pas de panneau coulissant
	// Les sections sont prêtes à accueillir les vraies routes quand elles arrivent
	sidebarMenu: [
		{
			id: 'affiches',
			label: 'Affiches',
			icon: FileImage,
			items: [{ label: 'Mes affiches', to: '/stick', icon: FileImage }],
		},
		{
			id: 'templates',
			label: 'Templates',
			icon: LayoutTemplate,
			items: [
				{ label: 'Templates', to: '/stick/templates', icon: LayoutTemplate },
			],
		},
		{
			id: 'generation',
			label: 'Génération IA',
			icon: Sparkles,
			items: [
				{ label: 'Génération IA', to: '/stick/generation', icon: Sparkles },
			],
		},
	],
}

export { StickPage }
