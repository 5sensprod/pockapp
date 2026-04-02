// frontend/components/module-ui/ModulePageShell.tsx

import { cn } from '@/lib/utils'
import type { ModuleManifest } from '@/modules/_registry'
import type { ReactNode } from 'react'

interface ModulePageShellProps {
	manifest: ModuleManifest
	badge?: ReactNode
	centerContent?: ReactNode
	actions?: ReactNode
	children: ReactNode
	className?: string
}

export function ModulePageShell({
	manifest,
	badge,
	centerContent,
	actions,
	children,
	className,
}: ModulePageShellProps) {
	const Icon = manifest.icon

	return (
		<div className={cn('flex flex-col min-h-full', className)}>
			{/* ── Module Header — Sticky à 56px (sous le Header global) ── */}
			<header className='sticky top-[56px] z-40 h-[72px] flex items-center justify-between px-6 bg-muted/95 backdrop-blur-sm shrink-0 border-b shadow-sm'>
				{/* 1. Gauche — flex-1 pour pousser le centre */}
				<div className='flex items-center gap-4 flex-1 overflow-hidden'>
					<div className='w-10 h-10 rounded-lg bg-[#1E1B4B] flex items-center justify-center shrink-0'>
						<Icon className='h-5 w-5 text-white' />
					</div>

					<div className='flex flex-col truncate'>
						<div className='flex items-center gap-2'>
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
				</div>

				{/* 2. Centre — Zone de recherche */}
				<div className='flex justify-center shrink-0 px-4'>{centerContent}</div>

				{/* 3. Droite — flex-1 pour équilibrer la gauche */}
				<div className='flex items-center justify-end gap-4 flex-1'>
					{badge}
					{actions}
				</div>
			</header>

			{/* Zone de contenu */}
			<div className='flex-1 bg-background p-6'>{children}</div>
		</div>
	)
}
