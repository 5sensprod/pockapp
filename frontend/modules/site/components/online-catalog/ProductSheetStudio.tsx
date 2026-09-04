// frontend/modules/site/components/online-catalog/ProductSheetStudio.tsx
//
// ═══════════════════════════════════════════════════════════════════════════
// LA FICHE EN LIGNE, ÉCRITE LÀ OÙ ON LA VOIT
// ═══════════════════════════════════════════════════════════════════════════
// Ce que ce dialogue remplace, mesuré au comptoir le 4 septembre 2026 : ouvrir
// la carte « Contenu éditorial », ouvrir « Assistant Gemini », choisir un
// format, choisir une source, générer, valider la proposition, l'appliquer à la
// fiche, enregistrer le produit. **Sept gestes pour UNE décision** — d'où vient
// la matière : le web, ou mes documents. Les six autres n'apportaient aucune
// information : ils existaient parce que le texte traversait trois contenants
// successifs, et chaque frontière voulait son bouton.
//
// Ici il n'y en a plus qu'un : on ouvre, on échange avec l'assistant, on
// enregistre.
//
// ── DEUX RÈGLES QUI TIENNENT L'ASSISTANT ──────────────────────────────────
//  1. **LE WEB EST UN COMPLÉMENT EXPLICITE.** Les sources jointes et la
//     conversation restent toujours disponibles ; le tag `webSearch` ajoute
//     seulement Google Search quand l'utilisateur le demande.
//  2. **LE TEXTE LIBRE INSTRUIT.** Il part toujours dans `instructions`, que le
//     web soit actif ou non. Il ne doit jamais devenir une source à résumer.
//
// ── CE QUI EST MODIFIABLE, ET CE QUI MEUBLE ───────────────────────────────
// Le titre et les blocs de description s'éditent. Les images, le prix, le
// stock, la marque et les catégories sont là pour qu'on écrive EN VOYANT la
// page — ils ne s'éditent pas ici, ils appartiennent au reste de la fiche.
//
// ── LA DESCRIPTION RESTE UNE SEULE CHAÎNE ─────────────────────────────────
// Le découpage en blocs vit dans `sheet-blocks.ts` et nulle part ailleurs :
// rien n'est ajouté au schéma ni au contrat d'export, et ouvrir puis fermer
// sans rien toucher ne modifie pas un octet (test d'aller-retour). Des champs
// séparés viendront après la release — ce sera un seul fichier à retirer.

