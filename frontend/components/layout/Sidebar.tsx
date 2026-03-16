// frontend/components/layout/Sidebar.tsx
import { cn } from '@/lib/utils'
import type { ModuleManifest } from '@/modules/_registry'
import { Link, useLocation } from '@tanstack/react-router'
import { X } from 'lucide-react'

const normalizePath = (path: string) => (path || '/').replace(/\/+$/, '') || '/'

interface SidebarProps {
	currentModule: ModuleManifest | null
	activeGroup: string | null
	onToggleGroup: (groupId: string) => void
	onClosePanel: () => void
}

export function Sidebar({
	currentModule,
	activeGroup,
	onToggleGroup,
	onClosePanel,
}: SidebarProps) {
	const { pathname } = useLocation()

	const sidebarMenu = currentModule?.sidebarMenu || []

	if (!sidebarMenu.length) return null

	const normPath = normalizePath(pathname)
	const activeGroupData = sidebarMenu.find((g) => g.id === activeGroup) || null

	const groupMatchesUrl = (group: (typeof sidebarMenu)[0]): boolean => {
		return !!group.items?.some((item) => {
			const t = normalizePath(item.to)
			return normPath === t || normPath.startsWith(t)
		})
	}

	return (
		<div className='fixed left-0 top-14 bottom-0 flex z-40'>
			{/* Rail d'icônes */}
			<div className='w-14 bg-muted border-r flex flex-col items-center py-4 gap-2'>
				{sidebarMenu.map((group) => {
					const Icon = group.icon
					const isActive = activeGroup === group.id || groupMatchesUrl(group)

					return (
						<button
							key={group.id}
							type='button'
							onClick={() => onToggleGroup(group.id)}
							className={cn(
								'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
								'hover:bg-accent',
								isActive && 'bg-primary/15 text-primary',
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
					<div className='p-4 border-b flex items-center justify-between'>
						<h2 className='font-semibold text-sm'>{activeGroupData.label}</h2>
						<button
							type='button'
							onClick={onClosePanel}
							className='rounded p-1 hover:bg-accent transition-colors'
							title='Fermer'
						>
							<X className='h-4 w-4 text-muted-foreground' />
						</button>
					</div>

					<nav className='flex-1 overflow-y-auto p-2'>
						{activeGroupData.items?.map((item) => {
							const ItemIcon = item.icon
							const t = normalizePath(item.to)
							const isItemActive = normPath === t || normPath.startsWith(t)

							return (
								<Link
									key={item.to}
									to={item.to}
									className={cn(
										'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
										'hover:bg-accent',
										isItemActive &&
											'bg-accent text-accent-foreground font-medium',
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
