// frontend/components/module-ui/ModulePageShell.tsx
//
// Changements vs version précédente :
//   - top-[56px]   → top-header    (var CSS --header-h)
//   - h-[72px]     → h-subheader   (var CSS --subheader-h)
//   - px-4 lg:px-6 → conservé (spacing fine)
//   - Sub-header masqué sur mobile si aucun contenu visible (headerLeft, centerContent, actions)
//   - hidden md:flex → hidden brand-visible (titre/icône visibles dès 360px)
//
// Le composant est sticky sous le header global.
// Si --header-h change dans index.css, ce composant suit automatiquement.

import { useBreakpoint } from '@/lib/hooks/useBreakpoint'
import { cn } from '@/lib/utils'
import type { ModuleManifest } from '@/modules/_registry'
import type { ReactNode } from 'react'

interface ModulePageShellProps {
	manifest: ModuleManifest
	badge?: ReactNode
	centerContent?: ReactNode
	actions?: ReactNode
	headerLeft?: ReactNode
	hideTitle?: boolean
	hideIcon?: boolean
	children: ReactNode
	className?: string
}

export function ModulePageShell({
	manifest,
	badge,
	centerContent,
	actions,
	headerLeft,
	hideTitle = false,
	hideIcon = false,
	children,
	className,
}: ModulePageShellProps) {
	const Icon = manifest.icon
	const { isMobile } = useBreakpoint()

	const hasMobileContent = !!(headerLeft || centerContent || actions)

	if (isMobile && !hasMobileContent) {
		return (
			<div className={cn('flex flex-col min-h-full', className)}>
				<div className='flex-1 bg-background p-4 md:p-6'>{children}</div>
			</div>
		)
	}

	return (
		<div className={cn('flex flex-col min-h-full', className)}>
			<header className='sticky top-page-shell z-40 h-subheader flex items-center justify-between px-4 lg:px-6 bg-muted/95 backdrop-blur-sm shrink-0 border-b shadow-sm gap-4'>
				{/* 1. Gauche */}
				<div className='flex items-center gap-3 min-w-0 shrink'>
					{!hideIcon && (
						<div className='flex w-10 h-10 rounded-lg bg-primary items-center justify-center shrink-0'>
							<Icon className='h-5 w-5 text-white' />
						</div>
					)}

					{!hideTitle && (
						<div className='hidden brand-visible flex-col min-w-0'>
							<div className='flex items-center gap-2 min-w-0'>
								<h1 className='text-sm font-semibold text-foreground leading-tight tracking-widest uppercase truncate'>
									{manifest.name}
								</h1>
								{manifest.plan && (
									<span className='bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider shrink-0'>
										{manifest.plan}
									</span>
								)}
							</div>
							{manifest.description && (
								<p className='text-xs text-muted-foreground leading-tight mt-0.5 truncate'>
									{manifest.description}
								</p>
							)}
						</div>
					)}

					{/* headerLeft */}
					{headerLeft && (
						<>
							{!hideTitle && (
								<div className='hidden brand-visible h-8 w-px bg-border/50 shrink-0 mx-1' />
							)}
							<div className='flex items-center min-w-0 shrink'>
								{headerLeft}
							</div>
						</>
					)}
				</div>

				{/* 2. Centre */}
				<div className='flex-1 flex justify-center min-w-0 px-2 lg:px-4'>
					{centerContent}
				</div>

				{/* 3. Droite */}
				<div className='flex items-center justify-end gap-2 lg:gap-4 shrink-0'>
					{actions}
					{badge && <div className='hidden lg:block'>{badge}</div>}
				</div>
			</header>

			<div className='flex-1 bg-background p-4 md:p-6'>{children}</div>
		</div>
	)
}
