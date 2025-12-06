// frontend/modules/_registry.ts
import type { LucideIcon } from 'lucide-react'

export interface TopbarMenuItem {
	label: string
	to: string
	icon?: LucideIcon
}

export interface SidebarMenuItem {
	label: string
	to: string
	icon?: LucideIcon
}

export interface SidebarGroup {
	id: string
	label: string
	icon: LucideIcon
	items: SidebarMenuItem[]
}

export type PoleId = 'commerce' | 'digital' | 'pilotage'

export interface ModuleManifest {
	id: string
	name: string
	description: string
	pole: PoleId
	icon: LucideIcon
	route: string
	color: string
	iconColor: string
	enabled?: boolean
	minVersion?: string
	topbarMenu?: TopbarMenuItem[]
	sidebarMenu?: SidebarGroup[]

	// pour la monétisation plus tard
	paid?: boolean
	plan?: 'free' | 'pro' | 'enterprise'
	// 🆕 module utilisable uniquement si une entreprise est sélectionnée
	requiresCompany?: boolean
}

// Import auto de tous les manifests des modules
const moduleImports = import.meta.glob<{ manifest: ModuleManifest }>(
	'./*/index.ts',
	{ eager: true },
)

export const allModules: ModuleManifest[] = Object.values(moduleImports)
	.map((mod) => mod?.manifest)
	.filter((m): m is ModuleManifest => Boolean(m))

export const activeModules = allModules.filter((m) => m.enabled !== false)

export const modulesByPole = activeModules.reduce(
	(acc, mod) => {
		if (!acc[mod.pole]) {
			acc[mod.pole] = []
		}
		acc[mod.pole].push(mod)
		return acc
	},
	{} as Record<PoleId, ModuleManifest[]>,
)
export const getModule = (id: string) => allModules.find((m) => m.id === id)

export const getPoleModules = (pole: PoleId) => modulesByPole[pole] || []

export const poles = [
	{
		id: 'commerce' as const,
		name: 'Commerce',
		color: 'bg-blue-500/10 text-blue-600',
		modules: modulesByPole.commerce || [],
	},
	{
		id: 'digital' as const,
		name: 'Digital',
		color: 'bg-purple-500/10 text-purple-600',
		modules: modulesByPole.digital || [],
	},
	{
		id: 'pilotage' as const,
		name: 'Pilotage',
		color: 'bg-emerald-500/10 text-emerald-600',
		modules: modulesByPole.pilotage || [],
	},
]
