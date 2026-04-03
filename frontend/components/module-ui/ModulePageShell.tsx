// frontend/components/module-ui/ModulePageShell.tsx

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

	return (
		<div className={cn('flex flex-col min-h-full', className)}>
			<header className='sticky top-[56px] z-40 h-[72px] flex items-center justify-between px-6 bg-muted/95 backdrop-blur-sm shrink-0 border-b shadow-sm'>
				{/* 1. Gauche */}
				<div className='flex items-center gap-3 flex-1 min-w-0 overflow-hidden'>
					{!hideIcon && (
						<div className='w-10 h-10 rounded-lg bg-[#1E1B4B] flex items-center justify-center shrink-0'>
							<Icon className='h-5 w-5 text-white' />
						</div>
					)}

					{/* Titre — masqué si hideTitle */}
					{!hideTitle && (
						<div className='flex flex-col min-w-0 shrink-0'>
							<div className='flex items-center gap-2'>
								<h1 className='text-sm font-semibold text-foreground leading-tight tracking-widest uppercase'>
									{manifest.name}
								</h1>
								{manifest.plan && (
									<span className='bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider shrink-0'>
										{manifest.plan}
									</span>
								)}
							</div>
							{manifest.description && (
								<p className='text-xs text-muted-foreground leading-tight mt-0.5'>
									{manifest.description}
								</p>
							)}
						</div>
					)}

					{/* headerLeft — directement après l'icône si hideTitle, sinon avec séparateur */}
					{headerLeft && (
						<>
							{!hideTitle && (
								<div className='h-8 w-px bg-border/50 shrink-0 mx-1' />
							)}
							<div className='flex items-center min-w-0 overflow-hidden flex-1'>
								{headerLeft}
							</div>
						</>
					)}
				</div>

				{/* 2. Centre */}
				<div className='flex justify-center shrink-0 px-4'>{centerContent}</div>

				{/* 3. Droite */}
				<div className='flex items-center justify-end gap-4 flex-1'>
					{badge}
					{actions}
				</div>
			</header>

			<div className='flex-1 bg-background p-6'>{children}</div>
		</div>
	)
}
