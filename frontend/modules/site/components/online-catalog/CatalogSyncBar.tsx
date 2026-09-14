// frontend/modules/site/components/online-catalog/CatalogSyncBar.tsx
//
// La bande de synchronisation : ce que la base SQL du site contient déjà, ce
// qui reste à envoyer, et le bouton qui envoie.
//
// Elle ne calcule rien : les états lui arrivent déjà comptés. Son seul travail
// est de rendre lisible une opération qui dure — une quinzaine d'allers-retours
// pour 2500 produits (§6 du contrat).
//
// ── RÉÉCRITE LE 14 SEPTEMBRE 2026 ──────────────────────────────────────────
// Elle alignait cinq nombres — « Sur le site 2412 · À jour 2398 · Jamais
// exportés 9 · Modifiés 3 · À retirer 2 » — qui se lisaient comme un tableau de
// bord et ne disaient jamais QUOI FAIRE. Cinq nombres de même poids, dont trois
// sont des tâches et deux un état.
//
// Désormais : une phrase qui compte ce qu'il reste à faire, les tâches en
// dessous, en toutes lettres, et l'état du site relégué en pied, en gris. Les
// mots ont changé aussi — « Jamais exportés » est devenu « créées ici, jamais
// parties sur le site », parce que « exporter » est un mot d'informaticien.
//
// Et un état de plus, qui n'était affiché NULLE PART : les fiches encore en
// ligne qui n'existent plus ici — celles qu'on a supprimées au comptoir. Elles
// ne partent pas avec le bouton : rien ne les retire aujourd'hui
// (`PocketSite-docs/20-conception-retrait.md`). Les taire, c'était laisser
// croire que le site était à jour alors qu'il servait des pages fantômes.

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
	AlertTriangle,
	CheckCircle2,
	CloudOff,
	CloudUpload,
	Loader2,
	RefreshCw,
} from 'lucide-react'

import type { ExportRejection } from '../../hooks/use-catalog-sync'

type Props = {
	/** L'inventaire distant a-t-il pu être lu ? */
	available: boolean
	loading: boolean
	error: Error | null
	/** `retirable` : dépubliés ici, encore en ligne là-bas — ils partent avec le
	 *  reste et disparaissent du site (21 août 2026). */
	counts: {
		absent: number
		modified: number
		synced: number
		retirable: number
	}
	/** Supprimés ici, toujours en ligne. **Ils n'entrent dans aucun envoi** :
	 *  une fiche qui n'existe plus ne s'exporte pas, et le contrat n'a aucune
	 *  opération de suppression (§2). Comptés pour être dits, pas pour agir. */
	disparus: number
	remoteCount: number | null
	exporting: boolean
	progress: { done: number; total: number }
	rejected: ExportRejection[]
	onRefresh: () => void
	onExportAll: () => void
}

