// frontend/modules/stick/labels/lib/detourage.ts
//
// DÉTOURAGE IA d'une image de l'affiche — la logique, sans React.
// Doc : `PocketStick-docs/10-detourage-ia.md`.
//
// Le renderer n'appelle jamais le fournisseur : il envoie l'image à la route Go
// `POST /api/ai/remove-background` (`backend/routes/detourage_routes.go`), qui
// la relaie au mini-SaaS ; celui-ci détoure, décompte les crédits IA du client
// et renvoie un PNG. Aucun modèle à choisir, aucun prix à afficher.
//
// Le trajet d'un détourage (`lancerDetourage`), dans l'ordre qui compte :
//   1. lire la source de l'élément, la PRÉPARER (4096 px, JPEG ou WebP, sous
//      `SEUIL_ENVOI_OCTETS`), l'envoyer ;
//   2. RANGER le PNG reçu dans la bibliothèque du poste (« Génération ») —
//      AVANT de toucher à l'élément : un détourage payé n'est jamais perdu ;
//   3. le POSER sur l'élément, en un pas d'historique, seulement s'il est
//      encore tel qu'au lancement.
// Ctrl+Z rend la photo d'origine ; l'image détourée reste dans la bibliothèque.

import { create } from 'zustand'

// ── Constantes ──────────────────────────────────────────────────────────────

export const ROUTE_DETOURAGE = '/api/ai/remove-background'

/** Plus grand côté envoyé, en pixels. */
export const COTE_MAX = 4096
/**
 * Poids au-delà duquel l'image est réduite par paliers avant l'envoi. Le
 * plafond du mini-SaaS est de 8 Mio (`DETOURAGE_MAX_BYTES`, mesuré le 5 octobre
 * 2026 : l'hébergeur accepte 128 Mio, c'est la borne du dépôt qui tient) ; on
 * reste dessous avec une marge.
 */
export const SEUIL_ENVOI_OCTETS = 6 * 1024 * 1024
export const QUALITE_ENVOI = 0.9
/** Chaque palier garde 85 % du côté précédent (≈ 72 % des pixels). */
export const PALIER_REDUCTION = 0.85
/** En dessous, on renonce : une image aussi petite et encore lourde n'existe pas. */
export const COTE_MIN = 512

// ── Peut-on détourer cet élément ? ──────────────────────────────────────────

export type Refus = { ok: true } | { ok: false; raison: string }

/**
 * `nombre` : les éléments sélectionnés (pas seulement les images). `enCours` :
 * un détourage est déjà parti — le payer deux fois n'a aucun sens.
 */
export function peutDetourer(el: any, nombre: number, enCours = false): Refus {
	if (enCours) return { ok: false, raison: 'Un détourage est déjà en cours.' }
	if (nombre > 1)
		return { ok: false, raison: 'Sélectionnez une seule image à détourer.' }
	if (!el || el.type !== 'image')
		return { ok: false, raison: 'Seule une image se détoure.' }
	if (el.dataBinding) {
		return {
			ok: false,
			raison:
				'Cette photo suit le produit : la détourer la figerait pour un seul produit. Posez une image fixe pour la détourer.',
		}
	}
	if (el.locked)
		return {
			ok: false,
			raison: "L'image est verrouillée : déverrouillez-la pour la détourer.",
		}
	if (!el.src) return { ok: false, raison: "Cette image n'a pas de source." }
	return { ok: true }
}

// ── Erreurs ─────────────────────────────────────────────────────────────────

export type FamilleErreur =
	| 'credit'
	| 'taille'
	| 'format'
	| 'service'
	| 'configuration'
	| 'session'

const FAMILLES: Record<string, FamilleErreur> = {
	credit_epuise: 'credit',
	image_trop_lourde: 'taille',
	type_refuse: 'format',
	fournisseur_en_echec: 'service',
	service_indisponible: 'service',
	reponse_invalide: 'service',
	cle_absente: 'configuration',
	cle_invalide: 'configuration',
	adresse_non_securisee: 'configuration',
	session_expiree: 'session',
}

/** Message de repli quand le serveur n'en a pas rendu (réseau coupé…). */
const MESSAGES: Record<string, string> = {
	credit_epuise:
		"Les crédits IA sont épuisés. Le détourage n'a pas été fait ni facturé.",
	// Pas « réessayez » : renvoyer la même image donnerait la même réponse
	image_trop_lourde:
		'Cette image est trop grande pour le détourage. Utilisez-en une plus petite.',
	type_refuse: 'Format d’image refusé : PNG, JPEG ou WebP uniquement.',
	fournisseur_en_echec:
		'Le service de détourage est en panne. Réessayez dans un instant.',
	service_indisponible:
		'Le service de détourage est injoignable. Réessayez dans un instant.',
	reponse_invalide:
		'Le service de détourage a rendu une réponse inexploitable.',
	cle_absente: "La clé PocketApp n'est pas configurée sur ce poste.",
	cle_invalide:
		'La clé PocketApp de ce poste est refusée. Vérifiez-la dans « Clés API & Secrets ».',
	adresse_non_securisee: 'Le détourage exige une adresse HTTPS.',
	session_expiree: 'Votre session a expiré. Reconnectez-vous puis recommencez.',
}

