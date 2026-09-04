// frontend/components/layout/Sidebar.tsx
//
// Navigation UNIQUE de l'application — 4 septembre 2026.
//
// Il n'y a plus qu'un seul menu. Avant, la barre changeait de contenu selon
// qu'on était sur l'accueil ou dans un module : un rail d'icônes propre au
// module, un panneau par groupe, PLUS un bouton « Tous les modules » qui
// ouvrait un second panneau par-dessus. Deux navigations concurrentes pour un
// même écran, et rien qui dise où l'on se trouve. Le rail et le panneau de
// module sont supprimés : la barre affiche TOUJOURS l'arbre complet
// (`homeDashboardManifest.sidebarMenu`), quelle que soit la page.
//
// Elle est ouverte par défaut, ses groupes dépliés, et l'utilisateur seul la
// ferme — l'état est tenu par `layout.tsx` et persisté (`localStorage`).
//
// Elle SURVOLE toujours le contenu : ouvrir ou fermer le menu ne déplace pas
// la page (aucune marge, aucune transition dans `layout.tsx`).
//
// Modes (useBreakpoint) :
//   mobile  (<768px)   → non rendue, BottomNav prend le relais
//   tablet  (768–1023) → backdrop, et refermeture après un saut
//   desktop (≥1024px)  → pas de backdrop, elle reste ouverte
//
// Tokens : bg-panel, bg-panel-header, bg-panel-item-active, text-panel-*,
//          w-panel, h-header (tailwind.config.cjs)

import { useBreakpoint } from '@/lib/hooks/useBreakpoint'
import {
	findSidebarGroupByPath,
	findSidebarItemByPath,
} from '@/lib/sidebar-navigation'
import { getLastRouteForModule } from '@/lib/stores/moduleNavigationStore'
import { navigationActions } from '@/lib/stores/navigationStore'
import { cn } from '@/lib/utils'
import { type SidebarGroup, getModule } from '@/modules/_registry'
import { homeDashboardManifest } from '@/modules/home'
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { ChevronDown, X } from 'lucide-react'
import * as React from 'react'

const normalizePath = (path: string) => (path || '/').replace(/\/+$/, '') || '/'

const SIDEBAR_TINT_BY_ICON_COLOR: Record<string, string> = {
	'text-blue-600': 'bg-blue-500/10',
	'text-orange-500': 'bg-orange-500/10',
	'text-purple-600': 'bg-purple-500/10',
	'text-emerald-600': 'bg-emerald-500/10',
}

function getModuleSidebarAccent(moduleId: string) {
	const module = getModule(moduleId)
	const text = module?.iconColor ?? module?.color ?? 'text-panel-item-icon'
	return {
		text,
		background: SIDEBAR_TINT_BY_ICON_COLOR[text] ?? 'bg-panel-item-active',
	}
}

interface SidebarProps {
	open: boolean
	onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
	const { pathname } = useLocation()
	const navigate = useNavigate()
	const router = useRouter()
	const { isMobile, isTablet } = useBreakpoint()

	// Groupes dépliés par défaut : la barre est assez haute pour tout montrer,
	// et un item visible vaut mieux qu'un item à chercher. Replier reste
	// possible, groupe par groupe.
	const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set())

	const groups = homeDashboardManifest.sidebarMenu || []
	const normPath = normalizePath(pathname)

	// ── Mobile : rien — BottomNav prend le relais ──────────────────────────
	if (isMobile || !groups.length || !open) return null

	const activeItem = findSidebarItemByPath(groups, normPath)?.item
	const activeGroupId = findSidebarGroupByPath(groups, normPath)?.id ?? null

	// Restaure la dernière page visitée DANS la section visée (ex : la fiche
	// client ouverte plutôt que la liste), sous réserve qu'elle désigne bien
	// le même item de menu.
	const handleNavigate = (itemTo: string, moduleId: string) => {
		navigationActions.clear()
		const sectionKey = `${moduleId}:${normalizePath(itemTo)}`
		const lastRoute = getLastRouteForModule(sectionKey)
		const targetItem = findSidebarItemByPath(groups, itemTo)?.item
		const lastRouteItem = lastRoute
			? findSidebarItemByPath(groups, lastRoute)?.item
			: undefined
		if (lastRoute && targetItem === lastRouteItem) {
			router.navigate({ to: lastRoute as any })
		} else {
			navigate({ to: itemTo as any })
		}
		// Sur tablette la barre survole le contenu : elle se referme après le saut.
		if (isTablet) onClose()
	}

	const toggleGroup = (groupId: string) =>
		setCollapsed((prev) => {
			const next = new Set(prev)
			if (next.has(groupId)) next.delete(groupId)
			else next.add(groupId)
			return next
		})

	return (
		<>
			{/* ── Backdrop tablette — ferme la barre au clic extérieur ─────────── */}
			{isTablet && (
				<div
					className='fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]'
					style={{ top: 'var(--header-h)' }}
					onClick={onClose}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault()
							onClose()
						}
					}}
					aria-hidden='true'
				/>
			)}

			<nav
				className='fixed left-0 bottom-0 z-50 w-panel bg-panel flex flex-col shadow-2xl'
				style={{ top: 'var(--header-h)' }}
				aria-label='Navigation principale'
			>
				<div className='h-header px-4 bg-panel-header flex items-center justify-between shrink-0'>
					<span className='text-[10px] uppercase tracking-widest font-bold text-panel-item-icon'>
						Tous les modules
					</span>
					<button
						type='button'
						onClick={onClose}
						className='rounded-md p-1.5 hover:bg-panel-item-active transition-colors'
						title='Fermer le menu'
					>
						<X className='h-4 w-4 text-panel-close-btn' />
					</button>
				</div>

				<div className='flex-1 overflow-y-auto p-2'>
					{groups.map((group: SidebarGroup) => {
						const GroupIcon = group.icon
						const isOpen = !collapsed.has(group.id)
						const isCurrent = group.id === activeGroupId
						const accent = getModuleSidebarAccent(group.id)

						return (
							<div key={group.id} className='mb-1'>
								<button
									type='button'
									onClick={() => toggleGroup(group.id)}
									className={cn(
										'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
										isCurrent
											? `${accent.background} ${accent.text}`
											: 'text-panel-item-text hover:bg-panel-header',
									)}
									aria-expanded={isOpen}
								>
									<GroupIcon className={cn('h-4 w-4 shrink-0', accent.text)} />
									<span className='flex-1 text-left'>{group.label}</span>
									<ChevronDown
										className={cn(
											'h-4 w-4 shrink-0 transition-transform duration-150',
											isOpen && 'rotate-180',
										)}
									/>
								</button>

								{isOpen && group.items?.length > 0 && (
									<div
										className={cn(
											'ml-4 mt-0.5 mb-1 border-l border-current/20 pl-3 flex flex-col gap-0.5',
											accent.text,
										)}
									>
										{group.items.map((item) => {
											const ItemIcon = item.icon
											const isActive = item === activeItem
											return (
												<button
													key={item.to}
													type='button'
													onClick={() => handleNavigate(item.to, group.id)}
													className={cn(
														'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors',
														isActive
															? `${accent.background} ${accent.text} font-semibold`
															: 'text-panel-item-icon hover:bg-panel-header hover:text-panel-item-text',
													)}
												>
													{ItemIcon && (
														<ItemIcon className='h-3.5 w-3.5 shrink-0' />
													)}
													<span>{item.label}</span>
												</button>
											)
										})}
									</div>
								)}
							</div>
						)
					})}
				</div>
			</nav>
		</>
	)
}
