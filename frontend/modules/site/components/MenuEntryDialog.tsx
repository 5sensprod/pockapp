// frontend/modules/site/components/MenuEntryDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════
// FORMULAIRE D'UNE ENTRÉE DE MENU  (ticket 4)
// ═══════════════════════════════════════════════════════════════════════════
// Création et modification d'une entrée. Écrit dans `site_menu`, rien d'autre.
//
// Ce formulaire ne montre **jamais** l'URL publiée : elle n'existe pas encore
// à ce stade. On saisit une *destination* — un type et, selon le type, une
// cible choisie dans le catalogue ou une URL écrite à la main. La résolution
// en URL a lieu à la publication, au ticket 6 (§3 du contrat).
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
import { useEffect, useMemo, useState } from 'react'

import { useMenuDestinations } from '../hooks/use-menu-destinations'

/** Libellés des types de lien. Ordre d'affichage volontaire : les deux cas
 *  sans référence d'abord, ils sont les plus courants dans un menu. */
const LINK_TYPE_LABELS: Record<SiteMenuLinkType, string> = {
	none: 'Aucun lien (porte un sous-menu)',
	manual: 'Adresse saisie à la main',
	category: 'Catégorie du catalogue',
	brand: 'Marque',
	product: 'Produit',
	page: 'Page du site',
}

const REF_TYPES: SiteMenuRefType[] = ['category', 'brand', 'product', 'page']

const isRefType = (t: SiteMenuLinkType): t is SiteMenuRefType =>
	(REF_TYPES as SiteMenuLinkType[]).includes(t)

export interface MenuEntryDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Entrée à modifier ; absente en création. */
	entry?: SiteMenuResponse
	/** Libellé du parent, pour situer une création. */
	parentLabel?: string
	/** Session AppPos ouverte par le composant parent. Les listes de
	 *  destinations ne sont demandées qu'à partir de là — sans jeton, AppPos
	 *  ne rend qu'un 401. */
	appPosReady?: boolean
	onSubmit: (data: SiteMenuRecord) => Promise<unknown>
	isSubmitting?: boolean
}

export function MenuEntryDialog({
	open,
	onOpenChange,
	entry,
	parentLabel,
	appPosReady = true,
	onSubmit,
	isSubmitting,
}: MenuEntryDialogProps) {
	const [title, setTitle] = useState('')
	const [linkType, setLinkType] = useState<SiteMenuLinkType>('none')
	const [linkUrl, setLinkUrl] = useState('')
	const [refId, setRefId] = useState('')
	const [visible, setVisible] = useState(true)

	// Réinitialise à chaque ouverture : sans ça, rouvrir le formulaire pour une
	// autre entrée afficherait les valeurs de la précédente.
	useEffect(() => {
		if (!open) return
		setTitle(entry?.title ?? '')
		setLinkType(entry?.link_type ?? 'none')
		setLinkUrl(entry?.link_url ?? '')
		setRefId(entry?.ref_id ?? '')
		// `visible` est explicitement vrai à la création : le champ n'a pas de
		// valeur par défaut en base (backend/migrations/site_menu.go:105), une
		// entrée créée sans lui naîtrait masquée.
		setVisible(entry ? entry.visible !== false : true)
	}, [open, entry])

	const destinations = useMenuDestinations(
		isRefType(linkType) && linkType !== 'page' ? linkType : null,
		appPosReady,
	)

	const selected = useMemo(
		() => destinations.data?.find((d) => d.refId === refId),
		[destinations.data, refId],
	)

	const handleLinkTypeChange = (next: SiteMenuLinkType) => {
		setLinkType(next)
		// Une destination ne survit pas au changement de type : garder un ref_id
		// de catégorie sur une entrée devenue « marque » produirait une URL
		// fausse à la publication.
		setRefId('')
		setLinkUrl('')
	}

	const trimmedTitle = title.trim()
	const missingUrl = linkType === 'manual' && !linkUrl.trim()
	const missingRef = isRefType(linkType) && !refId.trim()
	const canSubmit =
		trimmedTitle.length > 0 && !missingUrl && !missingRef && !isSubmitting

	const handleSubmit = async () => {
		if (!canSubmit) return
		await onSubmit({
			title: trimmedTitle,
			link_type: linkType,
			// On n'écrit que le champ que le type rend pertinent, et on vide
			// l'autre : une entrée ne doit pas traîner les restes d'un type
			// précédent, que la publication pourrait relire.
			link_url: linkType === 'manual' ? linkUrl.trim() : '',
			ref_id: isRefType(linkType) ? refId.trim() : '',
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
						{parentLabel
							? `Sous « ${parentLabel} ». La destination est résolue en adresse au moment de la publication.`
							: 'La destination est résolue en adresse au moment de la publication.'}
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

					<div className='space-y-2'>
						<Label htmlFor='menu-link-type'>Destination</Label>
						<Select
							value={linkType}
							onValueChange={(v) => handleLinkTypeChange(v as SiteMenuLinkType)}
						>
							<SelectTrigger id='menu-link-type'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(Object.keys(LINK_TYPE_LABELS) as SiteMenuLinkType[]).map(
									(type) => (
										<SelectItem key={type} value={type}>
											{LINK_TYPE_LABELS[type]}
										</SelectItem>
									),
								)}
							</SelectContent>
						</Select>
					</div>

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
							<p className='text-muted-foreground text-xs'>
								Les pages vivent dans WordPress, que PocketApp n'interroge pas :
								l'identifiant se saisit à la main.
							</p>
						</div>
					)}

					{isRefType(linkType) && linkType !== 'page' && (
						<div className='space-y-2'>
							<Label htmlFor='menu-ref'>Cible</Label>

							{/* Requête désactivée tant que la session n'est pas ouverte :
							    sans ce cas, l'attente de connexion n'afficherait rien. */}
							{(destinations.isLoading || !appPosReady) &&
								!destinations.isError && (
									<div className='flex items-center gap-2 text-muted-foreground text-sm'>
										<Loader2 className='h-4 w-4 animate-spin' />
										{appPosReady
											? 'Lecture du catalogue AppPos…'
											: 'Connexion à AppPos…'}
									</div>
								)}

							{destinations.isError && (
								<div className='flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm'>
									<AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
									<div>
										<p className='font-medium'>Catalogue AppPos injoignable.</p>
										<p className='text-muted-foreground text-xs'>
											La liste des destinations vient d'AppPos. Vérifier qu'il
											est démarré, puis rouvrir ce formulaire.
										</p>
									</div>
								</div>
							)}

							{destinations.data && (
								<>
									<Select value={refId} onValueChange={setRefId}>
										<SelectTrigger id='menu-ref'>
											<SelectValue placeholder='Choisir…' />
										</SelectTrigger>
										<SelectContent className='max-h-72'>
											{destinations.data.map((d) => (
												<SelectItem
													key={d.sourceId}
													value={d.refId ?? `__unresolvable__${d.sourceId}`}
													disabled={d.refId === null}
												>
													{d.label}
													{d.refId === null && ' — non synchronisée'}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<p className='text-muted-foreground text-xs'>
										{selected
											? `Référence WooCommerce ${selected.refId}.`
											: "Les cibles non synchronisées vers WooCommerce n'ont pas d'adresse résoluble et ne peuvent pas être choisies."}
									</p>
								</>
							)}
						</div>
					)}

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