export class ErreurDetourage extends Error {
	code: string
	famille: FamilleErreur
	/** Vrai si recommencer à l'identique peut réussir (panne passagère). */
	reessayable: boolean
	constructor(code: string, message?: string) {
		const connu = code in FAMILLES
		const c = connu ? code : 'service_indisponible'
		super(message || MESSAGES[c])
		this.name = 'ErreurDetourage'
		this.code = c
		this.famille = FAMILLES[c]
		this.reessayable = this.famille === 'service'
	}
}

/**
 * Ce que `pb.send` lève (`ClientResponseError` : `status`, `response` =
 * `{ error, code }`) → une `ErreurDetourage`. Le message du serveur est repris
 * tel quel, sauf pour « trop lourde » : le vendeur ne peut rien faire de
 * « lourde », il peut choisir une image plus petite.
 */
export function traduireErreur(e: unknown): ErreurDetourage {
	if (e instanceof ErreurDetourage) return e
	const err = e as {
		status?: number
		response?: { code?: unknown; error?: unknown }
	} | null
	const code = typeof err?.response?.code === 'string' ? err.response.code : ''
	const message =
		typeof err?.response?.error === 'string' ? err.response.error.trim() : ''
	if (code in FAMILLES) {
		return new ErreurDetourage(
			code,
			code === 'image_trop_lourde' ? undefined : message || undefined,
		)
	}
	const status = err?.status ?? 0
	if (status === 402) return new ErreurDetourage('credit_epuise')
	if (status === 413) return new ErreurDetourage('image_trop_lourde')
	if (status === 415) return new ErreurDetourage('type_refuse')
	if (status === 401 || status === 403)
		return new ErreurDetourage('session_expiree')
	return new ErreurDetourage('service_indisponible')
}

// ── La source ───────────────────────────────────────────────────────────────

/** Une data URL → Blob, sans réseau. */
export function dataURLEnBlob(dataURL: string): Blob {
	const virgule = dataURL.indexOf(',')
	if (!dataURL.startsWith('data:') || virgule < 0)
		throw new Error('Data URL invalide')
	const entete = dataURL.slice(5, virgule)
	const donnees = dataURL.slice(virgule + 1)
	const type = entete.split(';')[0] || 'application/octet-stream'
	if (!entete.includes(';base64'))
		return new Blob([decodeURIComponent(donnees)], { type })
	const binaire = atob(donnees)
	const octets = new Uint8Array(binaire.length)
	for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
	return new Blob([octets], { type })
}

/** Un Blob → data URL (la forme sous laquelle la bibliothèque stocke ses images). */
export async function blobEnDataURL(blob: Blob): Promise<string> {
	const octets = new Uint8Array(await blob.arrayBuffer())
	let binaire = ''
	for (let i = 0; i < octets.length; i += 0x8000) {
		binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000))
	}
	return `data:${blob.type || 'image/png'};base64,${btoa(binaire)}`
}

/**
 * Les octets de l'image d'un élément : une data URL part telle quelle, une
 * adresse de fichier PocketBase est téléchargée par le renderer. Une photo
 * LIÉE n'arrive jamais ici (`peutDetourer`) : sa `src` n'est qu'un marqueur.
 */
export async function sourceAEnvoyer(el: any): Promise<Blob> {
	const src = String(el?.src ?? '')
	if (!src || src.includes('{{'))
		throw new Error("Cette image n'a pas de source utilisable.")
	if (src.startsWith('data:')) return dataURLEnBlob(src)
	const reponse = await fetch(src)
	if (!reponse.ok) throw new Error(`Image illisible (${reponse.status}).`)
	return reponse.blob()
}

// ── La préparation ──────────────────────────────────────────────────────────

/** Une image décodée, prête à être réencodée à n'importe quelle taille. */
export type ImageDecodee = {
	largeur: number
	hauteur: number
	/** La source porte-t-elle de la transparence ? Alors pas de JPEG. */
	transparente: boolean
	encoder: (
		largeur: number,
		hauteur: number,
		mime: string,
		qualite: number,
	) => Promise<Blob>
	liberer?: () => void
}
export type Codec = (blob: Blob) => Promise<ImageDecodee>

export type ImagePreparee = { blob: Blob; largeur: number; hauteur: number }

