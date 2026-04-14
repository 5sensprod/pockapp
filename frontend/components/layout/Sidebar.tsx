// frontend/components/layout/Sidebar.tsx
//
// Sidebar responsive — 3 modes pilotés par useBreakpoint() :
//
//   mobile  (<768px)   → composant non rendu (null)
//                         la navigation est assurée par BottomNav
//   tablet  (768–1023) → rail visible + panel en OVERLAY (backdrop, pas de push)
//   desktop (≥1024px)  → rail visible + panel PUSH (comportement actuel)
//
// Tokens utilisés (définis dans tailwind.config.cjs) :
//   bg-rail              → #283044 (fond rail)
//   bg-rail-active       → bg icône sélectionnée
//   bg-rail-hover        → bg icône au survol
//   text-rail-icon       → icône inactive
//   text-rail-icon-active → icône active
//   bg-rail-separator    → séparateur rail
//   bg-panel             → fond panneau
//   bg-panel-header      → header panneau
//   bg-panel-item-active → item sélectionné
//   text-panel-item-text → texte item
//   text-panel-item-icon → icône item
//   w-rail / h-header    → dimensions tokenisées
//
// Props (inchangées pour compatibilité avec Layout.tsx) :
//   currentModule, activeGroup, onToggleGroup, onClosePanel, onHomePanelChange

import { useBreakpoint } from '@/lib/hooks/useBreakpoint'
import { getLastRouteForModule } from '@/lib/stores/moduleNavigationStore'
import { navigationActions } from '@/lib/stores/navigationStore'
import { cn } from '@/lib/utils'
import type { ModuleManifest, SidebarGroup } from '@/modules/_registry'
import { homeDashboardManifest } from '@/modules/home'
import {
	Link,
	useLocation,
	useNavigate,
	useRouter,
} from '@tanstack/react-router'
import { LayoutDashboard, X } from 'lucide-react'
import * as React from 'react'

const normalizePath = (path: string) => (path || '/').replace(/\/+$/, '') || '/'

interface SidebarProps {
	currentModule: ModuleManifest | null
	activeGroup: string | null
	onToggleGroup: (groupId: string) => void
	onClosePanel: () => void
	onHomePanelChange?: (open: boolean) => void
}

