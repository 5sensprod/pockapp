// frontend/components/layout/HelpPanel.tsx
//
// Bouton « Aide » de l'en-tête et son panneau latéral droit. Le contenu vit dans
// `help-content.ts` (données) ; ici, seulement l'affichage : sections et
// rubriques repliables (pas de composant accordéon dans `ui/`, un simple état).

import { Button } from '@/components/ui/button'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ChevronDown, CircleHelp } from 'lucide-react'
import { useState } from 'react'
import {
	type RubriqueAide,
	SECTIONS_AIDE,
	type SectionAide,
} from './help-content'

function Rubrique({ rubrique }: { rubrique: RubriqueAide }) {
	const [ouverte, setOuverte] = useState(false)
	return (
		<div className='rounded-md border bg-card'>
			<button
				type='button'
				onClick={() => setOuverte((v) => !v)}
				aria-expanded={ouverte}
				className='flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-medium text-sm'
			>
				{rubrique.titre}
				<ChevronDown
					className={cn(
						'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
						ouverte && 'rotate-180',
					)}
				/>
			</button>
			{ouverte && (
				<div className='space-y-2 border-t px-3 py-2 text-sm'>
					<p>{rubrique.resume}</p>
					<div>
						<p className='font-medium text-muted-foreground text-xs uppercase'>
							Où cliquer
						</p>
						<ul className='list-disc space-y-0.5 pl-5'>
							{rubrique.ouCliquer.map((ligne) => (
								<li key={ligne}>{ligne}</li>
							))}
						</ul>
					</div>
					{rubrique.details && (
						<ul className='list-disc space-y-0.5 pl-5 text-muted-foreground'>
							{rubrique.details.map((ligne) => (
								<li key={ligne}>{ligne}</li>
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	)
}

function Section({ section }: { section: SectionAide }) {
	const [ouverte, setOuverte] = useState(!section.aVenir)
	return (
		<section className='space-y-2'>
			<button
				type='button'
				onClick={() => setOuverte((v) => !v)}
				aria-expanded={ouverte}
				className='flex w-full items-center justify-between gap-2 text-left font-semibold'
			>
				{section.titre}
				<ChevronDown
					className={cn(
						'h-4 w-4 shrink-0 transition-transform',
						ouverte && 'rotate-180',
					)}
				/>
			</button>
			{ouverte &&
				(section.rubriques.length === 0 ? (
					<p className='text-muted-foreground text-sm'>
						Bientôt : d’autres rubriques d’aide.
					</p>
				) : (
					<div className='space-y-2'>
						{section.rubriques.map((r) => (
							<Rubrique key={r.id} rubrique={r} />
						))}
					</div>
				))}
		</section>
	)
}

export function HelpPanel() {
	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button
					variant='ghost'
					size='icon'
					className='min-h-[44px] min-w-[44px] tablet:min-h-[48px] tablet:min-w-[48px]'
					aria-label='Aide'
					title='Aide'
				>
					<CircleHelp className='h-5 w-5 tablet:h-6 tablet:w-6' />
				</Button>
			</SheetTrigger>
			<SheetContent side='right' className='w-full overflow-y-auto sm:max-w-md'>
				<SheetHeader>
					<SheetTitle>Aide</SheetTitle>
					<SheetDescription>
						Les nouveautés de l’interface, et où cliquer.
					</SheetDescription>
				</SheetHeader>
				<div className='mt-4 space-y-5'>
					{SECTIONS_AIDE.map((s) => (
						<Section key={s.id} section={s} />
					))}
				</div>
			</SheetContent>
		</Sheet>
	)
}
