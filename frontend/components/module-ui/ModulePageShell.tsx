// frontend/components/module-ui/ModulePageShell.tsx
//
// Tokens Stitch → variables shadcn :
//   surface-container-low  → bg-muted        (header shell)
//   surface                → bg-background   (zone contenu)
//   on-surface             → text-foreground
//   No-Line rule           → pas de border, séparation par bg-muted vs bg-background

import { cn } from '@/lib/utils'
import type { ModuleManifest } from '@/modules/_registry'
import type { ReactNode } from 'react'

interface ModulePageShellProps {
	/** Manifest du module — fournit icône, nom, description, plan */
	manifest: ModuleManifest
	/** Slot droit : StatusBadge, date, ou n'importe quel nœud */
	badge?: ReactNode
	/** Actions principales (boutons) affichées à droite du header */
	actions?: ReactNode
	/** Contenu de la page */
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
			{/* ── Module Header ──────────────────────────────────────────────────
          72px · bg-muted (≈ surface-container-low Stitch)
          Pas de border-b — "No-Line rule" : séparation par shift de teinte
      ─────────────────────────────────────────────────────────────────── */}
			<header className='h-[72px] flex items-center justify-between px-6 bg-muted shrink-0'>
				{/* Identité du module */}
				<div className='flex items-center gap-4'>
					{/* Icon container 40×40 · bg primaire sombre (#1E1B4B) inchangé
              C'est le "deep indigo anchor" défini dans Stitch — pas de variable shadcn équivalente */}
					<div className='w-10 h-10 rounded-lg bg-[#1E1B4B] flex items-center justify-center shrink-0'>
						<Icon className='h-5 w-5 text-white' />
					</div>

					<div className='flex flex-col'>
						<div className='flex items-center gap-2'>
							<h1 className='text-base font-medium text-foreground leading-tight tracking-tight'>
								{manifest.name}
							</h1>

							{/* Badge plan (PRO, etc.) piloté par le manifest */}
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

				{/* Zone droite : badge statut + actions */}
				{(badge || actions) && (
					<div className='flex items-center gap-4'>
						{badge}
						{actions}
					</div>
				)}
			</header>

			{/* ── Contenu ────────────────────────────────────────────────────────
          bg-muted (≈ surface-container-low Stitch) · les cards bg-card
          ressortent par lift tonal sans border ni shadow aggressive
      ─────────────────────────────────────────────────────────────────── */}
			{/* bg-background : fond légèrement teinté → écart tonal avec header bg-muted
          Les cards bg-card (blanc pur) ressortent, le header reste plus foncé */}
			<div className='flex-1 bg-background p-6'>{children}</div>
		</div>
	)
}