import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import {
	AlertTriangle,
	Bot,
	Camera,
	Copy,
	ExternalLink,
	FileText,
	Globe2,
	ImageOff,
	Loader2,
	Paperclip,
	Plus,
	RefreshCw,
	Send,
	Sparkles,
	Trash2,
	X,
} from 'lucide-react'
import {
	type ClipboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { toast } from 'sonner'

import {
	type ProductImageCandidate,
	type ProductSheetSource,
	useGenerateProductSheet,
	useGenerateProductTitle,
	useSearchProductImages,
} from '../../hooks/use-ai-product-title'
import {
	type BlocFiche,
	blocCorrespondant,
	decouperEnBlocs,
	recomposerBlocs,
} from '../../lib/sheet-blocks'
import {
	ACCEPT_ATTRIBUTE,
	MAX_FILES,
	allegerToutes,
	encoderPiecesJointes,
	trierPiecesJointes,
} from '../../lib/sheet-files'

const NAME_MAX = 255
const DESCRIPTION_MAX = 20000
const CHAT_MESSAGE_MAX = 12000

type Format = 'short' | 'detailed'

type MessageAssistant = {
	id: string
	auteur: 'utilisateur' | 'assistant'
	texte: string
	fichiers?: File[]
	/** Une relance proposée par l'assistant — il doute du format demandé et
	 *  propose l'autre. Rien ne part tant que personne n'a cliqué. */
	proposition?: { format: Format; web: boolean; libelle: string }
}

/** Le bouton qui tranche le doute de l'assistant sur le format. Composant à
 *  part parce que TypeScript perd le rétrécissement de `item.proposition` dans
 *  la fermeture du `onClick` : le passer en propriété évite l'assertion. */
function BoutonProposition({
	proposition,
	gele,
	lancer,
}: {
	proposition: NonNullable<MessageAssistant['proposition']>
	gele: boolean
	lancer: (options: { format: Format; web: boolean }) => Promise<void>
}) {
	return (
		<Button
			type='button'
			size='sm'
			variant='outline'
			className='mt-2'
			disabled={gele}
			onClick={() =>
				void lancer({ format: proposition.format, web: proposition.web })
			}
		>
			{proposition.libelle}
		</Button>
	)
}

/**
 * ── LE BROUILLON, ET NON LA BASE ──────────────────────────────────────────
 *
 * ⚠️ **Tout ce qui nourrit l'assistant vient du FORMULAIRE**, y compris ce qui
 * n'a pas encore été enregistré. C'est la seule forme cohérente : « Enregistrer
 * la fiche » écrit le formulaire ENTIER (`saveNow`), donc ce que l'assistant
 * lit est exactement ce qui partira en base. Faire autrement obligeait à
 * enregistrer une désignation ou une marque *avant* de pouvoir s'en servir —
 * deux allers-retours pour une information déjà saisie à l'écran.
 *
 * `product` ne sert plus qu'à ce que le formulaire ne porte pas : l'identité de
 * la fiche et ses images déjà en base.
 */
export type SheetDraft = {
	name: string
	description: string
	designation?: string
	sku?: string
	barcode?: string
	/** Le NOM de la marque choisie dans le formulaire, résolu par l'appelant :
	 *  le formulaire porte un identifiant, et un identifiant PocketBase ne dit
	 *  rien à un modèle de langue. */
	brandName?: string
	categoryNames?: string[]
	priceTTC?: number
	stock?: number
}

type Props = {
	open: boolean
	onClose: () => void
	product: CatalogProductShape
	/** Les valeurs COURANTES du formulaire, pas celles de la base. */
	draft: SheetDraft
	saving?: boolean
	onSave: (valeurs: {
		name: string
		description: string
	}) => void | Promise<void>
}

/** Aperçu local d'une image jointe. L'URL temporaire est libérée dès que la
 * pièce disparaît afin qu'une succession de captures ne gonfle pas le renderer. */
function ApercuPieceJointe({ fichier }: { fichier: File }) {
	const [url, setUrl] = useState<string | null>(null)

	useEffect(() => {
		if (!fichier.type.startsWith('image/')) {
			setUrl(null)
			return
		}
		const prochaineUrl = URL.createObjectURL(fichier)
		setUrl(prochaineUrl)
		return () => URL.revokeObjectURL(prochaineUrl)
	}, [fichier])

	if (!url)
		return <FileText className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
	return (
		<img
			src={url}
			alt='Aperçu de la capture jointe'
			className='h-10 w-10 shrink-0 rounded border bg-muted object-cover'
		/>
	)
}

function formatPrix(valeur: number | undefined): string {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(valeur ?? 0)
}

function ajusterHauteurMessage(champ: HTMLTextAreaElement) {
	champ.style.height = '0px'
	champ.style.height = `${Math.min(champ.scrollHeight, 180)}px`
}

export function ProductSheetStudio({
	open,
	onClose,
	product,
	draft,
	saving,
	onSave,
}: Props) {
	const pb = usePocketBase()
	const genererFiche = useGenerateProductSheet()
	const genererTitre = useGenerateProductTitle()
	const chercherImages = useSearchProductImages()
	const fileInput = useRef<HTMLInputElement>(null)
	const messageInput = useRef<HTMLTextAreaElement>(null)

	const [titre, setTitre] = useState(draft.name)
	const [blocs, setBlocs] = useState<BlocFiche[]>(() =>
		decouperEnBlocs(draft.description),
	)
	const [message, setMessage] = useState('')
	const [fichiers, setFichiers] = useState<File[]>([])
	const [rechercheWebActive, setRechercheWebActive] = useState(false)
	const [depotActif, setDepotActif] = useState(false)
	const [conversation, setConversation] = useState<MessageAssistant[]>([])
	const [sources, setSources] = useState<ProductSheetSource[]>([])
	const [requetes, setRequetes] = useState<string[]>([])
	// Le bloc en cours de régénération, pour n'animer QUE son bouton.
	const [blocEnCours, setBlocEnCours] = useState<string | null>(null)
	const [photos, setPhotos] = useState<ProductImageCandidate[] | null>(null)
	// Les adresses dont le navigateur n'a rien tiré. Voir `useSearchProductImages` :
	// c'est le chargement réel qui fait foi, pas la parole du modèle.
	const [photosMortes, setPhotosMortes] = useState<string[]>([])

	// Le brouillon du formulaire, lu SANS être suivi : le studio part de ce qui
	// est à l'écran au moment où il s'ouvre, puis vit sa vie. Le suivre ferait
	// écraser la génération en cours à chaque frappe dans la fiche derrière.
	const brouillon = useRef(draft)
	brouillon.current = draft

	// Rouvrir la modale — sur un autre produit, ou après un enregistrement —
	// repart du brouillon courant. Seule l'OUVERTURE réinitialise : le faire à
	// chaque rendu effacerait ce qui est en train d'être écrit.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `brouillon` est une ref, lue à l'ouverture seulement
	useEffect(() => {
		if (!open) return
		setTitre(brouillon.current.name)
		setBlocs(decouperEnBlocs(brouillon.current.description))
		setMessage('')
		if (messageInput.current) messageInput.current.style.height = '44px'
		setFichiers([])
		setRechercheWebActive(false)
		setDepotActif(false)
		setConversation([])
		setSources([])
		setRequetes([])
		setPhotos(null)
		setPhotosMortes([])
	}, [open, product.id])

	const description = useMemo(() => recomposerBlocs(blocs), [blocs])
	const enCours = genererFiche.isPending || genererTitre.isPending
	const gele = enCours || Boolean(saving)

	// Toutes ces valeurs viennent du formulaire, enregistrées ou non.
	const designation = draft.designation ?? product.designation
	const sku = draft.sku ?? product.sku
	const barcode = draft.barcode ?? product.barcode
	const brandName = draft.brandName
	const categoryNames = draft.categoryNames ?? []
	const prix = draft.priceTTC ?? product.price_ttc
	const stock = draft.stock ?? product.stock ?? 0

	const contexte = {
		name: titre.trim() || product.name,
		designation,
		sku,
		// Le meilleur terme de recherche quand c'en est un : un EAN désigne
		// l'article chez tous les revendeurs. Le serveur écarte lui-même les
		// codes internes (`codeBarresMondial`), l'écran n'a pas à trier.
		barcode,
		brand: brandName,
		categories: categoryNames,
		currentDescription: description,
	}

	// ── CE QUE L'ASSISTANT A POUR TRAVAILLER ────────────────────────────────
	// Un nom seul ne suffit pas : ni Google Search ni le modèle ne peuvent
	// identifier « earthwood 11/52 » sans marque ni catégorie, et les règles du
	// prompt interdisent d'inventer le reste. Autant le dire AVANT le clic —
	// après, l'échec ressemble à une panne alors que c'est la fiche qui est
	// vide. Le SKU ne compte pas : une référence interne n'identifie rien
	// dehors.
	const gtin = /^\d{8}$|^\d{12,14}$/.test((barcode ?? '').replace(/[\s-]/g, ''))
	const contexteMaigre =
		!brandName && categoryNames.length === 0 && !gtin && fichiers.length === 0

	const lancer = async (options: {
		format: Format
		web: boolean
		conversation?: boolean
		/** Régénérer une seule section : son titre, ou `null` pour l'intro. */
		cible?: { id: string; titre: string | null }
	}) => {
		if (gele) return
		try {
			const historique = options.conversation
				? conversation
						.filter((item) => item.auteur === 'utilisateur')
						.map((item) => `Utilisateur : ${item.texte}`)
				: []
			const consigneComplete = [
				options.cible
					? options.cible.titre
						? `Réécris uniquement la section « ${options.cible.titre} ».`
						: 'Réécris uniquement l’introduction.'
					: null,
				...historique,
				message.trim() ? `Utilisateur : ${message.trim()}` : null,
			]
				.filter(Boolean)
				.join('\n')
			// On conserve la fin : dans une longue conversation, la demande la plus
			// récente est celle qui doit survivre au plafond.
			const consigne = consigneComplete.slice(-CHAT_MESSAGE_MAX)

			setBlocEnCours(options.cible?.id ?? null)
			const generation = await genererFiche.mutateAsync({
				...contexte,
				descriptionFormat: options.format,
				instructions: consigne || undefined,
				files:
					fichiers.length === 0
						? undefined
						: await encoderPiecesJointes(fichiers),
				webSearch: options.web,
			})

			setSources(generation.sources)
			setRequetes(generation.searchQueries)

			if (options.cible) {
				// ⚠️ Le serveur ne sait produire qu'une fiche ENTIÈRE
				// (`/api/ai/product-sheet`) : régénérer une section coûte une
				// génération complète, dont on ne retient que la section visée. À
				// remplacer par une route dédiée quand la forme se sera stabilisée.
				const remplacant = blocCorrespondant(
					generation.description,
					options.cible.titre,
				)
				if (!remplacant) {
					toast.warning(
						'La proposition ne portait pas cette section : le texte est resté en place.',
					)
					return
				}
				setBlocs((actuels) =>
					actuels.map((bloc) =>
						bloc.id === options.cible?.id
							? { ...bloc, html: remplacant.html }
							: bloc,
					),
				)
				toast.success('Section réécrite')
				return
			}

			setBlocs(decouperEnBlocs(generation.description))
			toast.success('Fiche proposée')

			// Le modèle a rendu ce qui était demandé, mais il doute du format :
			// une visserie n'a pas de points forts, un ampli mérite mieux que
			// trois phrases. On le dit, et l'utilisateur tranche d'un clic.
			const note = generation.formatNote?.trim()
			const autreFormat =
				generation.suggestedFormat === 'short' ||
				generation.suggestedFormat === 'detailed'
					? generation.suggestedFormat
					: null
			if (note && autreFormat && autreFormat !== options.format) {
				setConversation((messages) => [
					...messages,
					{
						id: crypto.randomUUID(),
						auteur: 'assistant',
						texte: note,
						proposition: {
							format: autreFormat,
							web: options.web,
							libelle:
								autreFormat === 'short'
									? 'Refaire en fiche courte'
									: 'Refaire en fiche détaillée',
						},
					},
				])
			}

			if (options.conversation) {
				setConversation((messages) => [
					...messages,
					{
						id: crypto.randomUUID(),
						auteur: 'assistant',
						texte:
							'J’ai proposé une fiche dans l’éditeur. Tu peux la relire et la modifier avant de l’enregistrer.',
					},
				])
			}
		} catch (error) {
			// Le message vient de la route et peut expliquer ce qui manque : on le
			// laisse s'afficher en entier plutôt que le tronquer sur une ligne.
			toast.error(
				error instanceof Error ? error.message : 'Génération impossible.',
				{ duration: 12000, className: 'whitespace-pre-line' },
			)
		} finally {
			setBlocEnCours(null)
		}
	}

	const proposerPhotos = async () => {
		if (gele || chercherImages.isPending) return
		try {
			setPhotosMortes([])
			const trouvees = await chercherImages.mutateAsync(contexte)
			setPhotos(trouvees.candidates)
			if (trouvees.searchQueries.length > 0) setRequetes(trouvees.searchQueries)
			if (trouvees.candidates.length === 0) {
				toast.info('Aucune photo sûre trouvée pour ce produit.')
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Recherche impossible.',
				{ duration: 12000, className: 'whitespace-pre-line' },
			)
		}
	}

	const proposerTitre = async () => {
		if (gele) return
		try {
			const images = fichiers.filter((fichier) =>
				fichier.type.startsWith('image/'),
			)
			const generation = await genererTitre.mutateAsync({
				...contexte,
				// Le modèle exact est souvent SUR l'emballage ou dans la capture, et
				// nulle part ailleurs : sans elles, le titre ne peut que reformuler
				// le nom déjà saisi.
				files:
					images.length > 0 ? await encoderPiecesJointes(images) : undefined,
			})
			setTitre(generation.title)
			toast.success('Titre proposé')
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Génération impossible.',
			)
		}
	}

	const ajouterFichiers = async (choisis: File[]) => {
		// On allège AVANT de mesurer : une capture pleine page dépasse
		// couramment le plafond, et la refuser pour sa taille alors qu'elle est
		// parfaitement lisible une fois réduite n'apprend rien à personne.
		const allegees = await allegerToutes(choisis)
		const { retenus, refus } = trierPiecesJointes(fichiers, allegees)
		if (refus.length > 0) toast.error(refus.join('\n'))
		setFichiers(retenus)
	}

	const envoyerMessage = () => {
		const texte = message.trim()
		const piecesJointes = [...fichiers]
		if (!texte && piecesJointes.length === 0) {
			toast.error('Écris un message ou ajoute une source avant d’envoyer.')
			return
		}
		setConversation((messages) => [
			...messages,
			{
				id: crypto.randomUUID(),
				auteur: 'utilisateur',
				texte:
					texte ||
					(rechercheWebActive
						? 'Recherche ce produit sur le web.'
						: 'Analyse les sources jointes.'),
				fichiers: piecesJointes,
			},
		])
		setMessage('')
		if (messageInput.current) messageInput.current.style.height = '44px'
		setFichiers([])
		void lancer({
			format: 'detailed',
			web: rechercheWebActive,
			conversation: true,
		})
	}

	const collerDansLeChat = (event: ClipboardEvent<HTMLTextAreaElement>) => {
		const fichiersColles = Array.from(event.clipboardData.items)
			.filter((item) => item.kind === 'file')
			.map((item) => item.getAsFile())
			.filter((file): file is File => file !== null)
		if (fichiersColles.length === 0) return
		event.preventDefault()
		void ajouterFichiers(fichiersColles)
	}

	const enregistrer = async () => {
		const nom = titre.trim()
		if (nom === '') {
			toast.error('Le nom de la fiche est obligatoire')
			return
		}
		if (nom.length > NAME_MAX) {
			toast.error(`Le nom dépasse ${NAME_MAX} caractères`)
			return
		}
		if (description.length > DESCRIPTION_MAX) {
			toast.error(`La description dépasse ${DESCRIPTION_MAX} caractères`)
			return
		}
		await onSave({ name: nom, description })
	}

	const imagePrincipale = product.image
		? pb.files.getUrl(product, product.image)
		: null
	const galerie = (product.gallery ?? []).filter(
		(entree): entree is string => typeof entree === 'string',
	)
	const enStock = stock > 0

	return (
		<Dialog open={open} onOpenChange={(ouvert) => !ouvert && onClose()}>
			<DialogContent className='max-h-[92vh] max-w-6xl overflow-hidden p-0'>
				<DialogHeader className='border-b px-6 py-4'>
					<DialogTitle>Fiche du site</DialogTitle>
					<DialogDescription>
						La page telle que le visiteur la verra. Tout ce qui est modifiable
						l’est ici ; rien n’est écrit avant « Enregistrer la fiche ».
					</DialogDescription>
				</DialogHeader>

				<div className='grid max-h-[70vh] gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]'>
					{/* ── L'APERÇU, ÉDITABLE ─────────────────────────────────────── */}
					<div className='overflow-y-auto px-6 py-5'>
						<div className='flex gap-4'>
							<div className='flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/20'>
								{imagePrincipale ? (
									<img
										src={imagePrincipale}
										alt=''
										className='h-full w-full object-contain'
									/>
								) : (
									<ImageOff className='h-8 w-8 text-muted-foreground/50' />
								)}
							</div>

							<div className='min-w-0 flex-1 space-y-2'>
								<Label htmlFor='studio-titre' className='font-semibold text-sm'>
									Titre de la page
								</Label>
								<div className='flex gap-2'>
									<Input
										id='studio-titre'
										value={titre}
										maxLength={NAME_MAX}
										disabled={gele}
										onChange={(e) => setTitre(e.target.value)}
										className='h-10 font-medium text-base'
									/>
									<Button
										type='button'
										variant='outline'
										size='icon'
										className='h-10 w-10 shrink-0'
										title='Proposer un titre'
										aria-label='Proposer un titre'
										disabled={gele}
										onClick={proposerTitre}
									>
										{genererTitre.isPending ? (
											<Loader2 className='h-4 w-4 animate-spin' />
										) : (
											<Sparkles className='h-4 w-4' />
										)}
									</Button>
								</div>

								{/* Ce qui MEUBLE la fiche : lu, jamais modifié ici. */}
								<div className='flex flex-wrap items-center gap-2 pt-1'>
									<span className='font-bold text-lg'>{formatPrix(prix)}</span>
									<Badge
										variant='outline'
										className={cn(
											'border-transparent',
											enStock
												? 'bg-emerald-100 text-emerald-800'
												: 'bg-orange-100 text-orange-800',
										)}
									>
										{enStock ? 'En stock' : 'Réappro'}
									</Badge>
									{brandName && <Badge variant='secondary'>{brandName}</Badge>}
									{categoryNames.slice(0, 3).map((nom) => (
										<Badge key={nom} variant='outline'>
											{nom}
										</Badge>
									))}
									{sku && (
										<span className='font-mono text-muted-foreground text-xs'>
											{sku}
										</span>
									)}
								</div>
							</div>
						</div>

						{galerie.length > 0 && (
							<div className='mt-3 flex flex-wrap gap-2'>
								{galerie.map((nom) => (
									<img
										key={nom}
										src={pb.files.getUrl(product, nom)}
										alt=''
										className='h-14 w-14 rounded border object-contain'
									/>
								))}
							</div>
						)}

						<div className='mt-5 space-y-4'>
							{blocs.length === 0 && (
								<p className='rounded-lg border border-dashed px-4 py-8 text-center text-muted-foreground text-sm'>
									Aucun texte pour l’instant. Demande une proposition à
									l’assistant, ou écris la fiche à la main.
								</p>
							)}

							{blocs.map((bloc, index) => (
								<section key={bloc.id} className='rounded-lg border p-3'>
									<div className='mb-2 flex items-center gap-2'>
										{bloc.titre === null ? (
											<span className='font-medium text-muted-foreground text-xs uppercase tracking-wide'>
												Introduction
											</span>
										) : (
											<Input
												value={bloc.titre}
												disabled={gele}
												aria-label='Titre de la section'
												onChange={(e) =>
													setBlocs((actuels) =>
														actuels.map((autre) =>
															autre.id === bloc.id
																? { ...autre, titre: e.target.value }
																: autre,
														),
													)
												}
												className='h-8 max-w-xs font-semibold'
											/>
										)}
										<div className='ml-auto flex items-center gap-1'>
											<Button
												type='button'
												variant='ghost'
												size='icon'
												className='h-8 w-8'
												title='Réécrire cette section'
												aria-label='Réécrire cette section'
												disabled={gele}
												onClick={() =>
													lancer({
														format: 'detailed',
														web: fichiers.length === 0,
														cible: { id: bloc.id, titre: bloc.titre },
													})
												}
											>
												{blocEnCours === bloc.id ? (
													<Loader2 className='h-4 w-4 animate-spin' />
												) : (
													<RefreshCw className='h-4 w-4' />
												)}
											</Button>
											<Button
												type='button'
												variant='ghost'
												size='icon'
												className='h-8 w-8 text-destructive hover:text-destructive'
												title='Supprimer cette section'
												aria-label='Supprimer cette section'
												disabled={gele}
												onClick={() =>
													setBlocs((actuels) =>
														actuels.filter((autre) => autre.id !== bloc.id),
													)
												}
											>
												<Trash2 className='h-4 w-4' />
											</Button>
										</div>
									</div>

									<HtmlContentEditor
										value={bloc.html}
										onChange={(valeur) =>
											setBlocs((actuels) =>
												actuels.map((autre) =>
													autre.id === bloc.id
														? { ...autre, html: valeur }
														: autre,
												),
											)
										}
										maxLength={DESCRIPTION_MAX}
										maxHeight={index === 0 ? 220 : 320}
										ariaLabel={bloc.titre ?? 'Introduction'}
										placeholder='Texte de la section…'
									/>
								</section>
							))}

							<Button
								type='button'
								variant='outline'
								size='sm'
								disabled={gele}
								onClick={() =>
									setBlocs((actuels) => [
										...actuels,
										{
											id: `bloc-manuel-${Date.now()}`,
											titre: 'Nouvelle section',
											html: '',
										},
									])
								}
							>
								<Plus className='mr-2 h-4 w-4' />
								Ajouter une section
							</Button>

							{/* 20 000 est le plafond du schéma (`catalog_v2.go`), pas un
							    objectif : l'afficher en permanence donnait « 0 / 20000 » sous
							    un champ vide, et faisait passer une fiche de 2 000 signes —
							    la bonne taille — pour un travail à peine commencé. On compte
							    ce qui est écrit ; le plafond n'apparaît qu'en approche. */}
							<p
								className={cn(
									'text-xs',
									description.length > DESCRIPTION_MAX * 0.9
										? 'font-medium text-amber-600'
										: 'text-muted-foreground',
								)}
							>
								{description.length > DESCRIPTION_MAX * 0.9
									? `${description.length} / ${DESCRIPTION_MAX} caractères`
									: `${description.length} caractère${description.length > 1 ? 's' : ''}`}
							</p>
						</div>
					</div>

					{/* ── L'ASSISTANT ────────────────────────────────────────────── */}
					<aside className='flex flex-col overflow-y-auto border-t bg-muted/30 px-5 py-5 lg:border-t-0 lg:border-l'>
						<div className='flex items-center gap-2'>
							<span className='flex h-8 w-8 items-center justify-center rounded-full bg-background'>
								<Bot className='h-4 w-4' />
							</span>
							<div>
								<p className='font-semibold text-sm'>Assistant</p>
								<p className='text-muted-foreground text-xs'>
									Un clic suffit. Rien n’est enregistré.
								</p>
							</div>
						</div>

						{contexteMaigre && (
							<div className='mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 text-xs leading-relaxed dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200'>
								<p className='flex items-center gap-1.5 font-semibold'>
									<AlertTriangle className='h-3.5 w-3.5 shrink-0' />
									Peu d’informations sur ce produit
								</p>
								<p className='mt-1'>
									Il n’a ni marque ni catégorie. L’assistant n’a que son nom
									pour l’identifier, et il lui est interdit d’inventer : la
									recherche web peut ne rien trouver d’exploitable. Renseigne la
									marque ou la catégorie sur la fiche, ou joins une
									documentation.
								</p>
							</div>
						)}

						<div
							className={cn(
								'mt-4 flex min-h-[260px] flex-1 flex-col rounded-3xl border bg-background p-3 transition-colors',
								depotActif && 'border-primary bg-primary/5',
							)}
							onDragEnter={(event) => {
								event.preventDefault()
								setDepotActif(true)
							}}
							onDragOver={(event) => event.preventDefault()}
							onDragLeave={(event) => {
								if (event.currentTarget === event.target) setDepotActif(false)
							}}
							onDrop={(event) => {
								event.preventDefault()
								setDepotActif(false)
								void ajouterFichiers(Array.from(event.dataTransfer.files))
							}}
						>
							{conversation.length > 0 && (
								<div
									className='mb-3 max-h-64 space-y-2 overflow-y-scroll px-1 pr-2'
									style={{ scrollbarGutter: 'stable' }}
								>
									{conversation.map((item) => (
										<div
											key={item.id}
											className={cn(
												'rounded-2xl px-3 py-2 text-sm',
												item.auteur === 'utilisateur'
													? 'ml-6 rounded-br-sm bg-primary text-primary-foreground'
													: 'mr-6 rounded-bl-sm bg-muted text-foreground',
											)}
										>
											<p className='whitespace-pre-wrap'>{item.texte}</p>
											{item.proposition && (
												<BoutonProposition
													proposition={item.proposition}
													gele={gele}
													lancer={lancer}
												/>
											)}
											{item.fichiers && item.fichiers.length > 0 && (
												<div className='mt-2 flex flex-wrap gap-1.5'>
													{item.fichiers.map((fichier) => (
														<div
															key={`${fichier.name}-${fichier.size}`}
															className='flex items-center gap-1 rounded-md bg-background/20 p-1'
														>
															<ApercuPieceJointe fichier={fichier} />
															<span className='max-w-28 truncate text-xs'>
																{fichier.name}
															</span>
														</div>
													))}
												</div>
											)}
										</div>
									))}
								</div>
							)}
							<div className='mt-auto flex flex-col'>
								<Textarea
									ref={messageInput}
									value={message}
									maxLength={CHAT_MESSAGE_MAX}
									disabled={gele}
									placeholder='Envoyez un message…'
									onChange={(event) => {
										setMessage(event.target.value)
										ajusterHauteurMessage(event.target)
									}}
									onKeyDown={(event) => {
										if (
											event.key === 'Enter' &&
											!event.shiftKey &&
											!event.nativeEvent.isComposing
										) {
											event.preventDefault()
											envoyerMessage()
										}
									}}
									onPaste={collerDansLeChat}
									rows={1}
									className='min-h-11 max-h-[180px] resize-none overflow-y-auto border-0 px-3 py-2.5 text-base shadow-none focus-visible:ring-0'
								/>

								<input
									ref={fileInput}
									type='file'
									multiple
									accept={ACCEPT_ATTRIBUTE}
									className='hidden'
									onChange={(e) => {
										void ajouterFichiers(Array.from(e.target.files ?? []))
										e.target.value = ''
									}}
								/>

								{fichiers.length > 0 && (
									<ul className='mb-2 space-y-1 px-2'>
										{fichiers.map((fichier) => (
											<li
												key={`${fichier.name}-${fichier.size}`}
												className='flex items-center gap-2 rounded-lg bg-muted p-2 text-xs'
											>
												<ApercuPieceJointe fichier={fichier} />
												<span className='min-w-0 flex-1 truncate'>
													{fichier.name}
												</span>
												<button
													type='button'
													aria-label={`Retirer ${fichier.name}`}
													disabled={gele}
													onClick={() =>
														setFichiers((actuels) =>
															actuels.filter((autre) => autre !== fichier),
														)
													}
												>
													<X className='h-3.5 w-3.5' />
												</button>
											</li>
										))}
									</ul>
								)}

								<div className='flex items-center gap-2'>
									<Button
										type='button'
										variant='ghost'
										size='icon'
										className='h-10 w-10 shrink-0 rounded-full text-muted-foreground'
										disabled={gele || fichiers.length >= MAX_FILES}
										onClick={() => fileInput.current?.click()}
										aria-label='Joindre un fichier'
										title={`Joindre une image, un PDF ou un TXT (${MAX_FILES} maximum)`}
									>
										<Paperclip className='h-5 w-5' />
									</Button>
									<Button
										type='button'
										variant={rechercheWebActive ? 'secondary' : 'outline'}
										size='sm'
										className={cn(
											'h-10 rounded-full px-4 font-normal text-sm',
											rechercheWebActive && 'border-primary/40 text-primary',
										)}
										disabled={gele}
										onClick={() => setRechercheWebActive((active) => !active)}
										aria-pressed={rechercheWebActive}
										title={
											rechercheWebActive
												? 'Désactiver la recherche web'
												: 'Activer la recherche web en complément'
										}
									>
										<Globe2 className='mr-2 h-4 w-4' />
										Recherche web
									</Button>
									<Button
										type='button'
										size='icon'
										className='ml-auto h-11 w-11 shrink-0 rounded-xl'
										disabled={gele}
										onClick={envoyerMessage}
										aria-label='Envoyer à l’assistant'
										title='Envoyer à l’assistant'
									>
										{genererFiche.isPending && blocEnCours === null ? (
											<Loader2 className='h-4 w-4 animate-spin' />
										) : (
											<Send className='h-4 w-4' />
										)}
									</Button>
								</div>
							</div>
						</div>

						{/* ── DES PHOTOS, PAS DES FICHIERS ────────────────────────────
						    On rend des ADRESSES : rien n'est téléchargé, rien n'entre
						    dans la galerie. Importer supposerait de rapatrier les octets
						    depuis un domaine tiers — une sortie réseau de plus, et une
						    question de droits que l'écran ne peut pas trancher à la
						    place du commerçant. Il ouvre, il juge, il enregistre
						    lui-même s'il le veut. */}
						<div className='mt-4 border-t pt-4'>
							<Button
								type='button'
								variant='outline'
								size='sm'
								className='w-full cursor-not-allowed bg-muted text-muted-foreground opacity-60 hover:bg-muted hover:text-muted-foreground'
								disabled
								onClick={proposerPhotos}
								title='Recherche de photos temporairement indisponible'
							>
								{chercherImages.isPending ? (
									<Loader2 className='mr-2 h-4 w-4 animate-spin' />
								) : (
									<Camera className='mr-2 h-4 w-4' />
								)}
								Chercher des photos sur le net
							</Button>

							{photos !== null && (
								<div className='mt-3 space-y-2'>
									{photos
										.filter((photo) => !photosMortes.includes(photo.imageUrl))
										.map((photo) => (
											<div
												key={photo.imageUrl}
												className='rounded-lg border bg-background p-2'
											>
												<img
													src={photo.imageUrl}
													alt={photo.title || ''}
													referrerPolicy='no-referrer'
													loading='lazy'
													className='h-28 w-full rounded object-contain'
													onError={() =>
														setPhotosMortes((mortes) => [
															...mortes,
															photo.imageUrl,
														])
													}
												/>
												<p className='mt-1.5 break-all font-mono text-[11px] text-muted-foreground leading-tight'>
													{photo.imageUrl}
												</p>
												<div className='mt-1.5 flex items-center gap-1'>
													<Button
														type='button'
														variant='ghost'
														size='sm'
														className='h-7 px-2 text-xs'
														onClick={() => {
															void navigator.clipboard
																.writeText(photo.imageUrl)
																.then(() => toast.success('Adresse copiée'))
																.catch(() =>
																	toast.error('Copie impossible sur ce poste'),
																)
														}}
													>
														<Copy className='mr-1 h-3 w-3' />
														Copier l’adresse
													</Button>
													{photo.pageUrl && (
														<a
															href={photo.pageUrl}
															target='_blank'
															rel='noreferrer'
															className='flex items-center gap-1 px-2 text-primary text-xs hover:underline'
														>
															<ExternalLink className='h-3 w-3' />
															La page
														</a>
													)}
												</div>
											</div>
										))}

									{photos.filter(
										(photo) => !photosMortes.includes(photo.imageUrl),
									).length === 0 && (
										<p className='text-muted-foreground text-xs'>
											Aucune des adresses proposées ne répond. Les images
											trouvées sur le web disparaissent souvent : réessaie, ou
											va la chercher sur la page du fabricant.
										</p>
									)}

									<p className='text-muted-foreground text-xs'>
										Propositions seulement : rien n’est importé dans la galerie,
										et les droits d’usage restent à vérifier.
									</p>
								</div>
							)}
						</div>

						{(sources.length > 0 || requetes.length > 0) && (
							<div className='mt-5 border-t pt-4'>
								<p className='font-medium text-xs'>Sources de la proposition</p>
								{requetes.length > 0 && (
									<p className='mt-1 text-muted-foreground text-xs'>
										Recherche : {requetes.join(' · ')}
									</p>
								)}
								<ul className='mt-2 space-y-1'>
									{sources.map((source) => (
										<li key={source.url}>
											<a
												href={source.url}
												target='_blank'
												rel='noreferrer'
												className='flex items-center gap-1 text-primary text-xs hover:underline'
											>
												<ExternalLink className='h-3 w-3 shrink-0' />
												<span className='truncate'>
													{source.title || source.url}
												</span>
											</a>
										</li>
									))}
								</ul>
							</div>
						)}
					</aside>
				</div>

				<DialogFooter className='border-t px-6 py-4'>
					<Button
						type='button'
						variant='outline'
						onClick={onClose}
						disabled={Boolean(saving)}
					>
						Annuler
					</Button>
					<Button type='button' onClick={enregistrer} disabled={gele}>
						{saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
						Enregistrer la fiche
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
