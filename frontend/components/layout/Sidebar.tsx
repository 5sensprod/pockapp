import { cn } from '@/lib/utils'
import type { ModuleManifest } from '@/modules/_registry'
import { Link, useLocation } from '@tanstack/react-router'
import { useState } from 'react'

interface SidebarProps {
	currentModule: ModuleManifest | null
	onPanelChange?: (open: boolean) => void
}

export function Sidebar({ currentModule, onPanelChange }: SidebarProps) {
	const [activeGroup, setActiveGroup] = useState<string | null>(null)
	const { pathname } = useLocation()

	const sidebarMenu = currentModule?.sidebarMenu || []

	if (!sidebarMenu.length) return null

	const toggleGroup = (groupId: string) => {
		const newGroup = activeGroup === groupId ? null : groupId
		setActiveGroup(newGroup)
		onPanelChange?.(newGroup !== null)
	}

	const activeGroupData = sidebarMenu.find((g) => g.id === activeGroup) || null

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
							type='button' // ⬅️ important
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
							const isActive = pathname === item.to

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
