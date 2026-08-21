// frontend/components/ui/image-field.tsx
//
// Le champ image : aperçu, importer, retirer.
//
// La forme vient du logo d'entreprise (`components/layout/CompanyDialog.tsx`),
// qui la portait seul depuis le début. Elle est ici parce que les marques, les
// catégories et les produits en ont désormais besoin : les prochaines
// installations n'auront pas de dossier AppPos d'où importer leurs images.
//
// Ce composant ne connaît aucune base. Il rend un fichier et une intention de
// retrait ; c'est `lib/queries/image-upload.ts` qui sait les envoyer.

import { Button } from '@/components/ui/button'
import {
	type OptimizeOptions,
	optimizeImage,
} from '@/lib/images/optimize-image'
import { cn } from '@/lib/utils'
import { ImagePlus, Loader2, Trash2, Upload, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface ImageFieldProps {
	/** URL de l'image déjà enregistrée, résolue par `pb.files.getUrl`. */
	currentUrl?: string | null
	/** Le fichier choisi, ou `null` s'il n'y en a pas. */
	value: File | null
	onChange: (file: File | null) => void
	/** L'utilisateur a demandé le retrait de l'image enregistrée. */
	removed: boolean
	onRemovedChange: (removed: boolean) => void
	disabled?: boolean
	label?: string
	/**
	 * Réduire et convertir en WebP avant d'appeler `onChange`. OPT-IN : sans
	 * cette prop, le fichier part tel qu'il a été choisi. On ne l'active pas
	 * par défaut parce que le produit reprendra un jour ce composant, et que
	 * sa galerie a ses propres règles de rang et d'empreinte.
	 */
	optimize?: OptimizeOptions
}

const TYPES_ACCEPTES = 'image/jpeg,image/png,image/webp,image/avif'

export function ImageField({
	currentUrl,
	value,
	onChange,
	removed,
	onRemovedChange,
	disabled,
	label = 'Image',
	optimize,
}: ImageFieldProps) {
	const inputRef = useRef<HTMLInputElement>(null)
	const [previewLocal, setPreviewLocal] = useState<string | null>(null)
	const [enCours, setEnCours] = useState(false)
	// Ce qu'on dit à l'utilisateur du gain obtenu. Effacé dès qu'il retire ou
	// rechoisit : un gain affiché sur une autre image est un mensonge.
	const [gain, setGain] = useState<string | null>(null)

	// L'URL d'objet doit être révoquée, sinon le fichier reste en mémoire tant
	// que l'onglet vit — visible sur un dialogue qu'on ouvre vingt fois.
	useEffect(() => {
		if (!value) {
			setPreviewLocal(null)
			return
		}
		const url = URL.createObjectURL(value)
		setPreviewLocal(url)
		return () => URL.revokeObjectURL(url)
	}, [value])

	const apercu = previewLocal ?? (removed ? null : (currentUrl ?? null))

	const choisir = () => inputRef.current?.click()

	const auChangement = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0] ?? null
		// Sans cela, rechoisir le MÊME fichier après un retrait ne déclenche
		// aucun événement : la valeur de l'input n'a pas changé. Fait AVANT
		// l'await, l'élément étant réutilisé entre-temps.
		e.target.value = ''
		if (!file) return

		// Choisir un fichier annule un retrait demandé juste avant.
		onRemovedChange(false)
		setGain(null)

		if (!optimize) {
			onChange(file)
			return
		}

		setEnCours(true)
		try {
			const res = await optimizeImage(file, optimize)
			onChange(res.file)
			if (res.optimized) {
				setGain(
					`${formaterOctets(res.originalBytes)} → ${formaterOctets(res.bytes)}`,
				)
			}
		} finally {
			setEnCours(false)
		}
	}

	// Optimiser une image DÉJÀ EN BASE. Elle n'est jamais passée par le code
	// ci-dessus : l'optimisation se déclenche au choix d'un fichier, et les
	// images importées d'AppPos (4665 fichiers) n'ont rien choisi du tout.
	//
	// On la retélécharge, on la repasse dans le même chemin, et on la propose
	// comme un fichier neuf : rien n'est écrit tant que l'utilisateur n'a pas
	// enregistré. S'il annule le dialogue, l'image d'origine est intacte.
	//
	// ⚠️ Enregistrer change les OCTETS, donc `image_checksum`, donc l'entité
	// repartira au prochain export du miroir. C'est vrai à l'unité et sans
	// conséquence ; c'est pour cela qu'il n'y a PAS de bouton « tout
	// optimiser » — 2412 produits d'un coup, ce sont 1,5 Gio de ré-envoi.
	const optimiserExistante = async () => {
		if (!optimize || !currentUrl) return
		setEnCours(true)
		try {
			const reponse = await fetch(currentUrl)
			if (!reponse.ok) throw new Error(String(reponse.status))
			const blob = await reponse.blob()
			const nom = decodeURIComponent(
				new URL(currentUrl, document.baseURI).pathname.split('/').pop() ||
					'image',
			)
			const res = await optimizeImage(
				new File([blob], nom, { type: blob.type }),
				optimize,
			)
			if (res.optimized) {
				onChange(res.file)
				setGain(
					`${formaterOctets(res.originalBytes)} → ${formaterOctets(res.bytes)}`,
				)
			} else {
				// Dire « rien à gagner » plutôt que ne rien faire : sans message,
				// un bouton qui ne réagit pas passe pour cassé.
				setGain('déjà optimale, rien à gagner')
			}
		} catch {
			setGain('échec — réimporte le fichier à la main')
		} finally {
			setEnCours(false)
		}
	}

	const retirer = () => {
		onChange(null)
		setGain(null)
		// On ne marque le retrait que s'il y avait quelque chose à retirer en
		// base : abandonner un fichier jamais enregistré n'est pas un retrait.
		onRemovedChange(!!currentUrl)
	}

	return (
		<div className='space-y-2'>
			<span className='font-medium text-sm'>{label}</span>
			<div className='flex items-center gap-4'>
				<button
					type='button'
					className={cn(
						'relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed',
						'cursor-pointer bg-muted/50 transition-colors hover:bg-muted/80',
						apercu && 'border-primary/30 border-solid',
					)}
					onClick={choisir}
					disabled={disabled || enCours}
				>
					{enCours ? (
						<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
					) : apercu ? (
						<img
							src={apercu}
							alt={label}
							className='h-full w-full object-contain'
						/>
					) : (
						<ImagePlus className='h-8 w-8 text-muted-foreground' />
					)}
				</button>

				<div className='flex flex-col gap-2'>
					<input
						ref={inputRef}
						type='file'
						accept={TYPES_ACCEPTES}
						onChange={auChangement}
						className='hidden'
						disabled={disabled}
					/>
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={choisir}
						disabled={disabled || enCours}
					>
						<Upload className='mr-2 h-4 w-4' />
						{apercu ? 'Changer' : 'Importer'}
					</Button>
					{optimize && currentUrl && !value && !removed && (
						<Button
							type='button'
							variant='outline'
							size='sm'
							onClick={optimiserExistante}
							disabled={disabled || enCours}
						>
							<Wand2 className='mr-2 h-4 w-4' />
							Optimiser l'existante
						</Button>
					)}
					{apercu && (
						<Button
							type='button'
							variant='ghost'
							size='sm'
							onClick={retirer}
							disabled={disabled || enCours}
							className='text-destructive hover:text-destructive'
						>
							<Trash2 className='mr-2 h-4 w-4' />
							Retirer
						</Button>
					)}
				</div>

				<p className='text-muted-foreground text-xs'>
					JPEG, PNG, WebP ou AVIF.
					<br />
					{optimize ? (
						<>
							Réduite à {optimize.maxSide} px et convertie en WebP.
							{gain && (
								<>
									<br />
									<span className='text-primary'>{gain}</span>
								</>
							)}
						</>
					) : (
						'Servie par PocketBase, pas par AppPos.'
					)}
				</p>
			</div>
		</div>
	)
}

/** « 412 ko », « 1,3 Mo » — pour dire le gain sans faire lire des octets. */
function formaterOctets(n: number): string {
	if (n < 1024) return `${n} o`
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} ko`
	return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}
