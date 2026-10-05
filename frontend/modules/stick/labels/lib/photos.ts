// frontend/modules/stick/labels/lib/photos.ts
//
// MINI-CHAT « PHOTOS » (Médias → Photos) — la logique, sans React.
// Doc : `PocketStick-docs/15-photos.md`.
//
// Le vendeur écrit ce qu'il cherche ; la route Go `POST /api/ai/photos-chat`
// (`backend/routes/photos_routes.go`) fait parler Gemini, exécute sa recherche
// auprès du mini-SaaS et rend UNE phrase et quatre photos au plus. Une photo
// est une RÉFÉRENCE opaque : ses octets (miniature ou image) se demandent à
// `POST /api/ai/photos-fichier`. Le renderer ne charge RIEN d'un domaine tiers.
//
// Ce n'est pas le trajet de `lancerTraitement` (une image part, un PNG revient,
// il est rangé puis posé) : ici un texte part, du JSON revient, et rien n'est
// rangé ni posé sans un clic. Ce qui est commun l'est : `useEtatDetourage`
// (UNE requête d'IA à la fois, tâche `photos`), `pb.send`, et
// `presetImageService`, seul écrivain de la bibliothèque (`ajouterPhoto`).
//
// La conversation vit dans la mémoire de l'onglet (`useConversationPhotos`) :
// elle n'est écrite nulle part, et un rechargement l'efface.

import { create } from 'zustand'
import { blobEnDataURL, type Pb, useEtatDetourage } from './detourage'

export const ROUTE_PHOTOS_CHAT = '/api/ai/photos-chat'
export const ROUTE_PHOTOS_FICHIER = '/api/ai/photos-fichier'
/** « Afficher plus » : la page suivante de la dernière recherche, SANS Gemini — gratuite. */
export const ROUTE_PHOTOS_SUITE = '/api/ai/photos-suite'

/** `photosDemandeMax` de la route. */
export const DEMANDE_MAX = 500
/** Tours renvoyés à la route pour le contexte (`photosHistoriqueMax`). */
export const HISTORIQUE_MAX = 12

// ── Le format de la page ────────────────────────────────────────────────────

export type Orientation = 'paysage' | 'portrait' | 'carre'
type Taille = { width?: number; height?: number } | null | undefined

/** En deçà de cet écart entre les deux côtés, la page est dite carrée. */
export const TOLERANCE_CARRE = 0.1

/**
 * L'orientation de la page courante, depuis sa taille (`canvasSize`, en
 * points). Un identifiant, jamais des pixels : c'est lui qui part à la route.
 * Sans taille lisible : `null`, et la recherche ne filtre pas.
 */
export function orientationDeLaPage(taille: Taille): Orientation | null {
	const l = Number(taille?.width)
	const h = Number(taille?.height)
	if (!(l > 0) || !(h > 0)) return null
	const rapport = l / h
	if (Math.abs(rapport - 1) <= TOLERANCE_CARRE) return 'carre'
	return rapport > 1 ? 'paysage' : 'portrait'
}

/**
 * Les proportions (largeur / hauteur) du cadre d'un résultat : celles de la
 * page, bornées pour qu'une bannière ou une story reste une vignette lisible.
 */
export function proportionsDuCadre(taille: Taille): number {
	const l = Number(taille?.width)
	const h = Number(taille?.height)
	if (!(l > 0) || !(h > 0)) return 1
	return Math.min(2, Math.max(0.6, l / h))
}

const MM_PAR_PT = 25.4 / 72

/** Ce que la route reçoit de la page : une orientation nommée et des millimètres. */
export function pageEnvoyee(taille: Taille) {
	const orientation = orientationDeLaPage(taille)
	if (!orientation) return {}
	return {
		orientation,
		largeur_mm: Math.round(Number(taille?.width) * MM_PAR_PT),
		hauteur_mm: Math.round(Number(taille?.height) * MM_PAR_PT),
	}
}

// ── Erreurs ─────────────────────────────────────────────────────────────────

