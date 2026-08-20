// frontend/modules/site/components/online-catalog/ImageSyncPanel.tsx
//
// LE MIROIR DES IMAGES — marques, catégories et produits, une fiche à la fois.
//
// Premier livrable de PocketSite-docs/16-conception-images.md (§4.4) : un
// bouton par fiche, et la colonne d'état à trois valeurs. 225 marques et
// 36 catégories, soit 57 Mio — de quoi MESURER la vitesse réelle avant
// d'envisager les produits.
//
// Les PRODUITS s'y ajoutent le 20 août 2026, et ils changent une chose : la
// TAILLE. 2412 fiches publiées, 4132 fichiers, 1,503 Gio. Deux conséquences
// visibles ici, et elles ne sont pas décoratives :
//
//   - le tableau est PLAFONNÉ à l'affichage. 2400 lignes de DOM ne se lisent
//     pas plus qu'elles ne s'affichent ; le plafond est dit, pas subi ;
//   - la comparaison est ANNULABLE. Elle lit les octets ; sans arrêt possible,
//     la seule sortie serait de fermer l'écran, ce qui perdrait aussi ce qui a
//     été mesuré.
//
// L'envoi reste manuel et entité par entité. Ce n'est pas un mode dégradé en
// attendant mieux : c'est la seule façon d'observer ce que le mutualisé
// encaisse, ses plafonds PHP n'étant pas mesurés (§6.2) — et 11 produits
// demandent un corps de plus de 8 Mio, le pire à 15,92 Mio.
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
	XCircle,
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
	/** Arrête la comparaison en cours. Ce qui a déjà été mesuré est gardé. */
	onCancel: () => void
	sending: string | null
	sendError: Error | null
	onSend: (row: ImageRow) => void
}

/** Le mot qui va derrière le nom de la fiche. `products` est venu en dernier
 *  et c'est le seul qui porte plusieurs images. */
const LIBELLE_KIND: Record<ImageKind, string> = {
	brands: 'marque',
	categories: 'catégorie',
	products: 'produit',
}

/**
 * Combien de lignes le tableau affiche au plus.
 *
 * Rien à voir avec `MAX_ENTITES_PAR_CALCUL`, qui borne la LECTURE des octets :
 * celui-ci borne le DOM. 2412 lignes s'affichent mal et ne se lisent pas ; le
 * plafond est annoncé sous le tableau, jamais silencieux — un tableau tronqué
 * sans un mot ferait croire qu'une fiche n'existe pas.
 */
const MAX_LIGNES_AFFICHEES = 300

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
	onCancel,
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
	const fichiers = rows.reduce(
		(total, row) => total + row.entity.images.length,
		0,
	)
	const visibles = rows.slice(0, MAX_LIGNES_AFFICHEES)

	return (
		<div className='space-y-4'>
			<Card>
				<CardContent className='flex flex-wrap items-center gap-3 pt-6'>
					<div className='flex flex-1 flex-wrap items-center gap-2 text-sm'>
						<Badge variant='secondary'>{rows.length} fiches</Badge>
						<Badge variant='secondary'>{fichiers} images</Badge>
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

					<div className='flex items-center gap-2'>
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

						{/* Visible SEULEMENT pendant le calcul : un bouton d'arrêt en
						    permanence laisserait croire qu'il y a toujours quelque chose
						    à arrêter. */}
						{computing && (
							<Button variant='ghost' size='sm' onClick={onCancel}>
								<XCircle className='mr-2 h-4 w-4' />
								Arrêter
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Tant que les empreintes locales ne sont pas calculées, l'écran ne
			    peut PAS distinguer « à jour » de « modifié » : il ne sait que ce
			    que le site a. Le dire, plutôt que d'afficher un état faux. */}
			{!empreintesConnues && !computing && (
				<p className='text-muted-foreground text-sm'>
					Les états affichés ne tiennent compte que de la présence en ligne.
					Lancez la comparaison pour savoir lesquelles ont changé depuis leur
					envoi — <strong>elle lit les octets de chaque image</strong>. Les
					fiches déjà mesurées et inchangées sont reconnues sans être relues ;
					les autres se lisent à quelques centaines de kilo-octets pièce.
					Filtrez avant de lancer si la liste est longue.
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
						{visibles.map((row) => {
							const cle = `${row.kind}/${row.entity.legacy_id}`
							const enCours = sending === cle
							const etiquette = ETIQUETTES[row.state]

							return (
								<tr key={cle} className='border-t'>
									<td className='px-3 py-2'>
										<span className='font-medium'>{row.entity.name}</span>
										<span className='ml-2 text-muted-foreground text-xs'>
											{LIBELLE_KIND[row.kind]}
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
						Aucune fiche de la sélection ne porte d’image.
					</p>
				)}

				{rows.length > visibles.length && (
					<p className='border-t bg-muted/30 px-3 py-3 text-center text-muted-foreground text-sm'>
						{visibles.length} fiches affichées sur {rows.length}. Affinez la
						sélection — catégorie, marque, ou « à mettre à jour » — pour voir
						les autres.{' '}
						<strong>La comparaison, elle, porte sur les {rows.length}.</strong>
					</p>
				)}
			</div>
		</div>
	)
}
