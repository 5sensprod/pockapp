// frontend/modules/site/RestaurationSelectivePage.tsx
// ═══════════════════════════════════════════════════════════════════════════
// RESTAURATION SÉLECTIVE — L'ÉCRAN
// ═══════════════════════════════════════════════════════════════════════════
// Ramener un rangement de catalogue depuis une sauvegarde, SANS toucher à ce
// qui vit dans la base d'un magasin : ventes, tickets, factures, sessions,
// rapports Z, stock, prix, images.
//
// La règle complète, avec ses raisons, est dans `backend/backup/selectif.go`.
//
// ─── CE QUE CET ÉCRAN DOIT FAIRE, ET RIEN DE PLUS ──────────────────────────
// Montrer **la liste de ce qui va changer**, ligne par ligne, en toutes
// lettres. C'est tout.
//
// La première version affichait en plus : cinq badges de compteurs par
// collection, le détail par champ, trois sections repliables, et les
// catégories EN IDENTIFIANTS POCKETBASE — « ["gaavzs5px299owy"] →
// ["gaavzs5px299owy","72c0cbdwld339gj"] ». Elle disait beaucoup et ne
// permettait pas de répondre à la seule question qui compte avant d'écrire :
// « est-ce que MON produit est dans la liste ? » Retour d'usage du
// 7 septembre 2026 — « la page est trop compliquée pour rien », et le doute
// qui va avec.
//
// Donc : une liste, des noms, une phrase par ligne. Les compteurs secondaires
// (identiques, intacts, absents) sont une ligne de texte, et les cas
// particuliers n'apparaissent que s'ils existent.
//
// ─── Ce que l'écran ne calcule PAS ─────────────────────────────────────────
// Rien. Les nombres, les libellés de champs, les noms de catégories et
// « brouillon / publié » viennent tous du Go. Traduire ici, ce serait écrire
// deux fois les mêmes règles — et la seconde est celle qu'on oublie de
// corriger.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
	type FicheChangee,
	type RapportSelectif,
	usePurgerSnapshotsDeTravail,
	useRestaurationSelective,
} from '@/lib/queries/restauration-selective'
import {
	type SnapshotDistant,
	useBackupStatus,
	useRemoteSnapshots,
} from '@/lib/queries/secrets'
import {
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	Eraser,
	Loader2,
	RefreshCw,
} from 'lucide-react'