/**
 * 4096 px au plus ; JPEG 0,9 (le détourage rend un PNG de toute façon, et
 * l'élément garde sa photo d'origine tant que le résultat n'est pas revenu),
 * WebP si la source porte de la transparence ; puis, tant que le fichier
 * dépasse `SEUIL_ENVOI_OCTETS`, on réduit par paliers.
 */
export async function preparerImage(
	blob: Blob,
	codec: Codec = codecNavigateur,
): Promise<ImagePreparee> {
	const image = await codec(blob)
	try {
		const mime = image.transparente ? 'image/webp' : 'image/jpeg'
		let echelle = Math.min(
			1,
			COTE_MAX / Math.max(image.largeur, image.hauteur, 1),
		)
		for (;;) {
			const largeur = Math.max(1, Math.round(image.largeur * echelle))
			const hauteur = Math.max(1, Math.round(image.hauteur * echelle))
			const sortie = await image.encoder(largeur, hauteur, mime, QUALITE_ENVOI)
			if (sortie.size <= SEUIL_ENVOI_OCTETS)
				return { blob: sortie, largeur, hauteur }
			if (Math.max(largeur, hauteur) <= COTE_MIN)
				throw new ErreurDetourage('image_trop_lourde')
			echelle *= PALIER_REDUCTION
		}
	} finally {
		image.liberer?.()
	}
}

const COTE_SONDE = 256

/** Le codec du navigateur (WebView2) : `createImageBitmap` + canvas. */
export const codecNavigateur: Codec = async (blob) => {
	const bitmap = await createImageBitmap(blob)
	const dessiner = (largeur: number, hauteur: number) => {
		const canvas = document.createElement('canvas')
		canvas.width = largeur
		canvas.height = hauteur
		const ctx = canvas.getContext('2d', { willReadFrequently: true })
		if (!ctx) throw new Error('Canvas indisponible')
		ctx.drawImage(bitmap, 0, 0, largeur, hauteur)
		return { canvas, ctx }
	}
	// Un JPEG n'a jamais d'alpha ; sinon on sonde une copie réduite
	let transparente = false
	if (blob.type !== 'image/jpeg') {
		const k = Math.min(1, COTE_SONDE / Math.max(bitmap.width, bitmap.height, 1))
		const l = Math.max(1, Math.round(bitmap.width * k))
		const h = Math.max(1, Math.round(bitmap.height * k))
		const { ctx } = dessiner(l, h)
		const pixels = ctx.getImageData(0, 0, l, h).data
		for (let i = 3; i < pixels.length; i += 4) {
			if (pixels[i] < 255) {
				transparente = true
				break
			}
		}
	}
	return {
		largeur: bitmap.width,
		hauteur: bitmap.height,
		transparente,
		encoder: (largeur, hauteur, mime, qualite) =>
			new Promise<Blob>((resolve, reject) => {
				const { canvas } = dessiner(largeur, hauteur)
				canvas.toBlob(
					(b) => (b ? resolve(b) : reject(new Error('Encodage impossible'))),
					mime,
					qualite,
				)
			}),
		liberer: () => bitmap.close?.(),
	}
}

// ── L'appel de la route ─────────────────────────────────────────────────────

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

type Pb = {
	send: (chemin: string, options: Record<string, unknown>) => Promise<unknown>
}

/**
 * `pb.send` lit TOUJOURS la réponse comme du JSON : un PNG y devient `{}`. On
 * lui passe donc un `fetch` qui garde un clone de la réponse, dont on lit les
 * octets ensuite. Les échecs (JSON `{ error, code }`) sortent, eux, par
 * l'exception ordinaire de `pb.send`.
 */
export async function appelerDetourage(pb: Pb, image: Blob): Promise<Blob> {
	let brute: Response | null = null
	const capter = async (url: RequestInfo | URL, config?: RequestInit) => {
		const reponse = await fetch(url, config)
		brute = reponse.clone()
		return reponse
	}
	const corps = new FormData()
	corps.append('image', image, 'image')
	try {
		// `requestKey: null` : pas d'auto-annulation par une autre requête
		await pb.send(ROUTE_DETOURAGE, {
			method: 'POST',
			body: corps,
			fetch: capter,
			requestKey: null,
		})
	} catch (e) {
		throw traduireErreur(e)
	}
	const reponse = brute as Response | null
	if (!reponse) throw new ErreurDetourage('reponse_invalide')
	const octets = new Uint8Array(await reponse.arrayBuffer())
	if (!SIGNATURE_PNG.every((o, i) => octets[i] === o))
		throw new ErreurDetourage('reponse_invalide')
	return new Blob([octets], { type: 'image/png' })
}

// ── L'état affiché par le panneau ───────────────────────────────────────────

