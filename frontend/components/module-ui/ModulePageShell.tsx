// frontend/components/module-ui/ModulePageShell.tsx

import { cn } from '@/lib/utils'
import type { ModuleManifest } from '@/modules/_registry'
import type { ReactNode } from 'react'

interface ModulePageShellProps {
	manifest: ModuleManifest
	badge?: ReactNode
	actions?: ReactNode
	children: ReactNode
	className?: string
}

export function ModulePageShell({
	manifest,
	badge,
	actions,
	children,
	className,
}: ModulePageShellProps) {
	const Icon = manifest.icon

	return (
		<div className={cn('flex flex-col min-h-full', className)}>
			{/* ── Module Header — 72px, 3 zones : identité | centre vide | badge+actions ── */}
			<header className='h-[72px] flex items-center px-6 bg-muted shrink-0'>
				{/* Gauche — identité */}
				<div className='flex items-center gap-4 shrink-0'>
					<div className='w-10 h-10 rounded-lg bg-[#1E1B4B] flex items-center justify-center shrink-0'>
						<Icon className='h-5 w-5 text-white' />
					</div>

					<div className='flex flex-col'>
						<div className='flex items-center gap-2'>
							<h1 className='text-sm font-semibold text-foreground leading-tight tracking-widest uppercase'>
								{manifest.name}
							</h1>

							{/* Badge PRO — masqué quand plan absent (pages contextuelles) */}
							{manifest.plan && (
								<span className='bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider'>
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
				</div>

				{/* Centre — flex-1 pousse la zone droite */}
				<div className='flex-1' />

				{/* Droite — badge statut + actions */}
				{(badge || actions) && (
					<div className='flex items-center gap-4'>
						{badge}
						{actions}
					</div>
				)}
			</header>

			<div className='flex-1 bg-background p-6'>{children}</div>
		</div>
	)
}
