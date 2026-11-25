// frontend/components/ReleaseNotesList.tsx
//
// Les changements d'une version, groupés. Le texte vient du corps de la release
// GitHub (updater.go → UpdateInfo.releaseNotes), lu par `parseReleaseNotes`.
import { Badge } from '@/components/ui/badge'
import {
	type ChangementVersion,
	notesVides,
	parseReleaseNotes,
} from '@/lib/release-notes'
import { useMemo } from 'react'

function Groupe({
	titre,
	items,
}: {
	titre: string
	items: ChangementVersion[]
}) {
	if (items.length === 0) return null
	return (
		<section className='space-y-1.5'>
			<h4 className='flex items-center gap-2 text-sm font-semibold text-foreground'>
				{titre}
				<Badge variant='secondary'>{items.length}</Badge>
			</h4>
			<ul className='list-disc space-y-1 pl-5 text-sm text-foreground'>
				{items.map((c) => (
					<li key={`${c.portee ?? ''}|${c.texte}`}>
						{c.portee && (
							<span className='mr-1 text-xs text-muted-foreground'>
								{c.portee} ·
							</span>
						)}
						{c.texte}
					</li>
				))}
			</ul>
		</section>
	)
}

export function ReleaseNotesList({ notes }: { notes: string }) {
	const parsed = useMemo(() => parseReleaseNotes(notes), [notes])
	if (notesVides(parsed)) return null

	return (
		<div className='max-h-64 space-y-4 overflow-y-auto rounded-lg bg-muted p-4'>
			<Groupe titre='Nouveautés' items={parsed.nouveautes} />
			<Groupe titre='Corrections' items={parsed.corrections} />
			<Groupe
				titre={parsed.reconnu ? 'Autres' : 'Notes de version'}
				items={parsed.autres}
			/>
		</div>
	)
}
