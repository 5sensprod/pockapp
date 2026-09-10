// frontend/modules/site/components/MenuEntryDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════
// FORMULAIRE D'UNE ENTRÉE DE MENU  (ticket 4)
// ═══════════════════════════════════════════════════════════════════════════
// Création et modification d'une entrée. Écrit dans `site_menu`, rien d'autre.
//
// On y saisit un libellé, la visibilité, et une destination parmi deux :
// « sous-menu » ou « adresse saisie à la main ». La résolution en URL a lieu à
// la publication, au ticket 6 (§3 du contrat).
//
// ─── Ce qui a été retiré le 10 septembre 2026 ─────────────────────────────
// **La liste déroulante des catégories.** 460 noms à plat, triés par ordre
// alphabétique, avec leurs homonymes : on y choisissait la mauvaise catégorie,
// et c'est arrivé. Une entrée de catégorie se crée désormais en glissant la
// catégorie depuis l'arbre de l'éditeur sur un sous-menu (`MenuCategorySource`,
// `categoryDrop`). Ici, elle s'affiche en lecture seule, avec son chemin — ce
// qui distingue deux « Microphones » — et son adresse. En changer, c'est
// supprimer l'entrée et en glisser une autre.
//
// **Marque, produit et page** ne se proposent plus à la création : ce seront
// des fonctionnalités à part. Les marques n'ont de toute façon pas de page sur
// le site (`brandUrl`, `use-menu-destinations.ts`), et les produits posaient le
// même problème de liste à plat que les catégories. Une entrée existante de ces
// types reste lisible, modifiable dans son libellé, et publiable.
// ═══════════════════════════════════════════════════════════════════════════

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type {
	SiteMenuLinkType,
	SiteMenuRecord,
	SiteMenuRefType,
	SiteMenuResponse,
} from '@/lib/queries/site-menu'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Libellés de tous les types de lien, pour l'affichage. */
const LINK_TYPE_LABELS: Record<SiteMenuLinkType, string> = {
	none: 'Aucun lien (porte un sous-menu)',
	manual: 'Adresse saisie à la main',
	category: 'Catégorie du catalogue',
	brand: 'Marque',
	product: 'Produit',
	page: 'Page du site',
}

/** Les types qu'on peut CHOISIR dans ce formulaire. `category` n'y est pas :
 *  une catégorie se glisse depuis l'arbre de l'éditeur. */
const LINK_TYPE_CHOICES: SiteMenuLinkType[] = [
	'none',
	'manual',
	// Fonctionnalités à venir — chacune demandera son propre sélecteur, pas une
	// liste déroulante à plat :
	// 'brand',
	// 'product',
	// 'page',
]

const REF_TYPES: SiteMenuRefType[] = ['category', 'brand', 'product', 'page']

const isRefType = (t: SiteMenuLinkType): t is SiteMenuRefType =>
	(REF_TYPES as SiteMenuLinkType[]).includes(t)

/** Ce que l'éditeur sait de la catégorie d'une entrée existante. */
export interface CategoryTarget {
	/** De la racine à la catégorie. Vide si elle est absente du catalogue. */
	path: string[]
	url: string | null
	/** `null` quand on ne le sait pas encore. */
	online: boolean | null
}

export interface MenuEntryDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Entrée à modifier ; absente en création. */
	entry?: SiteMenuResponse
	/** Libellé du parent, pour situer une création. */
	parentLabel?: string
	/** Renseigné quand `entry` est une entrée de catégorie. */
	categoryTarget?: CategoryTarget
	onSubmit: (data: SiteMenuRecord) => Promise<unknown>
	isSubmitting?: boolean
}

