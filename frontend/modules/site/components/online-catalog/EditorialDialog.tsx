// frontend/modules/site/components/online-catalog/EditorialDialog.tsx
//
// L'éditeur des textes du site a deux sorties, choisies par l'appelant : sans
// `onApply`, `/site/catalogue` écrit directement dans PocketBase ; avec
// `onApply`, la fiche produit récupère le texte et reste seule responsable de
// l'enregistrement. Le dialogue, la validation et Gemini restent uniques.
//
// Un dialogue et non un champ en ligne dans la carte : une description peut
// faire 20 000 caractères (catalog_v2.go), et la grille montre le catalogue
// « comme le site le montrera ». Y glisser des zones de saisie détruirait
// justement ce qu'elle sert à voir.
//
// Le prix, le stock et le statut n'y figurent pas, et c'est délibéré : ils
// appartiennent à AppStock.

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { HtmlContentEditor } from '@/components/ui/html-content'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { useGenerateProductTitle } from '../../hooks/use-ai-product-title'
import type { EditableKind } from '../../hooks/use-catalog-editorial'
import { useUpdateCatalogEditorial } from '../../hooks/use-catalog-editorial'
import {
	DESCRIPTION_MAX,
	NAME_MAX,
	isUnchanged,
	validateEditorial,
} from '../../lib/catalog-edit'
import { ProductSheetAssistant } from './ProductSheetAssistant'

/** Ce que l'écran passe à l'éditeur : le strict nécessaire, quel que soit le
 *  genre de l'entité. */
export type EditorialTarget = {
	kind: EditableKind
	id: string
	name: string
	description?: string
	designation?: string
	sku?: string
	brand?: string
	categories?: string[]
}

const LIBELLE: Record<EditableKind, string> = {
	product: 'Produit',
	category: 'Catégorie',
	brand: 'Marque',
}

type Props = {
	target: EditorialTarget | null
	onClose: () => void
	onApply?: (result: { name?: string; description: string }) => void
}