export function CatalogSyncBar({
	available,
	loading,
	error,
	counts,
	disparus,
	remoteCount,
	exporting,
	progress,
	rejected,
	onRefresh,
	onExportAll,
}: Props) {
	if (loading && !available) {
		return (
			<Card className='mb-6'>
				<CardContent className='pt-6'>
					<div className='mb-3 flex items-center gap-3 text-sm'>
						<Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
						<div>
							<p className='font-medium'>Lecture de l’état du site</p>
							<p className='text-muted-foreground'>
								Comparaison avec le catalogue publié…
							</p>
						</div>
					</div>
					<div
						aria-hidden='true'
						className='h-2 w-full animate-pulse rounded-full bg-muted'
					/>
				</CardContent>
			</Card>
		)
	}

	// Pas d'inventaire : on ne prétend pas connaître l'état du site. Aucune
	// carte n'est grisée, et on dit pourquoi plutôt que d'afficher zéro.
	if (!available) {
		return (
			<Card className='mb-6 border-dashed'>
				<CardContent className='flex flex-wrap items-center gap-3 pt-6'>
					<AlertTriangle className='h-5 w-5 shrink-0 text-muted-foreground' />
					<div className='flex-1 text-sm'>
						<p className='font-medium'>État du site inconnu</p>
						<p className='text-muted-foreground'>
							{error
								? error.message
								: 'URL et clé d’export à renseigner dans Réglages > Clés API.'}
						</p>
					</div>
					<Button variant='outline' size='sm' onClick={onRefresh}>
						<RefreshCw className='mr-1.5 h-3.5 w-3.5' />
						Réessayer
					</Button>
				</CardContent>
			</Card>
		)
	}

	const toSend = counts.absent + counts.modified + counts.retirable

	// Les trois tâches, dans l'ordre où elles se comprennent : ce qui n'est
	// jamais parti, ce qui a bougé depuis, ce qui doit disparaître.
	const taches = [
		counts.absent > 0
			? {
					cle: 'absent',
					texte: `${counts.absent} fiche${counts.absent > 1 ? 's' : ''} créée${counts.absent > 1 ? 's' : ''} ici, jamais partie${counts.absent > 1 ? 's' : ''} sur le site`,
					aide: 'Une fiche neuve ne part pas toute seule la première fois.',
				}
			: null,
		counts.modified > 0
			? {
					cle: 'modified',
					texte: `${counts.modified} fiche${counts.modified > 1 ? 's' : ''} modifiée${counts.modified > 1 ? 's' : ''} depuis leur dernier envoi`,
					aide: 'Le site affiche encore la version précédente.',
				}
			: null,
		counts.retirable > 0
			? {
					cle: 'retirable',
					texte: `${counts.retirable} page${counts.retirable > 1 ? 's' : ''} à retirer du site`,
					aide: 'Dépubliée(s) ici : l’envoi fait disparaître la page.',
				}
			: null,
	].filter((tache): tache is NonNullable<typeof tache> => tache !== null)

	return (
		<Card className='mb-6'>
			<CardContent className='space-y-4 pt-6'>
				<div className='flex flex-wrap items-start justify-between gap-4'>
					<div className='min-w-0 flex-1'>
						{toSend === 0 ? (
							<p className='flex items-center gap-2 font-medium text-sm'>
								<CheckCircle2 className='h-4 w-4 shrink-0 text-emerald-500' />
								Le site est à jour.
							</p>
						) : (
							<>
								<p className='flex items-center gap-2 font-medium text-sm'>
									<CloudUpload className='h-4 w-4 shrink-0 text-amber-500' />
									{toSend} fiche{toSend > 1 ? 's' : ''} à envoyer au site
								</p>
								<ul className='mt-2 space-y-1 text-sm'>
									{taches.map((tache) => (
										<li key={tache.cle} className='flex flex-wrap gap-x-2'>
											<span className='tabular-nums'>{tache.texte}</span>
											<span className='text-muted-foreground'>
												{tache.aide}
											</span>
										</li>
									))}
								</ul>
							</>
						)}
					</div>

					{exporting ? (
						<div className='flex items-center gap-2 text-muted-foreground text-sm'>
							<Loader2 className='h-4 w-4 animate-spin' />
							<span className='tabular-nums'>
								Lot {progress.done} / {progress.total}
							</span>
						</div>
					) : (
						<div className='flex items-center gap-2'>
							<Button
								variant='ghost'
								size='sm'
								onClick={onRefresh}
								disabled={loading}
								title='Relire l’état du site'
							>
								<RefreshCw
									className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
								/>
							</Button>
							<Button onClick={onExportAll} disabled={toSend === 0}>
								<CloudUpload className='mr-1.5 h-4 w-4' />
								{toSend === 0 ? 'Tout est à jour' : `Envoyer (${toSend})`}
							</Button>
						</div>
					)}
				</div>

				{/* Le bouton ne peut RIEN pour celles-là : elles n'existent plus ici,
				    donc elles ne s'exportent pas, et le serveur n'a aucune opération
				    de suppression. On le dit plutôt que de laisser un compteur
				    muet. */}
				{disparus > 0 && (
					<div className='flex items-start gap-2 rounded-md border border-amber-500/50 p-3 text-sm'>
						<CloudOff className='mt-0.5 h-4 w-4 shrink-0 text-amber-500' />
						<div>
							<p className='font-medium'>
								{disparus} fiche{disparus > 1 ? 's' : ''} en ligne n’existe
								{disparus > 1 ? 'nt' : ''} plus ici
							</p>
							<p className='text-muted-foreground'>
								Supprimée{disparus > 1 ? 's' : ''} au comptoir : leur page reste
								visible sur le site. L’envoi ne les concerne pas — le retrait
								d’une fiche supprimée n’existe pas encore.
							</p>
						</div>
					</div>
				)}

				<p className='text-muted-foreground text-xs tabular-nums'>
					{remoteCount ?? 0} fiche(s) sur le site · {counts.synced} à jour
				</p>

				{/* Un refus n'annule pas le lot (§5) : il se montre sans alarmer sur
				    ce qui a bien été écrit. */}
				{rejected.length > 0 && (
					<div className='w-full rounded-md border border-amber-500/50 p-3 text-sm'>
						<p className='mb-1 font-medium'>
							{rejected.length} entité(s) refusée(s) par le serveur
						</p>
						<ul className='space-y-0.5 text-muted-foreground text-xs'>
							{rejected.slice(0, 5).map((r) => (
								<li key={`${r.kind}-${r.legacy_id}`}>
									<span className='font-mono'>{r.legacy_id}</span> — {r.reason}
								</li>
							))}
							{rejected.length > 5 && (
								<li>… et {rejected.length - 5} autres.</li>
							)}
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