export type EtatDetourage = {
	enCours: boolean
	erreur: ErreurDetourage | null
	/** Ce qui s'est passé APRÈS le paiement : image non rangée, ou élément changé. */
	info: { ton: 'info' | 'avertissement'; message: string } | null
	/** Images rangées depuis le lancement : le sous-onglet « Génération » s'y relit. */
	rangees: number
}

/**
 * Hors du composant : le panneau est remplacé quand la sélection change, et ni
 * « en cours » (pas de double paiement) ni le message ne doivent s'y perdre.
 */
export const useEtatDetourage = create<EtatDetourage>(() => ({
	enCours: false,
	erreur: null,
	info: null,
	rangees: 0,
}))

export const effacerMessageDetourage = () =>
	useEtatDetourage.setState({ erreur: null, info: null })

// ── Le trajet complet ───────────────────────────────────────────────────────

export type DepsDetourage = {
	pb: Pb
	/** Le store de l'éditeur : `getState()` rend `elements` et `updateElements`. */
	store: { getState: () => any }
	/** `presetImageService` : seule `ajouterGeneree` sert ici. */
	bibliotheque: {
		ajouterGeneree: (image: {
			src: string
			depuis: string
			size: number
			type: string
		}) => Promise<unknown>
	}
	codec?: Codec
	source?: (el: any) => Promise<Blob>
}

export type ResultatDetourage =
	| { ok: true; pose: boolean; rangee: boolean; src: string }
	| { ok: false; erreur: ErreurDetourage }

const nomDe = (el: any) => String(el?.filename || el?.name || 'image')

const MSG_NON_RANGEE =
	"L'image détourée est posée, mais elle n'a pas pu être rangée dans « Génération » (espace du poste insuffisant)."
const MSG_ELEMENT_CHANGE =
	"L'image a changé pendant le détourage : le résultat n'a pas été posé. Il vous attend dans « Génération »."
const MSG_PERDUE =
	"L'image a changé pendant le détourage, et le résultat n'a pu être ni posé ni rangé (espace du poste insuffisant). Recommencez."

/**
 * Détoure `el` (l'élément tel qu'à l'instant du clic). Ne lève jamais : les
 * échecs sortent dans le résultat ET dans `useEtatDetourage`.
 */
export async function lancerDetourage(
	el: any,
	nombre: number,
	deps: DepsDetourage,
): Promise<ResultatDetourage> {
	const etat = useEtatDetourage
	const refus = peutDetourer(el, nombre, etat.getState().enCours)
	if (!refus.ok) {
		const erreur = new ErreurDetourage('service_indisponible', refus.raison)
		etat.setState({ erreur, info: null })
		return { ok: false, erreur }
	}

	// L'élément tel qu'au lancement : c'est ce que l'arrivée compare
	const id: string = el.id
	const srcDepart: string = el.src
	const depuis = nomDe(el)
	etat.setState({ enCours: true, erreur: null, info: null })

	try {
		let png: Blob
		try {
			const source = await (deps.source ?? sourceAEnvoyer)(el)
			const preparee = await preparerImage(source, deps.codec)
			png = await appelerDetourage(deps.pb, preparee.blob)
		} catch (e) {
			const erreur =
				e instanceof ErreurDetourage
					? e
					: new ErreurDetourage(
							'service_indisponible',
							e instanceof Error ? e.message : undefined,
						)
			etat.setState({ erreur })
			return { ok: false, erreur }
		}

		// 2) RANGER, avant de toucher à l'élément. Une data URL, comme une image importée.
		const src = await blobEnDataURL(png)
		let rangee = true
		try {
			await deps.bibliotheque.ajouterGeneree({
				src,
				depuis,
				size: png.size,
				type: 'image/png',
			})
			etat.setState((s) => ({ rangees: s.rangees + 1 }))
		} catch (e) {
			console.error('❌ [DETOURAGE] Rangement impossible:', e)
			rangee = false
		}

		// 3) POSER, si l'élément est encore tel qu'au lancement. L'`id` capturé,
		// jamais la sélection courante : elle a pu bouger pendant l'attente.
		const etatStore = deps.store.getState()
		const cible = etatStore.elements.find((e: any) => e.id === id)
		const posable = !!cible && !cible.locked && cible.src === srcDepart
		if (posable) etatStore.updateElements({ [id]: { src } })

		if (posable && !rangee)
			etat.setState({ info: { ton: 'avertissement', message: MSG_NON_RANGEE } })
		else if (!posable) {
			etat.setState({
				info: rangee
					? { ton: 'info', message: MSG_ELEMENT_CHANGE }
					: { ton: 'avertissement', message: MSG_PERDUE },
			})
		}
		return { ok: true, pose: posable, rangee, src }
	} finally {
		etat.setState({ enCours: false })
	}
}