/** Replis quand la route n'a rendu aucun message (réseau coupé, session). */
const MESSAGES: Record<string, string> = {
	quota_atteint:
		"La banque d'images a atteint sa limite de recherches pour cette heure. Réessayez un peu plus tard.",
	fournisseur_en_echec:
		"La banque d'images est en panne. Réessayez dans un instant.",
	aucun_resultat: 'Aucune photo ne correspond à cette recherche.',
	reference_invalide:
		"Cette photo n'est plus disponible : relancez la recherche.",
	service_indisponible:
		'Le service de photos est injoignable. Réessayez dans un instant.',
	reponse_invalide: 'Le service de photos a rendu une réponse inexploitable.',
	delai_depasse:
		"Le service de photos n'a pas répondu à temps. Réessayez dans un instant.",
	session_expiree: 'Votre session a expiré. Reconnectez-vous puis recommencez.',
	stockage_plein:
		"La photo n'a pas pu être rangée : l'espace du poste est insuffisant.",
	occupe: "Une requête d'IA est déjà en cours.",
}

/** Les codes après lesquels recommencer à l'identique peut réussir. */
const REESSAYABLES = new Set([
	'fournisseur_en_echec',
	'service_indisponible',
	'reponse_invalide',
	'delai_depasse',
	'gemini_en_echec',
])

export class ErreurPhotos extends Error {
	code: string
	reessayable: boolean
	constructor(code: string, message?: string) {
		super(message || MESSAGES[code] || MESSAGES.service_indisponible)
		this.name = 'ErreurPhotos'
		this.code = code
		this.reessayable = REESSAYABLES.has(code)
	}
}

/** Ce que `pb.send` lève (`status`, `response` = `{ error, code }`) → une `ErreurPhotos`. */
export function traduireErreurPhotos(e: unknown): ErreurPhotos {
	if (e instanceof ErreurPhotos) return e
	const err = e as {
		status?: number
		response?: { code?: unknown; error?: unknown }
	} | null
	const code = typeof err?.response?.code === 'string' ? err.response.code : ''
	const message =
		typeof err?.response?.error === 'string' ? err.response.error.trim() : ''
	if (code) return new ErreurPhotos(code, message || undefined)
	const status = err?.status ?? 0
	if (status === 401 || status === 403)
		return new ErreurPhotos('session_expiree')
	if (status === 429) return new ErreurPhotos('quota_atteint')
	if (status === 504) return new ErreurPhotos('delai_depasse')
	return new ErreurPhotos('service_indisponible')
}

// ── La conversation ─────────────────────────────────────────────────────────

/** Une photo trouvée : `miniature` et `image` sont des références, jamais des adresses. */
export type Photo = {
	id: string
	miniature: string
	image: string
	largeur: number
	hauteur: number
	couleur?: string
	description?: string
}

export type Recherche = { requete: string; orientation: string; page: number }

export type MessagePhotos =
	| { id: number; role: 'user'; texte: string }
	| {
			id: number
			role: 'model'
			texte: string
			resultats: Photo[]
			/** D'autres photos existent pour la même recherche. */
			suite: boolean
			/** Une erreur dite calmement, à la place d'une réponse. */
			erreur?: ErreurPhotos
	  }

export type ConversationPhotos = {
	messages: MessagePhotos[]
	/** La dernière recherche aboutie : c'est elle que « 4 autres » prolonge. */
	derniere: Recherche | null
	/** Les `id` des photos déjà rangées pendant cette conversation. */
	gardees: string[]
	/** « Afficher plus » est parti : pas deux fois la même page. */
	plus: boolean
}

/**
 * Hors du composant et NON persistée : elle survit à un changement d'onglet de
 * la barre latérale, pas à un rechargement. Ni `localStorage`, ni IndexedDB.
 */
export const useConversationPhotos = create<ConversationPhotos>(() => ({
	messages: [],
	derniere: null,
	gardees: [],
	plus: false,
}))

export const effacerConversationPhotos = () =>
	useConversationPhotos.setState({
		messages: [],
		derniere: null,
		gardees: [],
		plus: false,
	})

let prochainId = 1

/** La demande telle qu'elle part : espaces resserrés. */
export const demandeNette = (texte: string) =>
	String(texte ?? '')
		.replace(/\s+/g, ' ')
		.trim()

export type Refus = { ok: true } | { ok: false; raison: string }

export function peutDemander(texte: string, enCours = false): Refus {
	if (enCours) return { ok: false, raison: MESSAGES.occupe }
	const nette = demandeNette(texte)
	if (!nette)
		return { ok: false, raison: 'Décrivez la photo que vous cherchez.' }
	if ([...nette].length > DEMANDE_MAX)
		return {
			ok: false,
			raison: `La demande est trop longue (${DEMANDE_MAX} caractères au plus).`,
		}
	return { ok: true }
}

/** Les tours passés tels que la route les attend : du texte, sans les erreurs. */
export function historiqueEnvoye(messages: MessagePhotos[]) {
	return messages
		.filter((m) => m.texte && (m.role === 'user' || !m.erreur))
		.slice(-HISTORIQUE_MAX)
		.map((m) => ({ role: m.role, texte: m.texte }))
}

