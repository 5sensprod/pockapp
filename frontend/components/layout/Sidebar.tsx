// frontend/components/layout/Sidebar.tsx
//
// Tokens Stitch appliqués (Option A — variables shadcn + ancres Stitch) :
//   Rail bg          : bg-[#283044]  (inverse-surface Stitch — "dark accent anchor")
//   Rail icône actif : barre left 4px bg-white (Stitch : active state = primary vertical bar)
//   Rail icône inactif : text-white/60, hover text-white bg-white/5
//   Panneau bg       : bg-background (surface Stitch)
//   Panneau header   : bg-muted (surface-container-low) — No-Line rule, pas de border-b
//   Panneau item actif : bg-accent text-accent-foreground
//   top-14 → top-[56px] aligné sur la nouvelle hauteur header

import { cn } from '@/lib/utils'
import type { ModuleManifest } from '@/modules/_registry'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
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
	const navigate = useNavigate()

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

	const handleGroupClick = (group: (typeof sidebarMenu)[0]) => {
		if (group.items?.length === 1) {
			navigate({ to: group.items[0].to as any })
			return
		}
		onToggleGroup(group.id)
	}

	return (
		<div className='fixed left-0 top-[56px] bottom-0 flex z-40'>
			{/* ── Rail d'icônes ──────────────────────────────────────────────
          Stitch : 56px, bg inverse-surface (#283044), "dark accent anchor"
          Pas de border-r — No-Line rule, séparation par contraste de teinte
      ─────────────────────────────────────────────────────────────────── */}
			<div className='w-14 bg-[#283044] flex flex-col items-center py-4 gap-1'>
				{sidebarMenu.map((group) => {
					const Icon = group.icon
					const isSingleItem = group.items?.length === 1
					const isActive = activeGroup === group.id || groupMatchesUrl(group)

					return (
						<button
							key={group.id}
							type='button'
							onClick={() => handleGroupClick(group)}
							title={isSingleItem ? group.items[0].label : group.label}
							className={cn(
								'relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150',
								// Inactif : blanc à 60%, hover plein + fond subtil
								!isActive && 'text-white/60 hover:text-white hover:bg-white/5',
								// Actif : blanc plein + fond blanc/10
								isActive && 'text-white bg-white/10',
							)}
						>
							<Icon className='h-5 w-5' />

							{/* Stitch : active state = barre verticale gauche 4px blanche */}
							{isActive && (
								<span className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-white' />
							)}
						</button>
					)
				})}
			</div>

			{/* ── Panneau secondaire ─────────────────────────────────────────
          Visible uniquement si le groupe actif a plusieurs items.
          bg-background (surface Stitch) — No-Line rule : pas de border-r,
          la transition visuelle rail sombre → fond clair suffit.
      ─────────────────────────────────────────────────────────────────── */}
			{activeGroupData && (activeGroupData.items?.length ?? 0) > 1 && (
				<div className='w-64 bg-background flex flex-col'>
					{/* Header panneau : bg-muted pour shift tonal sans border */}
					<div className='h-[56px] px-4 bg-muted flex items-center justify-between shrink-0'>
						<h2 className='text-sm font-medium text-foreground'>
							{activeGroupData.label}
						</h2>
						<button
							type='button'
							onClick={onClosePanel}
							className='rounded-md p-1.5 hover:bg-accent transition-colors'
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
									to={item.to as any}
									className={cn(
										'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
										!isItemActive &&
											'text-muted-foreground hover:bg-accent hover:text-foreground',
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