export function Sidebar({
	currentModule,
	activeGroup,
	onToggleGroup,
	onClosePanel,
	onHomePanelChange,
}: SidebarProps) {
	const { pathname } = useLocation()
	const navigate = useNavigate()
	const router = useRouter()
	const { isMobile, isTablet } = useBreakpoint()

	const [homePanel, setHomePanel] = React.useState(false)

	const setHomePanelWithNotify = React.useCallback(
		(val: boolean | ((v: boolean) => boolean)) => {
			setHomePanel((prev) => {
				const next = typeof val === 'function' ? val(prev) : val
				onHomePanelChange?.(next)
				return next
			})
		},
		[onHomePanelChange],
	)

	const isHomePage = pathname === '/'
	const sidebarMenu = currentModule?.sidebarMenu || []
	const homeSidebarMenu = homeDashboardManifest.sidebarMenu || []

	// ── Mobile : on ne rend rien — BottomNav prend le relais ───────────────
	if (isMobile || !sidebarMenu.length) return null

	const normPath = normalizePath(pathname)
	const activeGroupData = sidebarMenu.find((g) => g.id === activeGroup) || null

	const groupMatchesUrl = (group: SidebarGroup): boolean =>
		!!group.items?.some((item) => {
			const t = normalizePath(item.to)
			return normPath === t || normPath.startsWith(t)
		})

	// Navigue vers un item de la sidebar.
	// Consulte la clé de section (moduleId:sectionPath) pour restaurer
	// la dernière page visitée dans cette section (ex: fiche client).
	// Si aucune lastRoute pour cette section → navigue vers la liste (itemTo).
	const handleSidebarNavigate = (itemTo: string) => {
		navigationActions.clear()
		if (currentModule?.id) {
			const sectionKey = `${currentModule.id}:${normalizePath(itemTo)}`
			const lastRoute = getLastRouteForModule(sectionKey)
			if (lastRoute?.startsWith(normalizePath(itemTo))) {
				router.navigate({ to: lastRoute as any })
				return
			}
		}
		navigate({ to: itemTo as any })
	}

	const handleGroupClick = (group: SidebarGroup) => {
		setHomePanelWithNotify(false)
		onToggleGroup(group.id)
		if (group.items?.length === 1) {
			handleSidebarNavigate(group.items[0].to)
		}
	}

	const handleHomePanelToggle = () => {
		if (activeGroup) onClosePanel()
		setHomePanelWithNotify((v) => !v)
	}

	const showHomePanel = homePanel && !isHomePage
	const showModulePanel =
		!showHomePanel &&
		activeGroupData !== null &&
		(activeGroupData.items?.length ?? 0) > 1

	const panelIsOverlay = isTablet

	const handleClose = () => {
		onClosePanel()
		setHomePanelWithNotify(false)
	}

	return (
		<>
			{/* ── Backdrop tablette — ferme le panel au clic extérieur ─────────── */}
			{panelIsOverlay && (showModulePanel || showHomePanel) && (
				<div
					className='fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]'
					style={{ top: 'var(--header-h)' }}
					onClick={handleClose}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault()
							handleClose()
						}
					}}
					aria-hidden='true'
				/>
			)}

			<div
				className='fixed left-0 bottom-0 flex z-50'
				style={{ top: 'var(--header-h)' }}
			>
				{/* ── Rail ───────────────────────────────────────────────────────── */}
				<div className='w-rail bg-rail flex flex-col items-center py-3 shrink-0'>
					{/* Icône home — hors home page */}
					{!isHomePage && (
						<>
							<button
								type='button'
								onClick={handleHomePanelToggle}
								title='Tous les modules'
								className={cn(
									'relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 mb-1',
									showHomePanel
										? 'text-rail-icon-active bg-rail-active'
										: 'text-rail-icon hover:text-rail-icon-active hover:bg-rail-hover',
								)}
							>
								<LayoutDashboard className='h-4 w-4' />
								{showHomePanel && (
									<span className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-rail-indicator' />
								)}
							</button>
							<div className='w-6 h-px bg-rail-separator mb-2 shrink-0' />
						</>
					)}

					{/* Icônes module */}
					<div className='flex flex-col items-center gap-1 flex-1'>
						{sidebarMenu.map((group) => {
							const Icon = group.icon
							const isActive =
								!showHomePanel &&
								(activeGroup === group.id || groupMatchesUrl(group))

							return (
								<button
									key={group.id}
									type='button'
									onClick={() => handleGroupClick(group)}
									title={
										group.items?.length === 1
											? group.items[0].label
											: group.label
									}
									className={cn(
										'relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150',
										isActive
											? 'text-rail-icon-active bg-rail-active'
											: 'text-rail-icon hover:text-rail-icon-active hover:bg-rail-hover',
									)}
								>
									<Icon className='h-5 w-5' />
									{isActive && (
										<span className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-rail-indicator' />
									)}
								</button>
							)
						})}
					</div>
				</div>

				{/* ── Panel module ─────────────────────────────────────────────── */}
				{showModulePanel && activeGroupData && (
					<ModulePanel
						group={activeGroupData}
						normPath={normPath}
						moduleId={currentModule?.id}
						onClose={onClosePanel}
						onNavigate={handleSidebarNavigate}
					/>
				)}

				{/* ── Panel home global ────────────────────────────────────────── */}
				{showHomePanel && (
					<HomePanel
						groups={homeSidebarMenu}
						normPath={normPath}
						onClose={() => setHomePanelWithNotify(false)}
						onNavigate={() => {
							navigationActions.clear()
							setHomePanelWithNotify(false)
						}}
					/>
				)}
			</div>
		</>
	)
}

