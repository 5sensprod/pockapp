// frontend/modules/site/components/online-catalog/ImageSyncPanel.tsx
//
// LE MIROIR DES IMAGES — marques et catégories, une fiche à la fois.
//
// Premier livrable de PocketSite-docs/16-conception-images.md (§4.4) : un
// bouton par fiche, et la colonne d'état à trois valeurs. 225 marques et
// 36 catégories, soit 57 Mio — de quoi MESURER la vitesse réelle avant
// d'envisager les 1,6 Gio de produits.
//
// L'envoi est manuel et entité par entité. Ce n'est pas un mode dégradé en
// attendant mieux : c'est la seule façon d'observer ce que le mutualisé
// encaisse, ses plafonds PHP n'étant pas mesurés (§6.2).
//
// Ce composant ne calcule aucune empreinte et n'appelle aucun réseau
// lui-même : tout arrive par `use-image-sync.ts`.

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
	AlertTriangle,
	CheckCircle2,
	CloudUpload,
	Loader2,
	RefreshCw,
} from 'lucide-react'

import type { ImageBearing } from '../../hooks/use-image-sync'
import type { SyncState } from '../../lib/catalog-export'
import type { ImageKind } from '../../lib/image-checksum'

export type ImageRow = {
	kind: ImageKind
	entity: ImageBearing
	state: SyncState
	/** L'empreinte locale, si elle a été calculée. Sans elle, aucun envoi : on
	 *  n'envoie pas une valeur qu'on n'a pas mesurée. */
	checksum: string | undefined
}

type Props = {
	/** L'inventaire d'images a-t-il pu être lu ? */
	available: boolean
	inventoryError: Error | null
	rows: ImageRow[]
	/** Calcul des empreintes locales — à la demande : il lit les octets. */
	computing: boolean
	computeProgress: { done: number; total: number }
	computeError: string | null
	onCompute: () => void
	onRefresh: () => void
	sending: string | null
	sendError: Error | null
	onSend: (row: ImageRow) => void
}

const ETIQUETTES: Record<SyncState, { texte: string; classe: string }> = {
	absent: { texte: 'Jamais envoyée', classe: 'bg-muted text-muted-foreground' },
	modified: {
		texte: 'À mettre à jour',
		classe:
			'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
	},
	synced: {
		texte: 'À jour',
		classe:
			'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
	},
}

