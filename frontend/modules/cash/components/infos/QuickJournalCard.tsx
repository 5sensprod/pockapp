// frontend/modules/cash/components/infos/QuickJournalCard.tsx
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'

/**
 * Carte affichant les dernières actions de la caisse
 * ⚠️ MOCK : Toutes les données sont actuellement en dur
 * TODO: Connecter au backend pour récupérer l'historique réel des actions
 * TODO: Implémenter un système de pagination ou de scroll infini
 */
export function QuickJournalCard() {
	// TODO: Récupérer depuis le backend
	const journalEntries = [
		{
			id: 1,
			time: '09:02',
			message: 'Session ouverte par',
			actor: 'Alexis',
		},
		{
			id: 2,
			time: '08:59',
			message: 'Fond de caisse déclaré : 150,00 €',
		},
		{
			id: 3,
			time: 'Hier',
			message: 'Session clôturée avec écart de 0,20 €',
		},
	]

	return (
		<Card className='border-slate-200'>
			<CardHeader className='pb-3'>
				<CardTitle className='text-sm'>Journal rapide</CardTitle>
				<CardDescription>Dernières actions liées à la caisse.</CardDescription>
			</CardHeader>
			<CardContent className='space-y-2 text-xs text-muted-foreground'>
				{journalEntries.map((entry) => (
					<div key={entry.id}>
						<span className='font-medium text-slate-900'>{entry.time}</span> —{' '}
						{entry.message}
						{entry.actor && <span> {entry.actor}</span>}.
					</div>
				))}
			</CardContent>
		</Card>
	)
}