export function EditorialDialog({ target, onClose, onApply }: Props) {
	const update = useUpdateCatalogEditorial()
	const generateTitle = useGenerateProductTitle()
	const [name, setName] = useState('')
	const [description, setDescription] = useState('')
	const [sheetPending, setSheetPending] = useState(false)

	// Le formulaire se recharge à chaque cible : sans cela, ouvrir une seconde
	// fiche montrerait le texte de la première.
	useEffect(() => {
		setName(target?.name ?? '')
		setDescription(target?.description ?? '')
		setSheetPending(false)
	}, [target])

	if (!target) return null

	const isProduct = target.kind === 'product'

	const submit = () => {
		const checked = validateEditorial({
			// Une validation de description seule ne doit même pas renvoyer `name`
			// à PocketBase. Il n'entre dans le patch que si le champ titre a changé.
			name: isProduct && name.trim() !== target.name ? name : undefined,
			description,
		})

		if (!checked.ok) {
			toast.error(checked.error)
			return
		}

		if (isUnchanged(checked.patch, target)) {
			toast.info("Aucune modification : rien n'a été enregistré.")
			onClose()
			return
		}

		if (onApply) {
			onApply({
				name: isProduct ? (checked.patch.name ?? target.name) : undefined,
				description: checked.patch.description,
			})
			toast.success(
				'Texte inséré dans le formulaire de la fiche. Utilise « Enregistrer » pour le conserver.',
			)
			onClose()
			return
		}

		update.mutate(
			{ kind: target.kind, id: target.id, patch: checked.patch },
			{
				onSuccess: () => {
					toast.success(
						'Texte enregistré. La fiche repasse « modifiée » : il reste à ' +
							'l’exporter pour que le site la reçoive.',
					)
					onClose()
				},
				onError: (cause) =>
					toast.error(`Enregistrement refusé : ${cause.message}`),
			},
		)
	}

	const suggestTitle = () => {
		generateTitle.mutate(
			{
				name,
				designation: target.designation,
				sku: target.sku,
				brand: target.brand,
				categories: target.categories,
				currentDescription: description,
			},
			{
				onSuccess: ({ title }) => {
					setName(title)
					toast.success(
						'Titre proposé dans l’assistant. Relis-le avant de valider.',
					)
				},
				onError: (cause) => toast.error(cause.message),
			},
		)
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className={
					isProduct
						? 'h-[94vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-6xl'
						: 'max-h-[94vh] overflow-y-auto sm:max-w-2xl'
				}
			>
				<DialogHeader>
					<DialogTitle>Texte du site — {LIBELLE[target.kind]}</DialogTitle>
					<DialogDescription>
						{onApply
							? 'Le texte validé sera reporté dans le formulaire. Rien ne sera enregistré avant l’enregistrement de la fiche.'
							: 'Ce qui s’écrit ici part vers axemusique.shop au prochain export. Prix, stock et statut se gèrent dans la fiche produit de PocketApp.'}
					</DialogDescription>
				</DialogHeader>

				<div
					className={
						isProduct
							? 'grid min-h-0 gap-5 overflow-y-auto lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:overflow-hidden'
							: 'space-y-4'
					}
				>
					<div className='min-h-0 space-y-4 overflow-y-auto pr-1'>
						{isProduct ? (
							<div className='space-y-1.5'>
								<Label htmlFor='editorial-name'>Titre / nom du produit</Label>
								<div className='flex gap-2'>
									<Input
										id='editorial-name'
										value={name}
										maxLength={NAME_MAX}
										onChange={(event) => setName(event.target.value)}
										placeholder='Ukulélé soprano acajou'
									/>
									<Button
										type='button'
										variant='outline'
										size='icon'
										onClick={suggestTitle}
										disabled={
											generateTitle.isPending ||
											update.isPending ||
											sheetPending
										}
										aria-label='Proposer un titre avec Gemini'
										title='Proposer un titre avec Gemini'
									>
										{generateTitle.isPending ? (
											<Loader2 className='animate-spin' />
										) : (
											<Sparkles />
										)}
									</Button>
								</div>
								<p className='text-muted-foreground text-xs'>
									Valeur unique : ce titre, ou la référence conservée, devient
									le nom officiel dans PocketApp et sur le site.
								</p>
							</div>
						) : (
							<div className='space-y-1.5'>
								<Label>Nom</Label>
								<p className='rounded-md border bg-muted/40 px-3 py-2 text-sm'>
									{target.name}
								</p>
								<p className='text-muted-foreground text-xs'>
									Non modifiable ici : le nom d’une catégorie compose le menu
									publié.
								</p>
							</div>
						)}

						<div className='space-y-1.5'>
							<Label htmlFor='editorial-description'>Description</Label>
							<HtmlContentEditor
								id='editorial-description'
								value={description}
								maxLength={DESCRIPTION_MAX}
								maxHeight={360}
								onChange={setDescription}
								ariaLabel='Description affichée sur le site'
								placeholder='Le texte lu par le visiteur sur la page.'
							/>
							{/* Le plafond du schéma n'est pas un objectif : affiché en
							    permanence, « 0 / 20000 » fait passer une fiche de la bonne
							    taille pour un travail à peine commencé. Il n'apparaît qu'en
							    approche. */}
							<p className='text-right text-muted-foreground text-xs tabular-nums'>
								{description.length > DESCRIPTION_MAX * 0.9
									? `${description.length} / ${DESCRIPTION_MAX}`
									: `${description.length} caractères`}
							</p>
						</div>

						{/* L'avertissement n'est pas décoratif : c'est la contrainte assumée
					    au journal (2026-08-12), et la seule chose qui empêche une
					    campagne éditoriale prématurée. */}
						<p className='rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs'>
							Un rechargement du catalogue (<code>catalog-import -load</code>)
							efface ces saisies : il réécrit les collections depuis NeDB. Tant
							que l’import n’est pas définitif, ce qui est écrit ici est un
							essai.
						</p>
					</div>

					{isProduct && (
						<ProductSheetAssistant
							key={target.id}
							product={target}
							currentName={name}
							currentDescription={description}
							disabled={update.isPending || generateTitle.isPending}
							onPendingChange={setSheetPending}
							onApply={(generatedDescription) => {
								setDescription(generatedDescription)
								toast.success(
									onApply
										? 'Description proposée dans l’assistant. Valide pour la reporter dans la fiche.'
										: 'La description est dans le formulaire. Le titre reste inchangé.',
								)
							}}
						/>
					)}
				</div>

				<DialogFooter className='shrink-0 border-t pt-4'>
					<Button
						variant='outline'
						onClick={onClose}
						disabled={update.isPending || sheetPending}
					>
						Annuler
					</Button>
					<Button
						onClick={submit}
						disabled={
							update.isPending || generateTitle.isPending || sheetPending
						}
					>
						{update.isPending && (
							<Loader2 className='mr-1.5 h-4 w-4 animate-spin' />
						)}
						{onApply ? 'Appliquer à la fiche' : 'Enregistrer'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
