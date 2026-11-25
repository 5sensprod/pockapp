// frontend/components/layout/HelpPanel.tsx
//
// Bouton « Aide » de l'en-tête et son panneau latéral droit. Le contenu vit dans
// `help-content.ts` (données) ; ici, seulement l'affichage : un bloc
// « Nouveautés » (les plus récentes d'abord), puis les rubriques par thème,
// repliables (pas de composant accordéon dans `ui/`, un simple état), et une
// recherche par titre et résumé.

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ChevronDown, CircleHelp, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
	RUBRIQUES_AIDE,
	type RubriqueAide,
	THEMES_AIDE,
	nouveautesRecentes,
	triParDate,
} from './help-content'

// Captures d'écran : tous les fichiers de `frontend/assets/aide/`, résolus par
// leur nom. Un fichier absent ne casse rien — la rubrique n'a simplement pas
// de capture.
const CAPTURES = import.meta.glob<string>(
	'/frontend/assets/aide/*.{png,jpg,jpeg,webp}',
	{ eager: true, query: '?url', import: 'default' },
)

function urlCapture(nom?: string): string | undefined {
	if (!nom) return undefined
	return CAPTURES[`/frontend/assets/aide/${nom}`]
}

/** AAAA-MM-JJ → « 25 nov. ». */
function dateCourte(iso: string): string {
	return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
		day: 'numeric',
		month: 'short',
	})
}

/** Minuscules sans accents, pour la recherche. */
function plier(t: string): string {
	return t
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
}

function aujourdhui(): string {
	const d = new Date()
	const p = (n: number) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function Rubrique({
	rubrique,
	nouveau = false,
}: {
	rubrique: RubriqueAide
	nouveau?: boolean
}) {
	const capture = urlCapture(rubrique.capture)
	const [ouverte, setOuverte] = useState(false)
	return (
		<div className='rounded-md border bg-card'>
			<button
				type='button'
				onClick={() => setOuverte((v) => !v)}
				aria-expanded={ouverte}
				className='flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-medium text-sm'
			>
				<span className='flex min-w-0 flex-1 flex-col gap-0.5'>
					<span className='flex items-center gap-2'>
						{nouveau && <Badge>Nouveau</Badge>}
						<span>{rubrique.titre}</span>
					</span>
					<span className='font-normal text-muted-foreground text-xs'>
						{dateCourte(rubrique.date)}
					</span>
				</span>
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
					{capture && (
						<img
							src={capture}
							alt={`Capture : ${rubrique.titre}`}
							loading='lazy'
							className='w-full rounded-md border'
						/>
					)}
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

function Section({
	titre,
	rubriques,
	aVenir = false,
}: {
	titre: string
	rubriques: RubriqueAide[]
	aVenir?: boolean
}) {
	const [ouverte, setOuverte] = useState(!aVenir)
	return (
		<section className='space-y-2'>
			<button
				type='button'
				onClick={() => setOuverte((v) => !v)}
				aria-expanded={ouverte}
				className='flex w-full items-center justify-between gap-2 text-left font-semibold'
			>
				{titre}
				<ChevronDown
					className={cn(
						'h-4 w-4 shrink-0 transition-transform',
						ouverte && 'rotate-180',
					)}
				/>
			</button>
			{ouverte &&
				(rubriques.length === 0 ? (
					<p className='text-muted-foreground text-sm'>
						Bientôt : d’autres rubriques d’aide.
					</p>
				) : (
					<div className='space-y-2'>
						{rubriques.map((r) => (
							<Rubrique key={r.id} rubrique={r} />
						))}
					</div>
				))}
		</section>
	)
}

export function HelpPanel() {
	const [recherche, setRecherche] = useState('')

	const { nouveautes, parTheme, total } = useMemo(() => {
		const q = plier(recherche.trim())
		const retenues = RUBRIQUES_AIDE.filter(
			(r) => !q || plier(`${r.titre} ${r.resume}`).includes(q),
		)
		return {
			// « Neuf » se décide sur tout le contenu ; la recherche ne fait que
			// restreindre ce qui reste affiché.
			nouveautes: nouveautesRecentes(RUBRIQUES_AIDE, aujourdhui()).filter((r) =>
				retenues.includes(r),
			),
			parTheme: THEMES_AIDE.map((theme) => ({
				theme,
				rubriques: triParDate(retenues.filter((r) => r.theme === theme.id)),
			})).filter((x) => x.rubriques.length > 0),
			total: retenues.length,
		}
	}, [recherche])

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
					<div className='relative'>
						<Search className='pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground' />
						<Input
							type='search'
							value={recherche}
							onChange={(e) => setRecherche(e.target.value)}
							placeholder='Rechercher dans l’aide'
							aria-label='Rechercher dans l’aide'
							className='pl-8'
						/>
					</div>
					{total === 0 && (
						<p className='text-muted-foreground text-sm'>
							Aucune rubrique ne correspond.
						</p>
					)}
					{nouveautes.length > 0 && (
						<section className='space-y-2'>
							<h3 className='font-semibold'>Nouveautés</h3>
							<div className='space-y-2'>
								{nouveautes.map((r) => (
									<Rubrique key={r.id} rubrique={r} nouveau />
								))}
							</div>
						</section>
					)}
					{parTheme.map(({ theme, rubriques }) => (
						<Section key={theme.id} titre={theme.titre} rubriques={rubriques} />
					))}
					{!recherche && <Section titre='À venir' rubriques={[]} aVenir />}
				</div>
			</SheetContent>
		</Sheet>
	)
}
