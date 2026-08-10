// frontend/modules/site/components/PublishMenuButton.tsx
// ═══════════════════════════════════════════════════════════════════════════
// ACTION « PUBLIER LE MENU »  (ticket 6)
// ═══════════════════════════════════════════════════════════════════════════
// Le seul endroit de PocketApp qui envoie quelque chose au site.
//
// Trois issues, volontairement distinguées à l'écran, parce qu'elles
// n'appellent pas la même correction :
//
//   1. le document ne se compose pas   → des entrées n'ont pas d'URL, ici
//   2. l'endpoint refuse le document   → divergence avec le contrat, côté PHP
//   3. l'envoi n'aboutit pas           → configuration ou réseau
//
// La 1 est de loin la plus fréquente et la seule que l'opérateur peut corriger
// seul : elle liste les entrées fautives par leur titre.
// ═══════════════════════════════════════════════════════════════════════════

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import type { SiteMenuResponse } from '@/lib/queries/site-menu'
import { Loader2, Upload } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { PublishRejected, usePublishMenu } from '../hooks/use-publish-menu'
import {
	type DestinationUrlIndex,
	type UnresolvedEntry,
	composeMenuDocument,
} from '../lib/publish-menu'

interface Props {
	entries: SiteMenuResponse[]
	index: DestinationUrlIndex
	/** Les listes de destinations nécessaires sont chargées. Publier avant, ce
	 *  serait refuser des entrées dont l'URL est simplement en cours de
	 *  lecture. */
	catalogReady: boolean
}

type Problem =
	| { kind: 'unresolved'; entries: UnresolvedEntry[] }
	| { kind: 'rejected'; message: string; errors: string[] }

export function PublishMenuButton({ entries, index, catalogReady }: Props) {
	const publish = usePublishMenu()
	const [problem, setProblem] = useState<Problem | undefined>()

	const disabled = entries.length === 0 || !catalogReady || publish.isPending

	const handlePublish = async () => {
		const composed = composeMenuDocument(entries, index)

		if (!composed.ok) {
			setProblem({ kind: 'unresolved', entries: composed.unresolved })
			return
		}

		try {
			const result = await publish.mutateAsync(composed.document)
			toast.success('Menu publié', {
				description: `${result.items} entrée${result.items > 1 ? 's' : ''}, ${result.bytes} octets.`,
			})
		} catch (error) {
			if (error instanceof PublishRejected) {
				setProblem({
					kind: 'rejected',
					message: error.message,
					errors: error.errors,
				})
				return
			}
			toast.error('Publication impossible', {
				description: error instanceof Error ? error.message : undefined,
			})
		}
	}

	return (
		<>
			<Button size='sm' onClick={handlePublish} disabled={disabled}>
				{publish.isPending ? (
					<Loader2 className='mr-2 h-4 w-4 animate-spin' />
				) : (
					<Upload className='mr-2 h-4 w-4' />
				)}
				Publier le menu
			</Button>

			<Dialog
				open={!!problem}
				onOpenChange={(open) => !open && setProblem(undefined)}
			>
				<DialogContent className='max-w-2xl'>
					{problem?.kind === 'unresolved' && (
						<>
							<DialogHeader>
								<DialogTitle>
									Publication annulée — rien n'a été envoyé
								</DialogTitle>
								<DialogDescription>
									{problem.entries.length} entrée
									{problem.entries.length > 1 ? 's' : ''} sans adresse
									publiable. Le menu n'est pas publié partiellement : une
									rubrique qui disparaît sans qu'on l'ait décidé serait pire
									qu'un refus.
								</DialogDescription>
							</DialogHeader>

							<ul className='max-h-80 space-y-2 overflow-y-auto text-sm'>
								{problem.entries.map((entry) => (
									<li key={entry.id} className='rounded-md border p-2'>
										<span className='font-medium'>{entry.title}</span>
										<p className='text-muted-foreground text-xs'>
											{entry.reason}
										</p>
									</li>
								))}
							</ul>

							<p className='text-muted-foreground text-xs'>
								Une destination sans URL connue se corrige en changeant la
								destination, en la masquant, ou en la remplaçant par un lien
								manuel. Les slugs manquants viennent d'AppPos et ne se
								fabriquent pas ici.
							</p>
						</>
					)}

					{problem?.kind === 'rejected' && (
						<>
							<DialogHeader>
								<DialogTitle>Document refusé par le serveur</DialogTitle>
								<DialogDescription>
									{problem.message} Rien n'a été écrit sur le site : l'endpoint
									valide avant d'écrire.
								</DialogDescription>
							</DialogHeader>

							<ul className='max-h-80 space-y-1 overflow-y-auto font-mono text-xs'>
								{problem.errors.map((error) => (
									<li key={error} className='rounded bg-muted p-2'>
										{error}
									</li>
								))}
							</ul>

							<p className='text-muted-foreground text-xs'>
								Un refus ici signale un écart entre ce que PocketApp produit et
								le contrat — c'est un bogue de PocketApp, pas une erreur de
								saisie.
							</p>
						</>
					)}

					<DialogFooter>
						<Button variant='outline' onClick={() => setProblem(undefined)}>
							Fermer
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
