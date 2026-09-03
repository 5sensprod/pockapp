// frontend/components/ui/gallery-field.tsx
//
// LES IMAGES D'UN PRODUIT — la principale et la galerie, dans un seul champ.
//
// ── POURQUOI CE COMPOSANT REMPLACE `ImageField` SUR LE PRODUIT ────────────
// `ImageField` a un geste destructeur : « Changer » écrase l'image en place,
// l'ancienne est supprimée du stockage. C'est acceptable pour un logo de
// marque ; ça ne l'est pas ici. La règle du 19 août 2026 dit l'inverse :
// « remplacer l'image principale ne la détruit pas : l'ancienne rejoint la
// galerie », et « supprimer reste possible, mais c'est un geste distinct ».
//
// Il n'est donc pas une variante multiple d'`ImageField` : `image` et
// `gallery` sont deux champs du schéma, et ce composant tient LEUR RELATION.
// `ImageField` reste seul en usage sur les marques et les catégories, dont le
// schéma ne porte qu'un fichier (`imageFileOptions(1)`).
//
// ── LE MODÈLE : TOUT ENTRE PAR LA GALERIE, LA PRINCIPALE SE DÉSIGNE ───────
// C'est la forme des logiciels de vente modernes — une liste ordonnée de
// médias, plus une vedette désignée. Elle a ici une seconde raison, mesurée :
// PocketBase ne sait pas déplacer un fichier d'un champ à l'autre par l'API
// REST (`forms/record_upsert.go:428-435`, refus « unknown filenames » couvert
// par `backend/routes/product_image_test.go`). Un fichier importé rejoint donc
// la galerie, et « Définir comme principale » appelle la route serveur.
//
// Conséquence assumée, et dite à l'écran : promouvoir ET supprimer la
// principale sont IMMÉDIATS, ils ne passent pas par « Enregistrer ». Les
// ajouts, retraits et déplacements de la galerie, eux, partent avec le
// formulaire.
//
// Ce composant ne connaît aucune base : il reçoit des URL déjà résolues par
// `pb.files.getUrl` et rend une liste. C'est `lib/queries/image-upload.ts` qui
// sait l'envoyer, et `lib/queries/gallery-order.ts` qui tient l'ordre.

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
	type OptimizeOptions,
	optimizeImage,
} from '@/lib/images/optimize-image'
import { messageRefus, verifierImages } from '@/lib/images/verifier-image'
import {
	type GalleryEntry,
	MAX_GALERIE,
	ajouter,
	deplacer,
	estPromouvable,
	nomEntree,
	retirer,
} from '@/lib/queries/gallery-order'
import { cn } from '@/lib/utils'
import {
	ArrowLeft,
	ArrowRight,
	ImagePlus,
	Star,
	Trash2,
	Upload,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const TYPES_ACCEPTES = 'image/jpeg,image/png,image/webp,image/avif'

// La clé de rendu ne peut pas être le rang : réordonner ferait suivre l'état
// de React à la POSITION et non à l'image, et les aperçus sauteraient d'une
// vignette à l'autre. Un nom de fichier en base est unique — PocketBase le
// suffixe —, mais deux fichiers choisis au disque peuvent porter le même nom :
// on leur attache une identité stable, liée à l'objet lui-même.
const identites = new WeakMap<File, string>()
let compteur = 0

function cleEntree(entree: GalleryEntry): string {
	if (typeof entree === 'string') return entree
	let cle = identites.get(entree)
	if (!cle) {
		compteur += 1
		cle = `neuf-${compteur}`
		identites.set(entree, cle)
	}
	return cle
}

interface GalleryFieldProps {
	/** L'image principale enregistrée, résolue par `pb.files.getUrl`. */
	mainUrl?: string | null
	/** La galerie en cours d'édition. */
	value: GalleryEntry[]
	onChange: (entrees: GalleryEntry[]) => void
	/** Rend l'URL d'une entrée DÉJÀ EN BASE. */
	urlDe: (nom: string) => string
	/** Promouvoir une entrée enregistrée. Absent = produit pas encore créé. */
	onPromote?: (nom: string) => void
	promoting?: boolean
	/** Désigner une image PAS ENCORE ENVOYÉE comme principale. Le geste ne peut
	 *  pas partir tout de suite — la route serveur ne sait désigner qu'un nom de
	 *  fichier existant —, il attend donc « Enregistrer » comme le reste de la
	 *  galerie. Absent = seules les images déjà en base sont promouvables. */
	onDesignateMain?: (entree: GalleryEntry) => void
	/** L'entrée désignée principale et pas encore enregistrée. */
	pendingMain?: GalleryEntry | null
	/** Supprimer définitivement la principale. Absent = produit pas encore créé. */
	onRemoveMain?: () => void
	removingMain?: boolean
	disabled?: boolean
	/** Réduit et convertit en WebP chaque fichier choisi, comme le fait
	 *  `ImageField` sur les marques et les catégories. Absent = le fichier part
	 *  tel quel — et c'est ce qui exposait la galerie produit aux refus de MIME
	 *  du serveur (voir `auChangement`). */
	optimize?: OptimizeOptions
}

export function GalleryField({
	mainUrl,
	value,
	onChange,
	urlDe,
	onPromote,
	promoting,
	onDesignateMain,
	pendingMain,
	onRemoveMain,
	removingMain,
	disabled,
	optimize,
}: GalleryFieldProps) {
	const inputRef = useRef<HTMLInputElement>(null)
	const [confirmationSuppression, setConfirmationSuppression] = useState(false)
	const [survol, setSurvol] = useState(false)

	// Les aperçus locaux : une URL d'objet par fichier neuf, révoquée à la
	// sortie. Sans révocation, le fichier reste en mémoire tant que l'onglet
	// vit — le défaut déjà corrigé sur `ImageField`.
	const [apercus, setApercus] = useState<Map<File, string>>(new Map())

	useEffect(() => {
		const carte = new Map<File, string>()
		for (const entree of value) {
			if (entree instanceof File) carte.set(entree, URL.createObjectURL(entree))
		}
		setApercus(carte)
		return () => {
			for (const url of carte.values()) URL.revokeObjectURL(url)
		}
	}, [value])

	const choisir = () => inputRef.current?.click()

	// Le pipeline d'entrée, partagé par le sélecteur de fichiers ET par le
	// glisser-déposer : un fichier lâché sur la zone doit passer exactement les
	// mêmes contrôles que celui choisi au clic.
	const accepter = async (fichiers: File[]) => {
		if (fichiers.length === 0) return

		// ⚠️ Une extension n'est pas un format. `accept` et `file.type` se
		// déduisent tous deux du NOM du fichier : un HEIC renommé `.png` passe
		// les deux et n'échoue qu'au serveur, avec un message d'API portant un
		// nom de fichier que l'utilisateur n'a jamais vu (25 août 2026). On
		// décode ici pour pouvoir le dire en français, tout de suite.
		const { lisibles, refuses } = await verifierImages(fichiers)

		if (refuses.length > 0) toast.error(messageRefus(refuses))
		if (lisibles.length === 0) return

		// ── LA CONVERSION EST AUSSI CE QUI REND LE FICHIER ACCEPTABLE ────────
		// Elle n'est pas qu'une affaire de poids. Marques et catégories
		// n'avaient jamais ce refus de MIME parce que leur `ImageField` porte un
		// `optimize` : le fichier choisi y est décodé puis RÉ-ENCODÉ en WebP, et
		// ce qui part au serveur est un `image/webp` authentique, quels qu'aient
		// été les octets d'entrée. La galerie produit, elle, envoyait l'original
		// tel quel — d'où un « .png » qui n'en était pas, refusé ici et nulle
		// part ailleurs (25 août 2026).
		//
		// ⚠️ `optimizeImage` rend TOUJOURS un fichier utilisable, l'original
		// compris quand la conversion n'a pas lieu d'être (déjà plus léger) ou
		// n'aboutit pas. Ce n'est donc pas une garantie : c'est ce qui ferme le
		// cas courant. La validation serveur reste l'autorité.
		const aAjouter = optimize
			? await Promise.all(
					lisibles.map(async (fichier) => {
						const res = await optimizeImage(fichier, optimize)
						return res.file
					}),
				)
			: lisibles

		// Les fichiers valides du même lot entrent quand même : refuser les huit
		// pour un seul fautif obligerait à tout rechoisir.
		onChange(ajouter(value, aAjouter))
	}

	const auChangement = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const fichiers = Array.from(e.target.files ?? [])
		// Sans cela, rechoisir le MÊME fichier ne déclenche aucun événement.
		// Fait AVANT l'attente : l'input est réutilisable pendant la
		// vérification, et `e.target` ne survivrait pas à l'`await`.
		e.target.value = ''
		await accepter(fichiers)
	}

	const plein = value.length >= MAX_GALERIE

	// La désignation en attente prime sur l'image enregistrée : c'est elle qui
	// sera principale après « Enregistrer », et l'écran doit le montrer plutôt
	// que d'afficher une vedette que l'utilisateur vient de remplacer.
	const attenteUrl =
		pendingMain instanceof File ? apercus.get(pendingMain) : undefined
	const vedetteUrl = attenteUrl ?? mainUrl

	const restant = MAX_GALERIE - value.length

	return (
		<div className='space-y-4'>
			{/* ── LA VEDETTE, EN GRAND ─────────────────────────────────────────
			    Elle occupe une tuile à part, plus large que les autres : c'est
			    l'image que le site affichera en tête de page, et la hiérarchie de
			    l'écran doit dire la même chose que celle du catalogue. */}
			<div className='flex gap-4'>
				<figure className='w-40 shrink-0 space-y-1.5'>
					<div
						className={cn(
							'group relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border-2 bg-muted/20',
							vedetteUrl ? 'border-primary/60' : 'border-dashed',
							attenteUrl && 'border-dashed border-primary',
						)}
					>
						{vedetteUrl ? (
							<img
								src={vedetteUrl}
								alt='Vue principale du produit'
								className='h-full w-full object-contain'
							/>
						) : (
							<div className='px-3 text-center text-muted-foreground'>
								<ImagePlus className='mx-auto h-7 w-7' />
								<p className='mt-1.5 text-xs'>Aucune image principale</p>
							</div>
						)}

						<span className='absolute top-2 left-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 font-medium text-[11px] text-primary-foreground shadow-sm'>
							<Star className='h-3 w-3 fill-current' />
							{attenteUrl ? 'À enregistrer' : 'Principale'}
						</span>

						{/* La suppression n'apparaît qu'au survol : c'est un geste
						    définitif, il n'a pas à occuper l'écran en permanence. */}
						{!attenteUrl && mainUrl && onRemoveMain && (
							<Button
								type='button'
								variant='secondary'
								size='icon'
								className='absolute top-1.5 right-1.5 h-7 w-7 opacity-0 shadow-sm transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100'
								title='Supprimer définitivement l’image principale'
								aria-label='Supprimer définitivement l’image principale'
								disabled={disabled || removingMain}
								onClick={() => setConfirmationSuppression(true)}
							>
								<Trash2 className='h-3.5 w-3.5' />
							</Button>
						)}
					</div>
					<figcaption className='text-center text-muted-foreground text-xs'>
						{attenteUrl
							? 'Sera la vedette après enregistrement'
							: 'Affichée en tête de la fiche en ligne'}
					</figcaption>
				</figure>

				{/* ── LA ZONE D'IMPORT ────────────────────────────────────────────
				    Cliquable ET réceptive au glisser-déposer, le second passant par
				    exactement les mêmes contrôles que le premier (`accepter`). */}
				<button
					type='button'
					onClick={choisir}
					disabled={disabled || plein}
					onDragOver={(e) => {
						if (disabled || plein) return
						e.preventDefault()
						setSurvol(true)
					}}
					onDragLeave={() => setSurvol(false)}
					onDrop={(e) => {
						e.preventDefault()
						setSurvol(false)
						if (disabled || plein) return
						void accepter(Array.from(e.dataTransfer.files))
					}}
					className={cn(
						'flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
						survol
							? 'border-primary bg-primary/5'
							: 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40',
						(disabled || plein) &&
							'cursor-not-allowed opacity-60 hover:border-muted-foreground/25 hover:bg-transparent',
					)}
				>
					<span className='flex h-10 w-10 items-center justify-center rounded-full bg-muted'>
						<Upload className='h-4 w-4 text-muted-foreground' />
					</span>
					<span className='font-medium text-sm'>
						{plein ? 'Galerie pleine' : 'Glissez vos photos ici'}
					</span>
					<span className='text-muted-foreground text-xs'>
						{plein
							? `${MAX_GALERIE} images au maximum.`
							: `ou cliquez pour parcourir · JPEG, PNG, WebP, AVIF · ${restant} restante${restant > 1 ? 's' : ''}`}
					</span>
				</button>
			</div>

			{/* ── LA GALERIE ──────────────────────────────────────────────────
			    Une grille de tuiles carrées ; les gestes se posent EN SURIMPRESSION
			    au survol plutôt qu'en trois rangées de boutons sous chaque
			    vignette. Ils restent atteignables au clavier (`focus-within`). */}
			{value.length > 0 && (
				<div>
					<div className='mb-2 flex items-baseline justify-between gap-2'>
						<span className='font-medium text-sm'>Galerie</span>
						<span className='text-muted-foreground text-xs'>
							{value.length}/{MAX_GALERIE} · l’ordre est celui du site
						</span>
					</div>

					<div className='grid grid-cols-3 gap-3 sm:grid-cols-4'>
						{value.map((entree, index) => {
							const nom = nomEntree(entree)
							// Une chaîne vide dans `<img src>` recharge la page courante :
							// on ne rend l'image que quand l'URL existe vraiment.
							const url =
								entree instanceof File
									? apercus.get(entree)
									: urlDe(nom) || undefined

							// Deux gestes derrière un seul bouton, et deux temporalités :
							// une image EN BASE se promeut tout de suite par la route
							// serveur ; une image tout juste choisie n'a pas encore de nom
							// de fichier, elle ne peut qu'être DÉSIGNÉE et attendre
							// l'enregistrement. Sans cette seconde voie il fallait
							// enregistrer une première fois pour pouvoir changer la
							// vedette — signalé à l'usage.
							const enBase = estPromouvable(entree)
							const designable = !enBase && Boolean(onDesignateMain)
							const designee = pendingMain === entree

							return (
								<figure
									key={cleEntree(entree)}
									className='group relative aspect-square overflow-hidden rounded-lg border bg-muted/20 focus-within:ring-2 focus-within:ring-ring'
								>
									{url ? (
										<img
											src={url}
											alt={nom}
											className='h-full w-full object-contain'
										/>
									) : (
										<div className='flex h-full items-center justify-center'>
											<ImagePlus className='h-5 w-5 text-muted-foreground' />
										</div>
									)}

									<span className='absolute top-1.5 left-1.5 rounded bg-background/85 px-1.5 font-medium text-[11px] tabular-nums shadow-sm'>
										{index + 1}
									</span>
									{entree instanceof File && (
										<span className='absolute top-1.5 right-1.5 rounded bg-amber-500/90 px-1.5 font-medium text-[11px] text-white shadow-sm'>
											Nouvelle
										</span>
									)}

									<div className='absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-gradient-to-t from-background/95 to-background/0 p-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100'>
										<Button
											type='button'
											variant='ghost'
											size='icon'
											className='h-7 w-7'
											title='Déplacer vers la gauche'
											aria-label='Déplacer vers la gauche'
											disabled={disabled || index === 0}
											onClick={() =>
												onChange(deplacer(value, index, index - 1))
											}
										>
											<ArrowLeft className='h-3.5 w-3.5' />
										</Button>
										<Button
											type='button'
											variant={designee ? 'default' : 'ghost'}
											size='icon'
											className='h-7 w-7'
											title={
												designee
													? 'Deviendra l’image principale à l’enregistrement'
													: enBase
														? 'Définir comme image principale (tout de suite)'
														: designable
															? 'Définir comme image principale (à l’enregistrement)'
															: 'Enregistrez d’abord : cette image n’est pas encore en base'
											}
											aria-label='Définir comme image principale'
											disabled={
												disabled ||
												promoting ||
												designee ||
												(enBase ? !onPromote : !designable)
											}
											onClick={() => {
												if (enBase) onPromote?.(entree)
												else onDesignateMain?.(entree)
											}}
										>
											<Star
												className={cn(
													'h-3.5 w-3.5',
													designee && 'fill-current',
												)}
											/>
										</Button>
										<Button
											type='button'
											variant='ghost'
											size='icon'
											className='h-7 w-7'
											title='Déplacer vers la droite'
											aria-label='Déplacer vers la droite'
											disabled={disabled || index === value.length - 1}
											onClick={() =>
												onChange(deplacer(value, index, index + 1))
											}
										>
											<ArrowRight className='h-3.5 w-3.5' />
										</Button>
										<Button
											type='button'
											variant='ghost'
											size='icon'
											className='h-7 w-7 text-destructive hover:text-destructive'
											title='Retirer cette image du produit'
											aria-label='Retirer cette image du produit'
											disabled={disabled}
											onClick={() => onChange(retirer(value, index))}
										>
											<Trash2 className='h-3.5 w-3.5' />
										</Button>
									</div>
								</figure>
							)
						})}
					</div>
				</div>
			)}

			{value.length === 0 && (
				<p className='text-muted-foreground text-xs'>
					Aucune image secondaire. Importez-en pour composer la galerie — et
					pour pouvoir changer l’image principale sans détruire l’actuelle.
				</p>
			)}

			<input
				ref={inputRef}
				type='file'
				accept={TYPES_ACCEPTES}
				multiple
				onChange={auChangement}
				className='hidden'
				disabled={disabled}
			/>

			{/* LES DEUX TEMPORALITÉS. Elles ne se devinent pas, et les confondre a
			    produit un enregistrement refusé. */}
			<p className='rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground text-xs leading-relaxed'>
				<strong className='text-foreground'>
					Sur une image déjà enregistrée, « principale » et la suppression
					s’appliquent tout de suite.
				</strong>{' '}
				Promouvoir ne supprime rien ; supprimer est définitif après
				confirmation. Les imports, retraits et déplacements attendent «
				Enregistrer ».
			</p>

			<AlertDialog
				open={confirmationSuppression}
				onOpenChange={setConfirmationSuppression}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Supprimer l’image principale ?</AlertDialogTitle>
						<AlertDialogDescription>
							Le fichier sera supprimé définitivement du stockage, tout de
							suite, sans attendre « Enregistrer ». La galerie reste strictement
							intacte et aucune de ses images n’est promue automatiquement.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Conserver l’image</AlertDialogCancel>
						<AlertDialogAction
							className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
							disabled={removingMain}
							onClick={onRemoveMain}
						>
							Supprimer définitivement
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
