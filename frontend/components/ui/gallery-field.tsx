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
	onRemoveMain,
	removingMain,
	disabled,
	optimize,
}: GalleryFieldProps) {
	const inputRef = useRef<HTMLInputElement>(null)
	const [confirmationSuppression, setConfirmationSuppression] = useState(false)

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

	const auChangement = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const fichiers = Array.from(e.target.files ?? [])
		// Sans cela, rechoisir le MÊME fichier ne déclenche aucun événement.
		// Fait AVANT l'attente : l'input est réutilisable pendant la
		// vérification, et `e.target` ne survivrait pas à l'`await`.
		e.target.value = ''
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

	const plein = value.length >= MAX_GALERIE

	return (
		<div className='space-y-2'>
			<div className='flex items-baseline justify-between gap-2'>
				<span className='font-medium text-sm'>Images</span>
				<span className='text-muted-foreground text-xs'>
					{value.length}/{MAX_GALERIE} en galerie
				</span>
			</div>

			<div className='flex flex-wrap items-start gap-3'>
				{/* L'image principale n'a pas de bouton « Changer » : on importe,
				    puis on désigne. C'est ce qui garantit qu'aucune image n'est
				    écrasée. */}
				<figure className='space-y-1'>
					<div
						className={cn(
							'flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border-2',
							mainUrl
								? 'border-primary border-solid'
								: 'border-dashed bg-muted/50',
						)}
					>
						{mainUrl ? (
							<img
								src={mainUrl}
								alt='Vue principale du produit'
								className='h-full w-full object-contain'
							/>
						) : (
							<ImagePlus className='h-8 w-8 text-muted-foreground' />
						)}
					</div>
					<figcaption className='flex h-6 w-24 items-center justify-center gap-0.5 text-primary text-xs'>
						<span className='flex items-center gap-1'>
							<Star className='h-3 w-3 fill-current' />
							Principale
						</span>
						{mainUrl && onRemoveMain && (
							<Button
								type='button'
								variant='ghost'
								size='icon'
								className='h-6 w-6 shrink-0 text-destructive hover:text-destructive'
								title='Supprimer définitivement l’image principale'
								aria-label='Supprimer définitivement l’image principale'
								disabled={disabled || removingMain}
								onClick={() => setConfirmationSuppression(true)}
							>
								<Trash2 className='h-3 w-3' />
							</Button>
						)}
					</figcaption>
				</figure>

				{value.map((entree, index) => {
					const nom = nomEntree(entree)
					// Une chaîne vide dans `<img src>` recharge la page courante :
					// on ne rend l'image que quand l'URL existe vraiment.
					const url =
						entree instanceof File
							? apercus.get(entree)
							: urlDe(nom) || undefined

					return (
						<figure key={cleEntree(entree)} className='space-y-1'>
							<div className='flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border bg-muted/30'>
								{url ? (
									<img
										src={url}
										alt={nom}
										className='h-full w-full object-contain'
									/>
								) : (
									<ImagePlus className='h-6 w-6 text-muted-foreground' />
								)}
							</div>

							{/* Le geste principal est NOMMÉ, les autres sont des icônes :
							    « définir comme principale » n'était pas trouvable sous une
							    étoile muette — signalé à l'usage le 19 août 2026. */}
							<Button
								type='button'
								variant='outline'
								size='sm'
								className='h-6 w-24 px-1 text-xs'
								title={
									estPromouvable(entree)
										? 'Devient l’image principale tout de suite'
										: 'Enregistrez d’abord : cette image n’est pas encore en base'
								}
								disabled={
									disabled || promoting || !onPromote || !estPromouvable(entree)
								}
								onClick={() => estPromouvable(entree) && onPromote?.(entree)}
							>
								<Star className='mr-1 h-3 w-3' />
								Principale
							</Button>

							<div className='flex items-center justify-center gap-0.5'>
								<Button
									type='button'
									variant='ghost'
									size='icon'
									className='h-6 w-6'
									title='Déplacer vers la gauche'
									disabled={disabled || index === 0}
									onClick={() => onChange(deplacer(value, index, index - 1))}
								>
									<ArrowLeft className='h-3 w-3' />
								</Button>
								<span className='text-muted-foreground text-xs tabular-nums'>
									{index + 1}
								</span>
								<Button
									type='button'
									variant='ghost'
									size='icon'
									className='h-6 w-6'
									title='Déplacer vers la droite'
									disabled={disabled || index === value.length - 1}
									onClick={() => onChange(deplacer(value, index, index + 1))}
								>
									<ArrowRight className='h-3 w-3' />
								</Button>
								<Button
									type='button'
									variant='ghost'
									size='icon'
									className='h-6 w-6 text-destructive hover:text-destructive'
									title='Retirer cette image du produit'
									disabled={disabled}
									onClick={() => onChange(retirer(value, index))}
								>
									<Trash2 className='h-3 w-3' />
								</Button>
							</div>
						</figure>
					)
				})}
			</div>

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

			<div className='flex items-center gap-3'>
				<Button
					type='button'
					variant='outline'
					size='sm'
					onClick={choisir}
					disabled={disabled || plein}
				>
					<Upload className='mr-2 h-4 w-4' />
					Importer
				</Button>
				<div className='space-y-0.5 text-muted-foreground text-xs'>
					<p>
						{plein
							? `Galerie pleine : ${MAX_GALERIE} images au maximum.`
							: 'JPEG, PNG, WebP ou AVIF. Une image importée se place en fin de galerie.'}
					</p>
					{/* LES DEUX TEMPORALITÉS. Elles ne se devinent pas, et les
					    confondre a produit un enregistrement refusé. */}
					<p>
						<strong>
							« Principale » et sa suppression s’appliquent tout de suite.
						</strong>{' '}
						Promouvoir ne supprime rien. Supprimer est définitif après
						confirmation. Les ajouts, retraits et déplacements de la galerie
						attendent « Enregistrer ».
					</p>
				</div>
			</div>

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
