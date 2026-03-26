// frontend/modules/cash/components/infos/QuickJournalCard.tsx
import { ModuleCard } from '@/components/module-ui'

export function QuickJournalCard() {
	// TODO: Récupérer depuis le backend
	const journalEntries = [
		{ id: 1, time: '09:02', message: 'Session ouverte par', actor: 'Alexis' },
		{ id: 2, time: '08:59', message: 'Fond de caisse déclaré : 150,00 €' },
		{ id: 3, time: 'Hier', message: 'Session clôturée avec écart de 0,20 €' },
	]

	return (
		<ModuleCard title='Journal rapide'>
			<div className='space-y-2 text-xs text-muted-foreground'>
				{journalEntries.map((entry) => (
					<div key={entry.id}>
						<span className='font-medium text-foreground'>{entry.time}</span> —{' '}
						{entry.message}
						{entry.actor && <span> {entry.actor}</span>}.
					</div>
				))}
			</div>
		</ModuleCard>
	)
}
