// frontend/components/layout/Sidebar.tsx
import { cn } from '@/lib/utils'
import type { ModuleManifest } from '@/modules/_registry'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

// ✅ helper pure, définie en dehors du composant
const normalizePath = (path: string) => (path || '/').replace(/\/+$/, '') || '/'

interface SidebarProps {
	currentModule: ModuleManifest | null
	onPanelChange?: (open: boolean) => void
	defaultOpenGroup?: string
}

export function Sidebar({
	currentModule,
	onPanelChange,
	defaultOpenGroup,
}: SidebarProps) {
	const [activeGroup, setActiveGroup] = useState<string | null>(
		defaultOpenGroup || null,
	)

	const navigate = useNavigate()
	const { pathname } = useLocation()

	const sidebarMenu = currentModule?.sidebarMenu || []

	if (!sidebarMenu.length) return null

	const toggleGroup = (groupId: string) => {
		if (activeGroup === groupId) {
			setActiveGroup(null)
			return
		}

		setActiveGroup(groupId)

		const group = sidebarMenu.find((g) => g.id === groupId)
		const firstItem = group?.items?.[0]

		if (firstItem?.to) {
			navigate({ to: firstItem.to as any })
		}
	}

	const activeGroupData = sidebarMenu.find((g) => g.id === activeGroup) || null

	// 🔁 Sync groupe ouvert <-> URL
	useEffect(() => {
		if (!sidebarMenu.length) return

		const current = normalizePath(pathname)

		const matchingGroup = sidebarMenu.find((group) =>
			group.items?.some((item) => normalizePath(item.to) === current),
		)

		if (matchingGroup && matchingGroup.id !== activeGroup) {
			setActiveGroup(matchingGroup.id)
		}
	}, [pathname, sidebarMenu, activeGroup]) // ✅ deps complètes, plus de warning

	useEffect(() => {
		onPanelChange?.(activeGroup !== null)
	}, [activeGroup, onPanelChange])

	return (
		<div className='fixed left-0 top-14 bottom-0 flex z-40'>
			{/* Rail d'icônes */}
			<div className='w-14 bg-muted border-r flex flex-col items-center py-4 gap-2'>
				{sidebarMenu.map((group) => {
					const Icon = group.icon
					const isActive = activeGroup === group.id

					return (
						<button
							key={group.id}
							type='button'
							onClick={() => toggleGroup(group.id)}
							className={cn(
								'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
								'hover:bg-accent',
								isActive && 'bg-accent text-accent-foreground',
							)}
							title={group.label}
						>
							<Icon className='h-5 w-5' />
						</button>
					)
				})}
			</div>

			{/* Panneau latéral */}
			{activeGroupData && (
				<div className='w-64 bg-background border-r flex flex-col'>
					<div className='p-4 border-b'>
						<h2 className='font-semibold text-sm'>{activeGroupData.label}</h2>
					</div>

					<nav className='flex-1 overflow-y-auto p-2'>
						{activeGroupData.items?.map((item) => {
							const ItemIcon = item.icon
							const isActive =
								normalizePath(pathname) === normalizePath(item.to)

							return (
								<Link
									key={item.to}
									to={item.to}
									className={cn(
										'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
										'hover:bg-accent',
										isActive && 'bg-accent text-accent-foreground font-medium',
									)}
								>
									{ItemIcon && <ItemIcon className='h-4 w-4' />}
									<span>{item.label}</span>
								</Link>
							)
						})}
					</nav>
				</div>
			)}
		</div>
	)
}
