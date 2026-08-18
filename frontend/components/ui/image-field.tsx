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
import { cn } from '@/lib/utils'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
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
}: ImageFieldProps) {
	const inputRef = useRef<HTMLInputElement>(null)
	const [previewLocal, setPreviewLocal] = useState<string | null>(null)

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

	const auChangement = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0] ?? null
		if (file) {
			onChange(file)
			// Choisir un fichier annule un retrait demandé juste avant.
			onRemovedChange(false)
		}
		// Sans cela, rechoisir le MÊME fichier après un retrait ne déclenche
		// aucun événement : la valeur de l'input n'a pas changé.
		e.target.value = ''
	}

	const retirer = () => {
		onChange(null)
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
					disabled={disabled}
				>
					{apercu ? (
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
						disabled={disabled}
					>
						<Upload className='mr-2 h-4 w-4' />
						{apercu ? 'Changer' : 'Importer'}
					</Button>
					{apercu && (
						<Button
							type='button'
							variant='ghost'
							size='sm'
							onClick={retirer}
							disabled={disabled}
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
					Servie par PocketBase, pas par AppPos.
				</p>
			</div>
		</div>
	)
}