export function ImageSyncPanel({
	available,
	inventoryError,
	rows,
	computing,
	computeProgress,
	computeError,
	onCompute,
	onRefresh,
	sending,
	sendError,
	onSend,
}: Props) {
	// Pas d'inventaire : on ne prétend pas connaître l'état du site. Dire
	// pourquoi vaut mieux qu'afficher trois zéros.
	if (!available) {
		return (
			<Card className='border-dashed'>
				<CardContent className='flex flex-wrap items-center gap-3 pt-6'>
					<AlertTriangle className='h-5 w-5 shrink-0 text-muted-foreground' />
					<div className='flex-1 text-sm'>
						<p className='font-medium'>État des images inconnu</p>
						<p className='text-muted-foreground'>
							{inventoryError
								? inventoryError.message
								: 'L’URL du miroir d’images n’est pas encore réglée (Réglages > Clés API).'}
						</p>
					</div>
					<Button variant='outline' size='sm' onClick={onRefresh}>
						<RefreshCw className='mr-2 h-4 w-4' />
						Réessayer
					</Button>
				</CardContent>
			</Card>
		)
	}

	const compte = (state: SyncState) =>
		rows.filter((row) => row.state === state).length
	const empreintesConnues = rows.some((row) => row.checksum !== undefined)

	return (
		<div className='space-y-4'>
			<Card>
				<CardContent className='flex flex-wrap items-center gap-3 pt-6'>
					<div className='flex flex-1 flex-wrap items-center gap-2 text-sm'>
						<Badge variant='secondary'>{rows.length} fiches</Badge>
						<Badge className={ETIQUETTES.absent.classe}>
							{compte('absent')} jamais envoyées
						</Badge>
						<Badge className={ETIQUETTES.modified.classe}>
							{compte('modified')} à mettre à jour
						</Badge>
						<Badge className={ETIQUETTES.synced.classe}>
							{compte('synced')} à jour
						</Badge>
					</div>

					<Button
						variant='outline'
						size='sm'
						onClick={onCompute}
						disabled={computing}
					>
						{computing ? (
							<Loader2 className='mr-2 h-4 w-4 animate-spin' />
						) : (
							<RefreshCw className='mr-2 h-4 w-4' />
						)}
						{computing
							? `Lecture des images ${computeProgress.done}/${computeProgress.total}`
							: 'Comparer aux images en ligne'}
					</Button>
				</CardContent>
			</Card>

			{/* Tant que les empreintes locales ne sont pas calculées, l'écran ne
			    peut PAS distinguer « à jour » de « modifié » : il ne sait que ce
			    que le site a. Le dire, plutôt que d'afficher un état faux. */}
			{!empreintesConnues && !computing && (
				<p className='text-muted-foreground text-sm'>
					Les états affichés ne tiennent compte que de la présence en ligne.
					Lancez la comparaison pour savoir lesquelles ont changé depuis leur
					envoi — elle lit les octets de chaque image, comptez quelques dizaines
					de secondes.
				</p>
			)}

			{computeError && (
				<p className='text-destructive text-sm'>
					Comparaison interrompue : {computeError}
				</p>
			)}
			{sendError && (
				<p className='text-destructive text-sm'>
					Dernier envoi en échec : {sendError.message}
				</p>
			)}

			<div className='overflow-hidden rounded-lg border'>
				<table className='w-full text-sm'>
					<thead className='bg-muted/50 text-left'>
						<tr>
							<th className='px-3 py-2 font-medium'>Fiche</th>
							<th className='px-3 py-2 font-medium'>Images</th>
							<th className='px-3 py-2 font-medium'>État en ligne</th>
							<th className='px-3 py-2' />
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => {
							const cle = `${row.kind}/${row.entity.legacy_id}`
							const enCours = sending === cle
							const etiquette = ETIQUETTES[row.state]

							return (
								<tr key={cle} className='border-t'>
									<td className='px-3 py-2'>
										<span className='font-medium'>{row.entity.name}</span>
										<span className='ml-2 text-muted-foreground text-xs'>
											{row.kind === 'brands' ? 'marque' : 'catégorie'}
										</span>
									</td>
									<td className='px-3 py-2 tabular-nums'>
										{row.entity.images.length}
									</td>
									<td className='px-3 py-2'>
										<span
											className={cn(
												'inline-flex rounded-full px-2 py-0.5 text-xs',
												etiquette.classe,
											)}
										>
											{etiquette.texte}
										</span>
									</td>
									<td className='px-3 py-2 text-right'>
										<Button
											size='sm'
											variant={row.state === 'synced' ? 'ghost' : 'default'}
											// On n'envoie pas une empreinte qu'on n'a pas calculée :
											// elle est stockée telle quelle côté SQL et sert ensuite
											// de référence. L'inventer serait mentir au site.
											disabled={enCours || row.checksum === undefined}
											title={
												row.checksum === undefined
													? 'Lancez d’abord la comparaison : l’empreinte des images n’est pas calculée'
													: 'Envoyer toutes les images de cette fiche'
											}
											onClick={() => onSend(row)}
										>
											{enCours ? (
												<Loader2 className='mr-2 h-4 w-4 animate-spin' />
											) : row.state === 'synced' ? (
												<CheckCircle2 className='mr-2 h-4 w-4' />
											) : (
												<CloudUpload className='mr-2 h-4 w-4' />
											)}
											{row.state === 'synced' ? 'Renvoyer' : 'Envoyer'}
										</Button>
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>

				{rows.length === 0 && (
					<p className='px-3 py-8 text-center text-muted-foreground text-sm'>
						Aucune marque ni catégorie ne porte d’image.
					</p>
				)}
			</div>
		</div>
	)
}