export function RestaurationSelectivePage() {
	const { data: status } = useBackupStatus()
	const distants = useRemoteSnapshots(!!status?.super_configured)
	const restaurer = useRestaurationSelective()
	const purger = usePurgerSnapshotsDeTravail()

	const [choisi, setChoisi] = useState<SnapshotDistant | null>(null)
	const [avecMenu, setAvecMenu] = useState(false)
	const [rapport, setRapport] = useState<RapportSelectif | null>(null)

	// Le rapport n'est valable que pour le couple (sauvegarde, menu) qui l'a
	// produit. Changer l'un des deux le périme : écrire un écart calculé pour
	// une autre sauvegarde écrirait autre chose que ce qui a été montré.
	const perimer = () => setRapport(null)

	const lancer = async (appliquer: boolean) => {
		if (!choisi) return
		try {
			const res = await restaurer.mutateAsync({
				clientId: choisi.client_id,
				snapshotId: choisi.snapshot_id,
				avecMenu,
				appliquer,
			})
			setRapport(res)
			if (appliquer) {
				toast.success(`${res.ecrites} enregistrement(s) écrit(s)`)
			}
		} catch (e: any) {
			toast.error(e?.message || 'Échec de la restauration sélective')
		}
	}

	if (!status?.super_configured) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<Alert>
					<AlertTriangle className='h-4 w-4' />
					<AlertTitle>Clé super-admin absente de ce poste</AlertTitle>
					<AlertDescription>
						La liste des sauvegardes n’est lisible qu’avec la clé super-admin.
						Elle se saisit dans{' '}
						<strong>Réglages → Clés API &amp; Secrets</strong>, section
						Sauvegarde.
					</AlertDescription>
				</Alert>
			</div>
		)
	}

	return (
		<div className='container mx-auto max-w-4xl space-y-6 px-6 py-8'>
			<div>
				<h1 className='font-bold text-2xl'>Restauration sélective</h1>
				<p className='text-muted-foreground text-sm'>
					Ramène d’une sauvegarde le <strong>rangement</strong> (catégories), la{' '}
					<strong>publication</strong> et la <strong>désignation</strong> des
					produits, ainsi que le <strong>nom</strong> des catégories. Ni ventes,
					ni prix, ni stock, ni images : ils ne peuvent pas être écrits.
				</p>
			</div>

			{/* ── 1. La sauvegarde ─────────────────────────────────────────── */}
			<Card>
				<CardHeader className='pb-3'>
					<div className='flex items-center justify-between gap-2'>
						<CardTitle className='text-base'>
							Depuis quelle sauvegarde ?
						</CardTitle>
						<Button
							variant='ghost'
							size='sm'
							onClick={() => distants.refetch()}
							disabled={distants.isFetching}
						>
							<RefreshCw
								className={`mr-2 h-4 w-4 ${distants.isFetching ? 'animate-spin' : ''}`}
							/>
							Actualiser
						</Button>
					</div>
				</CardHeader>
				<CardContent className='space-y-3'>
					{distants.isLoading ? (
						<Loader2 className='h-4 w-4 animate-spin' />
					) : distants.error ? (
						<p className='text-amber-600 text-sm'>
							{(distants.error as any).message || 'Inventaire indisponible'}
						</p>
					) : !distants.data?.snapshots?.length ? (
						<p className='text-muted-foreground text-sm'>
							Aucune sauvegarde sur le serveur.
						</p>
					) : (
						<div className='max-h-64 space-y-1 overflow-y-auto'>
							{distants.data.snapshots.map((snap) => {
								// Une clé qui ne correspond pas ne se manifesterait
								// autrement que par « sceau invalide » au déchiffrement.
								const autreCle =
									!!snap.key_fingerprint &&
									!!status?.encryption_fingerprint &&
									snap.key_fingerprint !== status.encryption_fingerprint

								return (
									<label
										key={snap.snapshot_id}
										className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 text-sm hover:bg-muted/50 ${
											choisi?.snapshot_id === snap.snapshot_id
												? 'border-primary bg-muted'
												: ''
										}`}
									>
										<input
											type='radio'
											name='snapshot-selectif'
											checked={choisi?.snapshot_id === snap.snapshot_id}
											onChange={() => {
												setChoisi(snap)
												perimer()
											}}
										/>
										<span className='flex-1'>
											<span className='font-mono text-xs'>
												{snap.snapshot_id}
											</span>
											<span className='block text-muted-foreground text-xs'>
												{snap.client_name} · {snap.origin || 'poste inconnu'} ·{' '}
												{snap.created_at}
												{autreCle && (
													<span className='text-amber-600'>
														{' '}
														· ⚠ autre clé ({snap.key_fingerprint})
													</span>
												)}
											</span>
										</span>
									</label>
								)
							})}
						</div>
					)}

					<label
						htmlFor='restauration-avec-menu'
						className='flex items-start gap-2 text-muted-foreground text-xs'
					>
						<Checkbox
							id='restauration-avec-menu'
							checked={avecMenu}
							onCheckedChange={(v) => {
								setAvecMenu(v === true)
								perimer()
							}}
						/>
						<span>
							Ramener aussi le <strong>menu de navigation</strong> — il se
							remplace en entier, des entrées sont créées et d’autres
							supprimées. C’est le seul geste de cet écran qui le fait.
						</span>
					</label>

					<div className='flex flex-wrap items-center gap-2 pt-1'>
						<Button
							onClick={() => lancer(false)}
							disabled={!choisi || restaurer.isPending}
						>
							{restaurer.isPending ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : (
								<ArrowRight className='mr-2 h-4 w-4' />
							)}
							Voir ce qui va changer
						</Button>
						<Button
							variant='ghost'
							size='sm'
							onClick={async () => {
								const res = await purger.mutateAsync()
								setRapport(null)
								toast.success(
									`${res.deleted} sauvegarde(s) déchiffrée(s) effacée(s)`,
								)
							}}
							disabled={purger.isPending}
							title='Comparer laisse la sauvegarde déchiffrée sur le poste, pour que l’écriture porte sur ce qui a été montré.'
						>
							<Eraser className='mr-2 h-4 w-4' />
							Nettoyer le disque
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* ── 2. Ce qui va changer ─────────────────────────────────────── */}
			{rapport && (
				<CeQuiChange
					rapport={rapport}
					onEcrire={() => lancer(true)}
					enCours={restaurer.isPending}
				/>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------
// LA LISTE — le cœur de l'écran
// ---------------------------------------------------------------------------

function CeQuiChange({
	rapport,
	onEcrire,
	enCours,
}: {
	rapport: RapportSelectif
	onEcrire: () => void
	enCours: boolean
}) {
	const produits = rapport.produits
	const categories = rapport.categories

	// Une seule liste : l'utilisateur cherche SON produit, pas une collection.
	// C'est de la mise en page, pas une règle — les nombres restent ceux du Go.
	const lignes: Array<{ fiche: FicheChangee; ou: string }> = [
		...(categories.exemples ?? []).map((fiche) => ({
			fiche,
			ou: 'catégorie',
		})),
		...(produits.exemples ?? []).map((fiche) => ({ fiche, ou: 'produit' })),
	]

	const total = produits.a_changer + categories.a_changer
	const nonMontres =
		produits.exemples_non_montres + categories.exemples_non_montres
	const menu = rapport.menu
	const menuBouge =
		!!menu && menu.a_creer + menu.a_mettre_a_jour + menu.a_supprimer > 0

	// ── Déjà écrit ────────────────────────────────────────────────────────
	if (!rapport.simulation) {
		return (
			<Alert>
				<CheckCircle2 className='h-4 w-4 text-emerald-600' />
				<AlertTitle>
					{rapport.ecrites === 0
						? 'Rien à écrire — la base n’a pas été touchée'
						: `${rapport.ecrites} enregistrement(s) écrit(s)`}
				</AlertTitle>
				<AlertDescription className='space-y-1 text-xs'>
					{rapport.sauvegarde_avant && (
						<p>
							La base d’avant est ici, complète :{' '}
							<code className='select-all'>{rapport.sauvegarde_avant}</code>
						</p>
					)}
					{rapport.effet_export.produits_a_republier +
						rapport.effet_export.categories_a_republier >
						0 && (
						<p>
							{rapport.effet_export.produits_a_republier} produit(s) et{' '}
							{rapport.effet_export.categories_a_republier} catégorie(s)
							repartiront au prochain export du site.
						</p>
					)}
					{menuBouge && (
						<p>
							Le menu a changé : sur les autres postes, il n’apparaîtra qu’après
							rechargement de la page.
						</p>
					)}
				</AlertDescription>
			</Alert>
		)
	}

	// ── Aucun écart ───────────────────────────────────────────────────────
	if (total === 0 && !menuBouge) {
		return (
			<Alert>
				<CheckCircle2 className='h-4 w-4 text-emerald-600' />
				<AlertTitle>Aucune différence</AlertTitle>
				<AlertDescription className='text-xs'>
					Cette sauvegarde porte le même rangement, la même publication et les
					mêmes désignations que la base actuelle. Rien à ramener.
					{produits.nb_ecartees > 0 && (
						<>
							{' '}
							Voir cependant les {produits.nb_ecartees} fiche(s) écartée(s)
							ci-dessous.
						</>
					)}
				</AlertDescription>
			</Alert>
		)
	}

	return (
		<Card>
			<CardHeader className='pb-3'>
				<CardTitle className='text-base'>
					{total} modification(s) à ramener
				</CardTitle>
				<CardDescription className='text-xs'>
					{produits.a_changer} produit(s), {categories.a_changer} catégorie(s).{' '}
					{produits.identiques} produit(s) déjà identiques,{' '}
					{produits.nb_intactes} présent(s) uniquement ici — laissés intacts.
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-4'>
				{/* La liste, en toutes lettres */}
				<ul className='divide-y rounded-md border text-sm'>
					{lignes.map(({ fiche, ou }) => (
						<li key={`${ou}-${fiche.id}`} className='p-3'>
							<div className='font-medium'>
								{fiche.nom || fiche.id}
								<span className='ml-2 font-normal text-muted-foreground text-xs'>
									{ou}
								</span>
							</div>
							{(fiche.changements ?? []).map((c) => (
								<div key={c.champ} className='text-muted-foreground text-xs'>
									{c.libelle || c.champ} :{' '}
									<span className='line-through'>{c.avant || '—'}</span>{' '}
									<ArrowRight className='inline h-3 w-3' />{' '}
									<span className='text-foreground'>{c.apres || '—'}</span>
								</div>
							))}
						</li>
					))}
				</ul>

				{nonMontres > 0 && (
					<p className='text-muted-foreground text-xs'>
						… et {nonMontres} autre(s) non listée(s) ici. Toutes seront écrites.
					</p>
				)}

				{menuBouge && menu && (
					<p className='text-xs'>
						<strong>Menu</strong> : {menu.a_creer} entrée(s) créée(s),{' '}
						{menu.a_mettre_a_jour} modifiée(s), {menu.a_supprimer} supprimée(s).
					</p>
				)}

				{/* Les cas particuliers, seulement s'ils existent */}
				{produits.nb_ecartees > 0 && (
					<div className='rounded-md border border-amber-500/40 p-3 text-xs'>
						<p className='font-medium text-amber-700'>
							{produits.nb_ecartees} fiche(s) NON écrite(s)
						</p>
						<ul className='mt-1 space-y-0.5 text-muted-foreground'>
							{(produits.ecartees ?? []).map((f) => (
								<li key={f.id}>
									{f.nom || f.id} — {f.motif}
								</li>
							))}
						</ul>
					</div>
				)}

				{produits.nb_absentes_cible > 0 && (
					<p className='text-muted-foreground text-xs'>
						{produits.nb_absentes_cible} produit(s) de la sauvegarde n’existent
						pas dans cette base : ils sont comptés, jamais créés.
					</p>
				)}

				{/* Ce que ça déclenchera vers le site */}
				{rapport.effet_export.produits_a_republier +
					rapport.effet_export.categories_a_republier >
					0 && (
					<p className='text-muted-foreground text-xs'>
						⚠ {rapport.effet_export.produits_a_republier} produit(s) et{' '}
						{rapport.effet_export.categories_a_republier} catégorie(s)
						repartiront au prochain export du site — le rangement et la
						publication entrent dans son empreinte. La désignation, non.
					</p>
				)}

				<Button variant='destructive' onClick={onEcrire} disabled={enCours}>
					{enCours && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
					Écrire ces {total} modification(s)
				</Button>
				<p className='text-muted-foreground text-xs'>
					Une copie complète de la base est déposée avant, horodatée.
				</p>
			</CardContent>
		</Card>
	)
}