// ── Panneau d'un groupe module ────────────────────────────────────────────────
function ModulePanel({
	group,
	normPath,
	// moduleId,
	onClose,
	onNavigate,
}: {
	group: SidebarGroup
	normPath: string
	moduleId: string | undefined
	onClose: () => void
	onNavigate: (itemTo: string) => void
}) {
	return (
		<div className='w-panel bg-panel flex flex-col shadow-2xl'>
			<div className='h-header px-4 bg-panel-header flex items-center justify-between shrink-0'>
				<h2 className='text-sm font-semibold text-panel-header-text'>
					{group.label}
				</h2>
				<button
					type='button'
					onClick={onClose}
					className='rounded-md p-1.5 hover:bg-panel-item-active transition-colors'
					title='Fermer'
				>
					<X className='h-4 w-4 text-panel-close-btn' />
				</button>
			</div>

			<nav className='flex-1 overflow-y-auto p-2'>
				{group.items?.map((item) => {
					const ItemIcon = item.icon
					const t = normalizePath(item.to)
					const isActive = normPath === t || normPath.startsWith(t)
					return (
						<button
							key={item.to}
							type='button'
							onClick={() => onNavigate(item.to)}
							className={cn(
								'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
								isActive
									? 'bg-panel-item-active text-foreground font-semibold'
									: 'text-panel-item-text hover:bg-panel-header',
							)}
						>
							{ItemIcon && (
								<ItemIcon
									className={cn(
										'h-4 w-4 shrink-0',
										isActive ? 'text-foreground' : 'text-panel-item-icon',
									)}
								/>
							)}
							<span>{item.label}</span>
						</button>
					)
				})}
			</nav>
		</div>
	)
}

// ── Panneau home global ───────────────────────────────────────────────────────
function HomePanel({
	groups,
	normPath,
	onClose,
	onNavigate,
}: {
	groups: SidebarGroup[]
	normPath: string
	onClose: () => void
	onNavigate: () => void
}) {
	return (
		<div className='w-panel bg-panel flex flex-col shadow-2xl'>
			<div className='h-header px-4 bg-panel-header flex items-center justify-between shrink-0'>
				<span className='text-[10px] uppercase tracking-widest font-bold text-panel-item-icon'>
					Tous les modules
				</span>
				<button
					type='button'
					onClick={onClose}
					className='rounded-md p-1.5 hover:bg-panel-item-active transition-colors'
					title='Fermer'
				>
					<X className='h-4 w-4 text-panel-close-btn' />
				</button>
			</div>

			<nav className='flex-1 overflow-y-auto p-2'>
				{groups.map((group) => {
					const GroupIcon = group.icon
					const mainRoute = group.items?.[0]?.to ?? '/'
					const isModuleActive =
						group.items?.some((item) => {
							const t = normalizePath(item.to)
							return normPath === t || normPath.startsWith(t)
						}) ?? false

					return (
						<div key={group.id} className='mb-1'>
							<Link
								to={mainRoute as any}
								onClick={onNavigate}
								className={cn(
									'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
									isModuleActive
										? 'bg-panel-item-active text-foreground'
										: 'text-panel-item-text hover:bg-panel-header',
								)}
							>
								<GroupIcon
									className={cn(
										'h-4 w-4 shrink-0',
										isModuleActive ? 'text-foreground' : 'text-panel-item-icon',
									)}
								/>
								<span>{group.label}</span>
							</Link>

							{group.items && group.items.length > 1 && (
								<div className='ml-4 mt-0.5 mb-1 border-l border-panel-item-divider pl-3 flex flex-col gap-0.5'>
									{group.items.map((item) => {
										const ItemIcon = item.icon
										const t = normalizePath(item.to)
										const isActive = normPath === t || normPath.startsWith(t)
										return (
											<Link
												key={item.to}
												to={item.to as any}
												onClick={onNavigate}
												className={cn(
													'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors',
													isActive
														? 'bg-panel-item-active text-foreground font-semibold'
														: 'text-panel-item-icon hover:bg-panel-header hover:text-panel-item-text',
												)}
											>
												{ItemIcon && (
													<ItemIcon className='h-3.5 w-3.5 shrink-0' />
												)}
												<span>{item.label}</span>
											</Link>
										)
									})}
								</div>
							)}
						</div>
					)
				})}
			</nav>
		</div>
	)
}
