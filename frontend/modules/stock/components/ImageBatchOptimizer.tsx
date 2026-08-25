// frontend/modules/stock/components/ImageBatchOptimizer.tsx
//
// Le bouton « Optimiser les images » des écrans Marques et Catégories.
//
// POURQUOI CE COMPOSANT EST GÉNÉRIQUE, ET OÙ S'ARRÊTE SA PORTÉE.
// `image-field.tsx:116` refuse un bouton « tout optimiser » pour une raison
// chiffrée : 2412 produits, 1,5 Gio de ré-envoi. **Ce refus tient toujours pour
// les PRODUITS.** Marques et catégories sont d'un autre ordre — 19,8 Mo pour
// 220 logos de marques, dont 15,2 Mo en 152 fichiers jamais optimisés (mesuré
// le 25 août 2026). Le composant ne va chercher aucune liste de lui-même :
// c'est l'écran qui la fournit, et c'est ce qui empêche de le brancher sur les
// produits par inadvertance. Ne pas le faire sans refaire ce calcul.
//
// ⚠️ CE QUE L'UTILISATEUR DOIT SAVOIR AVANT DE CLIQUER, et que le dialogue
// affiche : les images traitées repartiront au prochain export du miroir, et la
// conversion en WebP CHANGE le nom du fichier en ligne — le serveur efface
// l'ancien rang. C'est irréversible côté site, réversible ici seulement en
// réimportant l'image d'origine.

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import {
	type BatchImageItem,
	type BatchReport,
	formaterOctets,
	optimiserLotImages,
} from '@/lib/images/optimize-batch'
import { optimizeImage } from '@/lib/images/optimize-image'
import { AlertTriangle, Wand2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

interface Props {
	/** Les entités à traiter, image comprise. L'écran les fournit. */
	items: BatchImageItem[]
	/** Côté le plus long après réduction. Doit valoir CELUI du dialogue de
	 *  l'entité : deux plafonds différents donneraient deux résultats selon le
	 *  chemin emprunté. */
	maxSide: number
	/** Comment enregistrer le fichier optimisé. L'écran tient sa mutation. */
	save: (item: BatchImageItem, file: File) => Promise<void>
	/** Le mot affiché — « logo », « image ». */
	nomImage: string
	disabled?: boolean
}

export function ImageBatchOptimizer({
	items,
	maxSide,
	save,
	nomImage,
	disabled,
}: Props) {
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [enCours, setEnCours] = useState(false)
	const [fait, setFait] = useState(0)
	const [courante, setCourante] = useState('')
	const [rapport, setRapport] = useState<BatchReport | null>(null)
	const signal = useRef({ aborted: false })

	const lancer = async () => {
		signal.current = { aborted: false }
		setEnCours(true)
		setFait(0)
		setRapport(null)

		try {
			const res = await optimiserLotImages(items, {
				fetchFile: async (item) => {
					const reponse = await fetch(item.url)
					if (!reponse.ok) throw new Error(`téléchargement ${reponse.status}`)
					const blob = await reponse.blob()
					// Le nom d'origine porte l'extension, dont dépend le type MIME
					// que verra l'optimiseur.
					const nom = decodeURIComponent(
						new URL(item.url, document.baseURI).pathname.split('/').pop() ||
							'image',
					)
					return new File([blob], nom, { type: blob.type })
				},
				optimize: (file) => optimizeImage(file, { maxSide }),
				save,
				onProgress: (n, _total, item) => {
					setFait(n)
					setCourante(item.label)
				},
				signal: signal.current,
			})

			setRapport(res)

			const optimisees = res.outcomes.filter(
				(o) => o.kind === 'optimise',
			).length
			const echecs = res.outcomes.filter((o) => o.kind === 'echec').length
			if (echecs > 0) {
				toast.warning(
					`${optimisees} ${nomImage}(s) optimisé(s), ${echecs} en échec`,
				)
			} else {
				toast.success(`${optimisees} ${nomImage}(s) optimisé(s)`)
			}
		} finally {
			setEnCours(false)
			setCourante('')
		}
	}

	const echecs =
		rapport?.outcomes.filter(
			(o): o is Extract<typeof o, { kind: 'echec' }> => o.kind === 'echec',
		) ?? []

	return (
		<>
			<Button
				variant='outline'
				onClick={() => setConfirmOpen(true)}
				disabled={disabled || items.length === 0}
			>
				<Wand2 className='mr-2 h-4 w-4' />
				Optimiser les {nomImage}s ({items.length})
			</Button>

			<Dialog
				open={confirmOpen}
				onOpenChange={(ouvert) => {
					// Pendant le lot, la croix ANNULE plutôt que de fermer en laissant
					// la boucle tourner sans rien afficher.
					if (!ouvert && enCours) {
						signal.current.aborted = true
						return
					}
					setConfirmOpen(ouvert)
					if (!ouvert) setRapport(null)
				}}
			>
				<DialogContent className='sm:max-w-lg'>
					<DialogHeader>
						<DialogTitle>Optimiser les {nomImage}s</DialogTitle>
						<DialogDescription>
							{items.length} {nomImage}(s) seront retéléchargés, réduits à{' '}
							{maxSide} px de côté au maximum, convertis en WebP et
							réenregistrés. Une image déjà optimale est laissée intacte.
						</DialogDescription>
					</DialogHeader>

					{!enCours && !rapport && (
						<div className='flex items-start gap-3 rounded-md border border-amber-500/40 p-3 text-sm'>
							<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-amber-500' />
							<div>
								<p className='font-medium'>Le site devra être resynchronisé</p>
								<p className='text-muted-foreground'>
									Réécrire les octets change l’empreinte des images : chaque
									entité traitée repartira au prochain export du miroir. La
									conversion en WebP change aussi le nom du fichier en ligne, et
									l’ancien est effacé côté serveur.
								</p>
							</div>
						</div>
					)}

					{enCours && (
						<div className='space-y-2'>
							<Progress value={(fait / Math.max(1, items.length)) * 100} />
							<p className='text-muted-foreground text-sm'>
								{fait} / {items.length} — {courante}
							</p>
						</div>
					)}

					{rapport && (
						<div className='space-y-2 text-sm'>
							<p>
								<strong>
									{rapport.outcomes.filter((o) => o.kind === 'optimise').length}
								</strong>{' '}
								{nomImage}(s) réécrits,{' '}
								{rapport.outcomes.filter((o) => o.kind === 'inchange').length}{' '}
								déjà optimaux
								{rapport.interrompu ? ' — lot interrompu' : ''}.
							</p>
							{rapport.octetsAvant > 0 && (
								<p className='text-muted-foreground'>
									{formaterOctets(rapport.octetsAvant)} →{' '}
									{formaterOctets(rapport.octetsApres)}
								</p>
							)}
							{echecs.length > 0 && (
								<div>
									<p className='font-medium text-destructive'>
										{echecs.length} en échec :
									</p>
									<ul className='max-h-32 overflow-y-auto text-muted-foreground'>
										{echecs.map((e) => (
											<li key={e.item.id}>
												{e.item.label} — {e.raison}
											</li>
										))}
									</ul>
								</div>
							)}
						</div>
					)}

					<DialogFooter>
						{enCours ? (
							<Button
								variant='outline'
								onClick={() => {
									signal.current.aborted = true
								}}
							>
								Interrompre
							</Button>
						) : rapport ? (
							<Button onClick={() => setConfirmOpen(false)}>Fermer</Button>
						) : (
							<>
								<Button variant='outline' onClick={() => setConfirmOpen(false)}>
									Annuler
								</Button>
								<Button onClick={lancer}>Lancer l’optimisation</Button>
							</>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
