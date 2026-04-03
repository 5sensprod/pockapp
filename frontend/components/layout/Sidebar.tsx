// frontend/components/layout/Sidebar.tsx
//
// Tokens Stitch :
//   Rail bg              : bg-[#283044] (inverse-surface)
//   Rail icône active    : barre left bg-white + fond bg-white/10
//   Rail icône inactive  : text-white/40 hover:text-white hover:bg-white/5
//   Rail séparateur      : bg-white/10
//   Panneau bg           : bg-white (surface-container-lowest)
//   Panneau header       : bg-[#f2f3ff] (surface-container-low)
//   Panneau item actif   : bg-[#eaedff] text-[#000000] font-semibold
//   Panneau item inactif : text-[#575e70] hover:bg-[#f2f3ff]

import { cn } from '@/lib/utils'
import type { ModuleManifest, SidebarGroup } from '@/modules/_registry'
import { homeDashboardManifest } from '@/modules/home'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { LayoutDashboard, X } from 'lucide-react'
import * as React from 'react'

const normalizePath = (path: string) => (path || '/').replace(/\/+$/, '') || '/'

interface SidebarProps {
	currentModule: ModuleManifest | null
	activeGroup: string | null
	onToggleGroup: (groupId: string) => void
	onClosePanel: () => void
	onHomePanelChange?: (open: boolean) => void // ← AJOUT
}

export function Sidebar({
	currentModule,
	activeGroup,
	onToggleGroup,
	onClosePanel,
	onHomePanelChange, // ← AJOUT
}: SidebarProps) {
	const { pathname } = useLocation()
	const navigate = useNavigate()

	// ⚠️ Hooks AVANT tout return conditionnel
	const [homePanel, setHomePanel] = React.useState(false)

	// ── Wrapper qui notifie aussi le Layout ──────────────────────────────────
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

	if (!sidebarMenu.length) return null

	const normPath = normalizePath(pathname)
	const activeGroupData = sidebarMenu.find((g) => g.id === activeGroup) || null

	const groupMatchesUrl = (group: SidebarGroup): boolean =>
		!!group.items?.some((item) => {
			const t = normalizePath(item.to)
			return normPath === t || normPath.startsWith(t)
		})

	const handleGroupClick = (group: SidebarGroup) => {
		setHomePanelWithNotify(false)
		onToggleGroup(group.id)
		if (group.items?.length === 1) {
			navigate({ to: group.items[0].to as any })
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

	return (
		<div className='fixed left-0 top-[56px] bottom-0 flex z-50'>
			{/* ── Rail ──────────────────────────────────────────────────────────
          Zone haute  : icônes du module courant
          Zone basse  : séparateur + icône LayoutDashboard (menu global)
                        toujours visible hors home page
      ──────────────────────────────────────────────────────────────── */}
			<div className='w-14 bg-[#283044] flex flex-col items-center py-3 shrink-0'>
				{/* Icône home en haut — toujours visible hors home page */}
				{!isHomePage && (
					<>
						<button
							type='button'
							onClick={handleHomePanelToggle}
							title='Tous les modules'
							className={cn(
								'relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 mb-1',
								showHomePanel
									? 'text-white/80 bg-white/10'
									: 'text-white/30 hover:text-white/70 hover:bg-white/5',
							)}
						>
							<LayoutDashboard className='h-4 w-4' />
							{showHomePanel && (
								<span className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-white/60' />
							)}
						</button>
						<div className='w-6 h-px bg-white/10 mb-2 shrink-0' />
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
									group.items?.length === 1 ? group.items[0].label : group.label
								}
								className={cn(
									'relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150',
									isActive
										? 'text-white bg-white/10'
										: 'text-white/40 hover:text-white hover:bg-white/5',
								)}
							>
								<Icon className='h-5 w-5' />
								{isActive && (
									<span className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-white' />
								)}
							</button>
						)
					})}
				</div>
			</div>

			{/* ── Panneau module ───────────────────────────────────────────── */}
			{showModulePanel && activeGroupData && (
				<ModulePanel
					group={activeGroupData}
					normPath={normPath}
					onClose={onClosePanel}
				/>
			)}

			{/* ── Panneau home global ──────────────────────────────────────── */}
			{showHomePanel && (
				<HomePanel
					groups={homeSidebarMenu}
					normPath={normPath}
					onClose={() => setHomePanelWithNotify(false)}
					onNavigate={() => setHomePanelWithNotify(false)}
				/>
			)}
		</div>
	)
}

// ── Panneau d'un groupe module ───────────────────────────────────────────────
function ModulePanel({
	group,
	normPath,
	onClose,
}: {
	group: SidebarGroup
	normPath: string
	onClose: () => void
}) {
	return (
		<div className='w-64 bg-white flex flex-col shadow-2xl'>
			<div className='h-[56px] px-4 bg-[#f2f3ff] flex items-center justify-between shrink-0'>
				<h2 className='text-sm font-semibold text-[#131b2e]'>{group.label}</h2>
				<button
					type='button'
					onClick={onClose}
					className='rounded-md p-1.5 hover:bg-[#eaedff] transition-colors'
					title='Fermer'
				>
					<X className='h-4 w-4 text-[#7e7576]' />
				</button>
			</div>
			<nav className='flex-1 overflow-y-auto p-2'>
				{group.items?.map((item) => {
					const ItemIcon = item.icon
					const t = normalizePath(item.to)
					const isActive = normPath === t || normPath.startsWith(t)
					return (
						<Link
							key={item.to}
							to={item.to as any}
							className={cn(
								'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
								isActive
									? 'bg-[#eaedff] text-[#000000] font-semibold'
									: 'text-[#575e70] hover:bg-[#f2f3ff]',
							)}
						>
							{ItemIcon && (
								<ItemIcon
									className={cn(
										'h-4 w-4 shrink-0',
										isActive ? 'text-[#000000]' : 'text-[#7e7576]',
									)}
								/>
							)}
							<span>{item.label}</span>
						</Link>
					)
				})}
			</nav>
		</div>
	)
}

// ── Panneau home global ──────────────────────────────────────────────────────
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
		<div className='w-64 bg-white flex flex-col shadow-2xl'>
			<div className='h-[56px] px-4 bg-[#f2f3ff] flex items-center justify-between shrink-0'>
				<span className='text-[10px] uppercase tracking-widest font-bold text-[#7e7576]'>
					Tous les modules
				</span>
				<button
					type='button'
					onClick={onClose}
					className='rounded-md p-1.5 hover:bg-[#eaedff] transition-colors'
					title='Fermer'
				>
					<X className='h-4 w-4 text-[#7e7576]' />
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
										? 'bg-[#eaedff] text-[#000000]'
										: 'text-[#575e70] hover:bg-[#f2f3ff]',
								)}
							>
								<GroupIcon
									className={cn(
										'h-4 w-4 shrink-0',
										isModuleActive ? 'text-[#000000]' : 'text-[#7e7576]',
									)}
								/>
								<span>{group.label}</span>
							</Link>

							{/* Sous-items indentés si plusieurs routes */}
							{group.items && group.items.length > 1 && (
								<div className='ml-4 mt-0.5 mb-1 border-l border-[#cfc4c5] pl-3 flex flex-col gap-0.5'>
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
														? 'bg-[#eaedff] text-[#000000] font-semibold'
														: 'text-[#7e7576] hover:bg-[#f2f3ff] hover:text-[#575e70]',
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