export function MenuEntryDialog({
	open,
	onOpenChange,
	entry,
	parentLabel,
	categoryTarget,
	onSubmit,
	isSubmitting,
}: MenuEntryDialogProps) {
	const [title, setTitle] = useState('')
	const [linkType, setLinkType] = useState<SiteMenuLinkType>('none')
	const [linkUrl, setLinkUrl] = useState('')
	const [visible, setVisible] = useState(true)

	// Réinitialise à chaque ouverture : sans ça, rouvrir le formulaire pour une
	// autre entrée afficherait les valeurs de la précédente.
	useEffect(() => {
		if (!open) return
		setTitle(entry?.title ?? '')
		setLinkType(entry?.link_type ?? 'none')
		setLinkUrl(entry?.link_url ?? '')
		// `visible` est explicitement vrai à la création : le champ n'a pas de
		// valeur par défaut en base (backend/migrations/site_menu.go:105), une
		// entrée créée sans lui naîtrait masquée.
		setVisible(entry ? entry.visible !== false : true)
	}, [open, entry])

	// Une entrée qui pointe vers le catalogue garde sa destination telle quelle :
	// elle ne se modifie plus ici.
	const lockedRef = entry && isRefType(entry.link_type) ? entry : undefined

	const handleLinkTypeChange = (next: SiteMenuLinkType) => {
		setLinkType(next)
		setLinkUrl('')
	}

	const trimmedTitle = title.trim()
	const missingUrl = linkType === 'manual' && !linkUrl.trim()
	const canSubmit = trimmedTitle.length > 0 && !missingUrl && !isSubmitting

	const handleSubmit = async () => {
		if (!canSubmit) return
		await onSubmit({
			title: trimmedTitle,
			link_type: linkType,
			// On n'écrit que le champ que le type rend pertinent, et on vide
			// l'autre : une entrée ne doit pas traîner les restes d'un type
			// précédent, que la publication pourrait relire.
			link_url: linkType === 'manual' ? linkUrl.trim() : '',
			ref_id: lockedRef ? lockedRef.ref_id : '',
			visible,
		})
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>
						{entry ? "Modifier l'entrée" : 'Nouvelle entrée'}
					</DialogTitle>
					<DialogDescription>
						{parentLabel ? `Sous « ${parentLabel} ». ` : ''}
						Pour ajouter une catégorie, la glisser depuis l'arbre sur un
						sous-menu.
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-4 py-2'>
					<div className='space-y-2'>
						<Label htmlFor='menu-title'>Libellé</Label>
						<Input
							id='menu-title'
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder='Guitares'
							maxLength={100}
							autoFocus
						/>
					</div>

					{lockedRef ? (
						<div className='space-y-2'>
							<Label>Destination</Label>
							<div className='space-y-1 rounded-md border bg-muted/30 p-3 text-sm'>
								<p className='text-muted-foreground text-xs'>
									{LINK_TYPE_LABELS[lockedRef.link_type]}
								</p>
								{lockedRef.link_type === 'category' ? (
									<>
										<p className='font-medium'>
											{categoryTarget && categoryTarget.path.length > 0
												? categoryTarget.path.join(' › ')
												: `Absente du catalogue (${lockedRef.ref_id})`}
										</p>
										<p className='text-muted-foreground text-xs'>
											{categoryTarget?.url
												? `Adresse publiée : ${categoryTarget.url}`
												: "Pas d'adresse sur le site : la publication la refusera."}
										</p>
										{categoryTarget?.online === false && (
											<p className='flex items-start gap-1.5 text-amber-700 text-xs dark:text-amber-400'>
												<AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
												Plus aucun produit publié dans cette catégorie : sa page
												n'existe pas sur le site.
											</p>
										)}
									</>
								) : (
									<p className='font-medium'>{lockedRef.ref_id}</p>
								)}
							</div>
							<p className='text-muted-foreground text-xs'>
								Pour changer de destination, supprimer l'entrée et en créer une
								autre.
							</p>
						</div>
					) : (
						<div className='space-y-2'>
							<Label htmlFor='menu-link-type'>Destination</Label>
							<Select
								value={linkType}
								onValueChange={(v) =>
									handleLinkTypeChange(v as SiteMenuLinkType)
								}
							>
								<SelectTrigger id='menu-link-type'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{LINK_TYPE_CHOICES.map((type) => (
										<SelectItem key={type} value={type}>
											{LINK_TYPE_LABELS[type]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{linkType === 'manual' && (
						<div className='space-y-2'>
							<Label htmlFor='menu-link-url'>Adresse</Label>
							<Input
								id='menu-link-url'
								value={linkUrl}
								onChange={(e) => setLinkUrl(e.target.value)}
								placeholder='/nous-contacter ou https://…'
								maxLength={2000}
							/>
							<p className='text-muted-foreground text-xs'>
								Chemin relatif ou adresse complète. Publiée telle quelle.
							</p>
						</div>
					)}

					{/* Page du site — fonctionnalité à venir. Le champ saisissait
					    l'identifiant à la main, dans `ref_id` :

					{linkType === 'page' && (
						<div className='space-y-2'>
							<Label htmlFor='menu-page-ref'>Identifiant ou slug de page</Label>
							<Input
								id='menu-page-ref'
								value={refId}
								onChange={(e) => setRefId(e.target.value)}
								placeholder='nous-contacter'
								maxLength={255}
							/>
						</div>
					)}
					*/}

					<div className='flex items-center justify-between rounded-md border p-3'>
						<div>
							<Label htmlFor='menu-visible'>Visible</Label>
							<p className='text-muted-foreground text-xs'>
								Une entrée masquée est absente du site, elle et ce qu'elle
								contient.
							</p>
						</div>
						<Switch
							id='menu-visible'
							checked={visible}
							onCheckedChange={setVisible}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button variant='outline' onClick={() => onOpenChange(false)}>
						Annuler
					</Button>
					<Button onClick={handleSubmit} disabled={!canSubmit}>
						{isSubmitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
						{entry ? 'Enregistrer' : 'Créer'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