type ReponseChat = {
	texte?: unknown
	resultats?: unknown
	recherche?: unknown
	suite?: unknown
}

const estPhoto = (p: any): p is Photo =>
	!!p &&
	typeof p.id === 'string' &&
	typeof p.miniature === 'string' &&
	typeof p.image === 'string' &&
	p.largeur > 0 &&
	p.hauteur > 0

/**
 * Envoie une demande et ajoute la réponse à la conversation. Ne lève jamais :
 * un échec devient un message de l'assistant, dit sans alarme. UNE requête
 * d'IA à la fois : l'état est celui du détourage et de la retouche.
 */
export async function envoyerDemande(
	texte: string,
	deps: { pb: Pb; taille: Taille; apresDecompte?: () => void },
): Promise<boolean> {
	const etat = useEtatDetourage
	const refus = peutDemander(texte, etat.getState().enCours)
	if (!refus.ok) return false

	const conversation = useConversationPhotos
	const { messages, derniere } = conversation.getState()
	const demande = demandeNette(texte)
	conversation.setState({
		messages: [...messages, { id: prochainId++, role: 'user', texte: demande }],
	})
	// `etape: null` : pas de jauge, une discussion n'a pas d'étapes
	etat.setState({
		enCours: true,
		tache: 'photos',
		erreur: null,
		info: null,
		etape: null,
	})

	const repondre = (
		reponse: Omit<MessagePhotos & { role: 'model' }, 'id' | 'role'>,
	) =>
		conversation.setState((s) => ({
			messages: [
				...s.messages,
				{ id: prochainId++, role: 'model', ...reponse },
			],
		}))

	try {
		const rendu = (await deps.pb.send(ROUTE_PHOTOS_CHAT, {
			method: 'POST',
			body: {
				message: demande,
				historique: historiqueEnvoye(messages),
				page: pageEnvoyee(deps.taille),
				...(derniere ? { derniere } : {}),
			},
			// Pas d'auto-annulation par une autre requête
			requestKey: null,
		})) as ReponseChat | null
		const resultats = Array.isArray(rendu?.resultats)
			? rendu.resultats.filter(estPhoto)
			: []
		const recherche = rendu?.recherche as Recherche | null | undefined
		repondre({
			texte: typeof rendu?.texte === 'string' ? rendu.texte : '',
			resultats,
			suite: rendu?.suite === true && resultats.length > 0,
		})
		if (resultats.length > 0 && recherche?.requete)
			conversation.setState({
				derniere: {
					requete: String(recherche.requete),
					orientation: String(recherche.orientation ?? ''),
					page: Number(recherche.page) || 1,
				},
			})
		try {
			deps.apresDecompte?.()
		} catch {
			// le solde affiché se rafraîchira de lui-même
		}
		return true
	} catch (e) {
		const erreur = traduireErreurPhotos(e)
		repondre({ texte: erreur.message, resultats: [], suite: false, erreur })
		return false
	} finally {
		etat.setState({ enCours: false, etape: null })
	}
}

/**
 * « Afficher plus » : les quatre photos suivantes de la DERNIÈRE recherche.
 * Aucun appel à Gemini, donc rien n'est décompté — et ce n'est pas une requête
 * d'IA : `useEtatDetourage` n'est pas pris. Raffiner (« plus sombre »), en
 * revanche, repasse par `envoyerDemande`. Ne lève jamais.
 */
export async function afficherPlus(deps: { pb: Pb }): Promise<boolean> {
	const conversation = useConversationPhotos
	const { derniere, plus } = conversation.getState()
	if (!derniere || plus || useEtatDetourage.getState().enCours) return false
	conversation.setState({ plus: true })
	const ajouter = (
		reponse: Omit<MessagePhotos & { role: 'model' }, 'id' | 'role'>,
	) =>
		conversation.setState((s) => ({
			messages: [
				...s.messages,
				{ id: prochainId++, role: 'model', ...reponse },
			],
		}))
	const recherche = { ...derniere, page: derniere.page + 1 }
	try {
		const rendu = (await deps.pb.send(ROUTE_PHOTOS_SUITE, {
			method: 'POST',
			body: recherche,
			requestKey: null,
		})) as ReponseChat | null
		const resultats = Array.isArray(rendu?.resultats)
			? rendu.resultats.filter(estPhoto)
			: []
		ajouter({ texte: '', resultats, suite: rendu?.suite === true })
		conversation.setState({ derniere: recherche })
		return true
	} catch (e) {
		const erreur = traduireErreurPhotos(e)
		// Plus rien à montrer : ce n'est pas une panne
		const texte =
			erreur.code === 'aucun_resultat'
				? "Il n'y a pas d'autres photos pour cette recherche."
				: erreur.message
		ajouter({ texte, resultats: [], suite: false, erreur })
		return false
	} finally {
		conversation.setState({ plus: false })
	}
}

