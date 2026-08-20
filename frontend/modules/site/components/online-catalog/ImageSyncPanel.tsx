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
	Send,
	XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import type { ImageBearing } from '../../hooks/use-image-sync'
import { type SyncState, aSynchroniser } from '../../lib/catalog-export'
import type { ImageKind } from '../../lib/image-checksum'
import { MAX_ENTITES_PAR_CALCUL } from '../../lib/image-checksum-store'

export type ImageRow = {
	kind: ImageKind
	entity: ImageBearing
	state: SyncState
	/** L'empreinte locale, si elle a été calculée. Sans elle, aucun envoi : on
	 *  n'envoie pas une valeur qu'on n'a pas mesurée. */
	checksum: string | undefined
	/**
	 * L'entité est-elle dans la base SQL du site ?
	 *
	 * Rien à voir avec l'état de ses IMAGES : c'est la ligne elle-même. Les
	 * images en sont un ÉTAT, pas une entité à part — sans la ligne, le miroir
	 * refuse en 409. Et toutes les catégories n'y sont pas : une catégorie ne
	 * part qu'avec le premier produit qui la cite.
	 *
	 * `undefined` = l'inventaire d'entités n'a pas été lu. On ne sait pas, ce
	 * qui n'est pas la même chose que savoir que non.
	 */
	online?: boolean
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
	/** Reçoit les lignes de la nature affichée, pas toutes : le filtre décide
	 *  de ce qu'on mesure, et mesurer LIT les octets. */
	onCompute: (rows: ImageRow[]) => void
	onRefresh: () => void
	/** Envoie tout ce qui est passé, une entité après l'autre. */
	onSendAll: (rows: ImageRow[]) => void
	/** Avancement du lot en cours, `null` s'il n'y en a pas. */
	sendAllProgress: { done: number; total: number } | null
	onCancelSendAll: () => void
	/** L'espace du mutualisé, tel que l'inventaire le rend. `null` ou absent
	 *  quand l'hébergeur a désactivé `disk_free_space`. */
	disk?: { freeBytes: number | null; totalBytes: number | null } | null
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

/**
 * Le filtre par NATURE.
 *
 * L'onglet mêlait 2674 fiches — 225 marques, 36 catégories, 2412 produits —
 * sans les distinguer, et son bouton unique proposait de comparer 4394 images
 * d'un coup. Or les trois natures n'ont rien à voir : les marques et les
 * catégories sont 261 fiches et 57 Mio, le premier livrable du miroir, qu'on
 * veut envoyer d'un geste ; les produits sont 1,503 Gio, qu'on envoie à la
 * pièce depuis leur carte.
 *
 * `all` reste en tête parce que c'est l'état de départ le moins surprenant,
 * mais ce n'est PAS le mode de travail : on choisit une nature, puis on agit.
 */
const NATURES = [
	{ cle: 'all' as const, texte: 'Toutes' },
	{ cle: 'brands' as const, texte: 'Marques' },
	{ cle: 'categories' as const, texte: 'Catégories' },
	{ cle: 'products' as const, texte: 'Produits' },
]

type Nature = (typeof NATURES)[number]['cle']

/**
 * Des octets lisibles. Utilisé UNIQUEMENT pour l'espace disque, qui est une
 * mesure réelle rendue par le serveur — jamais pour estimer le poids d'un lot,
 * que le front ne connaît pas : il a des URL, pas des tailles de fichiers.
 */
function lisible(octets: number): string {
	if (octets >= 1024 ** 3) return `${(octets / 1024 ** 3).toFixed(1)} Gio`
	if (octets >= 1024 ** 2) return `${Math.round(octets / 1024 ** 2)} Mio`
	return `${Math.round(octets / 1024)} Kio`
}

/** L'état « la ligne n'existe pas encore côté site ». Il précède les trois
 *  autres : tant qu'il tient, l'état des images ne veut rien dire. */
const HORS_LIGNE = {
	texte: 'À exporter d’abord',
	classe: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
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
	onCancel,
	onSendAll,
	sendAllProgress,
	onCancelSendAll,
	disk,
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

	// ── La nature affichée ──────────────────────────────────────────────────
	// Tout ce qui suit — décomptes, comparaison, envoi en lot — porte sur elle
	// et sur elle seule. C'est le point : un bouton doit dire ce qu'il fait,
	// et « comparer 4394 images » ne le disait pas.
	const [nature, setNature] = useState<Nature>('all')

	const parNature = useMemo(
		() => (nature === 'all' ? rows : rows.filter((row) => row.kind === nature)),
		[rows, nature],
	)

	const comptes = useMemo(() => {
		const map = new Map<Nature, number>([['all', rows.length]])
		for (const row of rows) map.set(row.kind, (map.get(row.kind) ?? 0) + 1)
		return map
	}, [rows])

	const compte = (state: SyncState) =>
		parNature.filter((row) => row.state === state).length
	const empreintesConnues = parNature.some((row) => row.checksum !== undefined)
	const fichiers = parNature.reduce(
		(total, row) => total + row.entity.images.length,
		0,
	)
	const visibles = parNature.slice(0, MAX_LIGNES_AFFICHEES)

	/**
	 * Ce que l'envoi en lot enverrait : la nature affichée, moins ce qui est
	 * déjà à jour, moins ce qu'on n'a pas mesuré.
	 *
	 * Écarter « à jour » n'est pas une optimisation de confort : renvoyer les
	 * 36 catégories déjà en ligne, c'est 36,3 Mio sur le mutualisé pour aboutir
	 * au même état. L'envoi reste idempotent — on peut le refaire à la pièce —
	 * mais le lot ne le fait pas pour rien.
	 *
	 * Écarter le non mesuré est une règle, pas une commodité : on n'envoie
	 * jamais une empreinte qu'on n'a pas calculée.
	 */
	const aEnvoyer = useMemo(() => aSynchroniser(parNature), [parNature])

	/** Ce qui ne PEUT pas partir : la ligne n'est pas côté site. Compté à part
	 *  et affiché, parce que le geste qui débloque n'est pas ici — c'est
	 *  l'export de l'entité, dans l'onglet Arborescence. */
	const horsLigne = useMemo(
		() => parNature.filter((row) => row.online === false),
		[parNature],
	)

	/**
	 * Ce qu'il reste vraiment à LIRE. Ce n'est pas `parNature.length` : le cache
	 * persistant rend gratuit tout ce qui a déjà été mesuré et n'a pas bougé.
	 *
	 * Sur 2412 produits, la différence n'est pas cosmétique — c'est elle qui
	 * dit si le prochain clic coûte 190 Mio ou rien du tout, et c'est ce que
	 * doit savoir celui qui clique.
	 */
	const aMesurer = useMemo(
		() => parNature.filter((row) => row.checksum === undefined),
		[parNature],
	)

	const enLot = sendAllProgress !== null

	return (
		<div className='space-y-4'>
			{/* ── La nature d'abord ──────────────────────────────────────────
			    Elle vient AVANT les décomptes et avant les boutons, parce
			    qu'elle décide de ce qu'ils disent. Mélanger 225 marques, 36
			    catégories et 2412 produits dans une seule liste, c'est n'en
			    montrer aucune. */}
			<div className='flex flex-wrap items-center gap-1'>
				{NATURES.map(({ cle, texte }) => (
					<Button
						key={cle}
						size='sm'
						variant={nature === cle ? 'default' : 'ghost'}
						disabled={computing || enLot}
						onClick={() => setNature(cle)}
					>
						{texte}
						<Badge variant='secondary' className='ml-2 tabular-nums'>
							{comptes.get(cle) ?? 0}
						</Badge>
					</Button>
				))}
			</div>

			<Card>
				<CardContent className='flex flex-wrap items-center gap-3 pt-6'>
					<div className='flex flex-1 flex-wrap items-center gap-2 text-sm'>
						<Badge variant='secondary'>{parNature.length} fiches</Badge>
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
						{horsLigne.length > 0 && (
							<Badge className={HORS_LIGNE.classe}>
								{horsLigne.length} à exporter d’abord
							</Badge>
						)}
						{/* ── L'ESPACE DISQUE, ET CE QU'IL NE DIT PAS ────────────────
						    `disk_free_space()` mesure le SYSTÈME DE FICHIERS de
						    l'hébergeur, pas le quota du compte. Mesuré le 20 août 2026 :
						    **356 Tio libres sur 386 Tio** — le disque du mutualisé,
						    partagé entre tous ses clients. Ce n'est pas faux, c'est
						    autre chose.
						    Le §6.4 de la conception peut donc être rayé de ce qu'on
						    croyait résolu : **l'espace réellement disponible reste
						    inconnu**, et PHP n'a aucun moyen de le connaître. Il se lit
						    au panneau de l'hébergeur.
						    Le badge reste, parce que zéro libre resterait un signal ;
						    mais il dit ce qu'il mesure, et refuse de rassurer. */}
						{typeof disk?.freeBytes === 'number' && (
							<Badge
								variant='outline'
								className='tabular-nums'
								title='Espace du système de fichiers de l’hébergeur, partagé entre ses clients. Ce n’est PAS le quota de votre compte, que PHP ne peut pas lire — regardez le panneau de votre hébergement.'
							>
								volume hôte : {lisible(disk.freeBytes)} libres
								{typeof disk.totalBytes === 'number' &&
									` / ${lisible(disk.totalBytes)}`}
							</Badge>
						)}
					</div>

					<div className='flex items-center gap-2'>
						<Button
							variant='outline'
							size='sm'
							onClick={() => onCompute(parNature)}
							disabled={computing || enLot}
						>
							{computing ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : (
								<RefreshCw className='mr-2 h-4 w-4' />
							)}
							{computing
								? `Lecture des images ${computeProgress.done}/${computeProgress.total}`
								: aMesurer.length === 0
									? `Comparer ${parNature.length} fiches`
									: aMesurer.length > MAX_ENTITES_PAR_CALCUL
										? `Lire ${MAX_ENTITES_PAR_CALCUL} fiches (sur ${aMesurer.length} à mesurer)`
										: `Lire ${aMesurer.length} fiches`}
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

						{/* ── L'ENVOI EN LOT ──────────────────────────────────────
						    Le bouton dit COMBIEN il enverra, jamais « tout » : c'est
						    la seule façon d'estimer un geste qui écrit chez
						    l'hébergeur. Il n'apparaît que s'il y a quelque chose à
						    envoyer, et donc jamais avant d'avoir comparé. */}
						{!computing && aEnvoyer.length > 0 && !enLot && (
							<Button size='sm' onClick={() => onSendAll(aEnvoyer)}>
								<Send className='mr-2 h-4 w-4' />
								Envoyer les {aEnvoyer.length} à synchroniser
							</Button>
						)}

						{enLot && sendAllProgress && (
							<>
								<Button size='sm' disabled>
									<Loader2 className='mr-2 h-4 w-4 animate-spin' />
									Envoi {sendAllProgress.done}/{sendAllProgress.total}
								</Button>
								<Button variant='ghost' size='sm' onClick={onCancelSendAll}>
									<XCircle className='mr-2 h-4 w-4' />
									Arrêter
								</Button>
							</>
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

			{horsLigne.length > 0 && (
				<p className='text-muted-foreground text-sm'>
					<strong>
						{horsLigne.length} fiches ne sont pas dans la base du site
					</strong>{' '}
					et ne peuvent pas recevoir d’images : les images sont un état de la
					ligne, pas une entité à part. Une catégorie ne part qu’avec le premier
					produit qui la cite — exportez l’entité depuis l’onglet Arborescence,
					puis revenez. Elles sont exclues de l’envoi en lot.
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
							// L'absence de la LIGNE prime sur l'état des images : dire
							// « jamais envoyée » d'une fiche qu'on ne PEUT pas envoyer
							// invite à un clic qui ne peut que rater.
							const bloquee = row.online === false
							const etiquette = bloquee ? HORS_LIGNE : ETIQUETTES[row.state]

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

				{parNature.length === 0 && (
					<p className='px-3 py-8 text-center text-muted-foreground text-sm'>
						Aucune fiche de la sélection ne porte d’image.
					</p>
				)}

				{parNature.length > visibles.length && (
					<p className='border-t bg-muted/30 px-3 py-3 text-center text-muted-foreground text-sm'>
						{visibles.length} fiches affichées sur {parNature.length}. Affinez
						la sélection — catégorie, marque, ou « à mettre à jour » — pour voir
						les autres.{' '}
						<strong>
							La comparaison et l’envoi, eux, portent sur les {parNature.length}
							.
						</strong>
					</p>
				)}
			</div>
		</div>
	)
}