// ── Les octets ──────────────────────────────────────────────────────────────

/**
 * Les octets d'une référence. `pb.send` lit TOUJOURS la réponse comme du JSON :
 * on lui passe un `fetch` qui en garde un clone (comme `appelerRouteImage`).
 */
export async function chargerFichier(pb: Pb, ref: string): Promise<Blob> {
	let brute: Response | null = null
	const capter = async (url: RequestInfo | URL, config?: RequestInit) => {
		const reponse = await fetch(url, config)
		brute = reponse.clone()
		return reponse
	}
	try {
		await pb.send(ROUTE_PHOTOS_FICHIER, {
			method: 'POST',
			body: { ref },
			fetch: capter,
			requestKey: null,
		})
	} catch (e) {
		throw traduireErreurPhotos(e)
	}
	const reponse = brute as Response | null
	const type = (reponse?.headers.get('Content-Type') ?? '').split(';')[0]
	if (!reponse || !/^image\/(jpeg|png|webp)$/.test(type))
		throw new ErreurPhotos('reponse_invalide')
	return new Blob([await reponse.arrayBuffer()], { type })
}

/** Les miniatures déjà chargées, par référence : une data URL, gardée le temps de l'onglet. */
const miniatures = new Map<string, Promise<string>>()

/** La miniature d'une photo. Un échec n'est pas gardé : le prochain affichage réessaie. */
export function chargerMiniature(pb: Pb, photo: Photo): Promise<string> {
	let enCours = miniatures.get(photo.miniature)
	if (!enCours) {
		enCours = chargerFichier(pb, photo.miniature).then(blobEnDataURL)
		miniatures.set(photo.miniature, enCours)
		enCours.catch(() => miniatures.delete(photo.miniature))
	}
	return enCours
}

export const viderMiniatures = () => miniatures.clear()

const EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
}

/** Le nom du fichier téléchargé : « photo-<id>.jpg ». */
export const nomDeFichier = (photo: Photo, type: string) =>
	`photo-${photo.id.replace(/[^a-z0-9_-]/gi, '') || 'image'}.${EXTENSIONS[type] ?? 'jpg'}`

export type Bibliotheque = {
	ajouterPhoto: (photo: {
		src: string
		id: string
		nom: string
		size: number
		type: string
	}) => Promise<unknown>
}

/**
 * « Ajouter à mes images » : les octets passent par la route, puis par
 * `presetImageService.ajouterPhoto` — seul écrivain. Rien n'est posé sur la
 * page. Lève une `ErreurPhotos`.
 */
export async function garderPhoto(
	photo: Photo,
	deps: { pb: Pb; bibliotheque: Bibliotheque },
): Promise<void> {
	const blob = await chargerFichier(deps.pb, photo.image)
	const src = await blobEnDataURL(blob)
	try {
		await deps.bibliotheque.ajouterPhoto({
			src,
			id: photo.id,
			nom: photo.description ?? '',
			size: blob.size,
			type: blob.type,
		})
	} catch {
		throw new ErreurPhotos('stockage_plein')
	}
	useConversationPhotos.setState((s) => ({ gardees: [...s.gardees, photo.id] }))
}

/**
 * « Télécharger » : le fichier part sur le disque par un lien `download`, comme
 * les PDF du dépôt. `enregistrer` est remplaçable pour les tests.
 */
export async function telechargerPhoto(
	photo: Photo,
	deps: { pb: Pb; enregistrer?: (blob: Blob, nom: string) => void },
): Promise<string> {
	const blob = await chargerFichier(deps.pb, photo.image)
	const nom = nomDeFichier(photo, blob.type)
	;(deps.enregistrer ?? enregistrerSurDisque)(blob, nom)
	return nom
}

function enregistrerSurDisque(blob: Blob, nom: string) {
	const url = URL.createObjectURL(blob)
	const lien = document.createElement('a')
	lien.href = url
	lien.download = nom
	document.body.appendChild(lien)
	lien.click()
	lien.remove()
	setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
