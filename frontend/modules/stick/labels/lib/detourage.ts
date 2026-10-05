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
	/** La demande elle-même est à corriger (consigne, qualité) : retouche seulement. */
	| 'demande'
	/** Refus de la modération du fournisseur : recommencer à l'identique ne sert à rien. */
	| 'contenu'

const FAMILLES: Record<string, FamilleErreur> = {
	credit_epuise: 'credit',
	image_trop_lourde: 'taille',
	type_refuse: 'format',
	fournisseur_en_echec: 'service',
	delai_depasse: 'service',
	service_indisponible: 'service',
	reponse_invalide: 'service',
	cle_absente: 'configuration',
	cle_invalide: 'configuration',
	adresse_non_securisee: 'configuration',
	session_expiree: 'session',
	prompt_absent: 'demande',
	prompt_trop_long: 'demande',
	qualite_inconnue: 'demande',
	format_inconnu: 'demande',
	trop_d_images: 'demande',
	contenu_refuse: 'contenu',
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
	// Pas une panne : le service n'a pas fini à temps. Le message du serveur, lui,
	// précise que rien n'a été décompté — ce repli ne le promet pas.
	delai_depasse:
		"Le service de détourage n'a pas répondu à temps. Réessayez dans un instant.",
	service_indisponible:
		'Le service de détourage est injoignable. Réessayez dans un instant.',
	reponse_invalide:
		'Le service de détourage a rendu une réponse inexploitable.',
	cle_absente: "La clé PocketApp n'est pas configurée sur ce poste.",
	cle_invalide:
		'La clé PocketApp de ce poste est refusée. Vérifiez-la dans « Clés API & Secrets ».',
	adresse_non_securisee: 'Le détourage exige une adresse HTTPS.',
	session_expiree: 'Votre session a expiré. Reconnectez-vous puis recommencez.',
	prompt_absent: "Écrivez ce que vous voulez changer dans l'image.",
	prompt_trop_long: 'La consigne est trop longue (500 caractères au plus).',
	qualite_inconnue: "Cette qualité de retouche n'existe pas.",
	format_inconnu: "Ce format de résultat n'existe pas.",
	trop_d_images: 'Une composition accepte 4 éléments au plus.',
	contenu_refuse:
		"Cette demande a été refusée par le service : changez la consigne ou l'image. Rien n'a été décompté.",
}

/** Le message de repli d'un code (celui du détourage), pour qu'une autre tâche le remplace par le sien. */
export const messageDeRepli = (code: string): string | undefined =>
	MESSAGES[code]

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
	if (status === 504) return new ErreurDetourage('delai_depasse')
	if (status === 422) return new ErreurDetourage('contenu_refuse')
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
	/** Plus grand côté envoyé ; la retouche envoie plus petit (`lib/retouche.ts`). */
	coteMax: number = COTE_MAX,
	/** Poids maximal du fichier ; une composition le partage entre ses images. */
	seuilOctets: number = SEUIL_ENVOI_OCTETS,
): Promise<ImagePreparee> {
	const image = await codec(blob)
	try {
		const mime = image.transparente ? 'image/webp' : 'image/jpeg'
		let echelle = Math.min(
			1,
			coteMax / Math.max(image.largeur, image.hauteur, 1),
		)
		for (;;) {
			const largeur = Math.max(1, Math.round(image.largeur * echelle))
			const hauteur = Math.max(1, Math.round(image.hauteur * echelle))
			const sortie = await image.encoder(largeur, hauteur, mime, QUALITE_ENVOI)
			if (sortie.size <= seuilOctets) return { blob: sortie, largeur, hauteur }
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

export type Pb = {
	send: (chemin: string, options: Record<string, unknown>) => Promise<unknown>
}

/**
 * `pb.send` lit TOUJOURS la réponse comme du JSON : un PNG y devient `{}`. On
 * lui passe donc un `fetch` qui garde un clone de la réponse, dont on lit les
 * octets ensuite. Les échecs (JSON `{ error, code }`) sortent, eux, par
 * l'exception ordinaire de `pb.send`.
 */
export function appelerDetourage(
	pb: Pb,
	image: Blob,
	/** La réponse a commencé d'arriver : il ne reste qu'à lire ses octets. */
	surReception?: () => void,
): Promise<ReponseDetourage> {
	const corps = new FormData()
	corps.append('image', image, 'image')
	return appelerRouteImage(pb, ROUTE_DETOURAGE, corps, surReception)
}

/**
 * L'appel commun aux routes qui rendent un PNG (détourage, retouche) : `corps`
 * porte l'image et, s'il y en a, les champs de la tâche.
 */
export async function appelerRouteImage(
	pb: Pb,
	route: string,
	corps: FormData,
	surReception?: () => void,
): Promise<ReponseDetourage> {
	let brute: Response | null = null
	const capter = async (url: RequestInfo | URL, config?: RequestInit) => {
		const reponse = await fetch(url, config)
		brute = reponse.clone()
		return reponse
	}
	try {
		// `requestKey: null` : pas d'auto-annulation par une autre requête
		await pb.send(route, {
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
	surReception?.()
	const octets = new Uint8Array(await reponse.arrayBuffer())
	if (!SIGNATURE_PNG.every((o, i) => octets[i] === o))
		throw new ErreurDetourage('reponse_invalide')
	// Durée de l'appel au fournisseur, mesurée par le mini-SaaS et relayée par la
	// route. Absente tant que le serveur n'est pas redéposé : ce n'est pas une erreur.
	const ms = Number.parseInt(reponse.headers.get('X-Detourage-Ms') ?? '', 10)
	return {
		png: new Blob([octets], { type: 'image/png' }),
		serveurMs: Number.isFinite(ms) && ms >= 0 ? ms : null,
	}
}

export type ReponseDetourage = { png: Blob; serveurMs: number | null }

// ── Les étapes et la jauge ──────────────────────────────────────────────────
//
// Le serveur ne rend AUCUN avancement pendant le calcul : la jauge dit l'étape
// en cours, jamais un pourcentage. L'envoi et le calcul ne se distinguent pas
// depuis le renderer (l'image part d'abord à la route Go locale, qui la relaie
// et attend) : ils forment UNE étape, la plus longue.

export type EtapeDetourage =
	| 'preparation'
	| 'detourage'
	| 'reception'
	| 'rangement'

export const ETAPES_DETOURAGE: EtapeDetourage[] = [
	'preparation',
	'detourage',
	'reception',
	'rangement',
]

export const LIBELLES_ETAPE: Record<EtapeDetourage, string> = {
	preparation: "Préparation de l'image",
	detourage: 'Envoi et détourage',
	reception: "Réception de l'image",
	rangement: 'Rangement dans « Génération »',
}

/** Les mêmes étapes, dites pour la retouche par consigne (`lib/retouche.ts`). */
export const LIBELLES_ETAPE_RETOUCHE: Record<EtapeDetourage, string> = {
	...LIBELLES_ETAPE,
	detourage: 'Envoi et retouche',
}

/** Les tâches d'IA de l'éditeur. UNE seule à la fois : elles partagent `useEtatDetourage`. */
export type NomTache =
	| 'detourage'
	| 'retouche'
	| 'embellir'
	| 'generation'
	| 'composition'

/** Les mêmes étapes, dites pour l'embellissement de la page (`lib/embellir.ts`). */
export const LIBELLES_ETAPE_EMBELLIR: Record<EtapeDetourage, string> = {
	...LIBELLES_ETAPE,
	preparation: 'Rendu de la page',
	detourage: 'Envoi et embellissement',
}

/** Pour la génération depuis un texte (`lib/generer.ts`) : aucune image ne part. */
export const LIBELLES_ETAPE_GENERATION: Record<EtapeDetourage, string> = {
	...LIBELLES_ETAPE,
	preparation: 'Préparation de la demande',
	detourage: 'Envoi et génération',
}

/** Pour la composition depuis des éléments de la page (`lib/composer.ts`). */
export const LIBELLES_ETAPE_COMPOSITION: Record<EtapeDetourage, string> = {
	...LIBELLES_ETAPE,
	preparation: 'Préparation des éléments',
	detourage: 'Envoi et composition',
}

const LIBELLES_PAR_TACHE: Record<NomTache, Record<EtapeDetourage, string>> = {
	detourage: LIBELLES_ETAPE,
	retouche: LIBELLES_ETAPE_RETOUCHE,
	embellir: LIBELLES_ETAPE_EMBELLIR,
	generation: LIBELLES_ETAPE_GENERATION,
	composition: LIBELLES_ETAPE_COMPOSITION,
}

export const libellesDe = (
	tache: NomTache | null | undefined,
): Record<EtapeDetourage, string> =>
	(tache && LIBELLES_PAR_TACHE[tache]) || LIBELLES_ETAPE

/** Durées gardées sur ce poste pour estimer la suivante. */
export const HISTORIQUE_MAX = 10
/** Sans historique, attente au-delà de laquelle on prévient que cela peut durer. */
export const ATTENTE_LONGUE_MS = 15_000
/** L'estimation se dit par pas de 5 s : « environ 10 s », jamais un compte à rebours. */
const PAS_ESTIMATION_MS = 5_000

/** La durée habituelle : la MÉDIANE (un démarrage à froid isolé ne la déplace pas). */
export function dureeHabituelle(durees: number[]): number | null {
	const valides = durees
		.filter((d) => Number.isFinite(d) && d > 0)
		.sort((a, b) => a - b)
	if (!valides.length) return null
	const milieu = Math.floor(valides.length / 2)
	return valides.length % 2
		? valides[milieu]
		: (valides[milieu - 1] + valides[milieu]) / 2
}

export type Estimation =
	/** Pas d'historique : seulement l'étape. */
	| { sorte: 'inconnue' }
	/** Pas d'historique, et l'attente se prolonge. */
	| { sorte: 'longue' }
	| { sorte: 'estimee'; secondes: number }
	/** La durée habituelle vient de passer : encore un instant. */
	| { sorte: 'bientot' }
	/** Nettement au-delà de l'habitude (démarrage à froid) : jamais de négatif. */
	| { sorte: 'depassee' }

/**
 * Le temps restant de l'étape « détourage », ESTIMÉ depuis les durées réelles
 * des détourages précédents sur ce poste (`habituelMs`, null sans historique).
 */
export function estimerRestant(
	habituelMs: number | null,
	ecouleMs: number,
): Estimation {
	if (habituelMs == null || !(habituelMs > 0))
		return { sorte: ecouleMs >= ATTENTE_LONGUE_MS ? 'longue' : 'inconnue' }
	const restant = habituelMs - ecouleMs
	if (restant > 0) {
		return {
			sorte: 'estimee',
			secondes:
				(Math.ceil(restant / PAS_ESTIMATION_MS) * PAS_ESTIMATION_MS) / 1000,
		}
	}
	// Une marge avant de parler de retard : la moitié de l'habitude, 5 s au moins
	return -restant <= Math.max(PAS_ESTIMATION_MS, habituelMs / 2)
		? { sorte: 'bientot' }
		: { sorte: 'depassee' }
}

export type MessageJauge = {
	/** L'étape, en clair. */
	etape: string
	/** Ce qu'on sait de l'attente, ou rien. */
	detail: string | null
	/** Vrai quand l'attente dépasse l'habitude : rassurer, pas alarmer. */
	prolongee: boolean
}

/** Ce que la jauge affiche. Une durée n'apparaît que pendant « détourage ». */
export function messageJauge(
	etape: EtapeDetourage,
	habituelMs: number | null,
	ecouleMs: number,
	libelles: Record<EtapeDetourage, string> = LIBELLES_ETAPE,
): MessageJauge {
	const base = { etape: libelles[etape], detail: null, prolongee: false }
	if (etape !== 'detourage') return base
	const estimation = estimerRestant(habituelMs, ecouleMs)
	switch (estimation.sorte) {
		case 'estimee':
			return { ...base, detail: `environ ${estimation.secondes} s` }
		case 'bientot':
			return { ...base, detail: 'encore quelques secondes' }
		case 'depassee':
			return {
				...base,
				prolongee: true,
				detail:
					"Le service met plus de temps que d'habitude : l'attente peut aller jusqu'à une minute. Vous pouvez continuer à travailler.",
			}
		case 'longue':
			return {
				...base,
				prolongee: true,
				detail:
					"L'attente peut aller jusqu'à une minute. Vous pouvez continuer à travailler.",
			}
		default:
			return base
	}
}

/** Les durées réelles des détourages précédents, gardées sur le poste. */
export type HistoriqueDurees = {
	lire: () => number[]
	ajouter: (ms: number) => void
}

const CLE_HISTORIQUE = 'pocketstick.detourage.durees'

/**
 * Un historique dans `localStorage`, sous `cle`, sans jamais lever : sans
 * stockage, pas d'estimation, c'est tout. Une clé PAR tâche (et par qualité
 * pour la retouche) : un modèle lent fausserait l'estimation des autres.
 */
export const historiqueLocalPour = (cle: string): HistoriqueDurees => {
	const lire = () => {
		try {
			const brut = JSON.parse(localStorage.getItem(cle) ?? '[]')
			return Array.isArray(brut)
				? brut.filter((d) => typeof d === 'number' && d > 0)
				: []
		} catch {
			return []
		}
	}
	return {
		lire,
		ajouter: (ms) => {
			try {
				const suite = [...lire(), Math.round(ms)].slice(-HISTORIQUE_MAX)
				localStorage.setItem(cle, JSON.stringify(suite))
			} catch {
				// stockage plein ou absent : l'estimation manquera, rien d'autre
			}
		},
	}
}

/** L'historique du détourage. */
export const historiqueLocal: HistoriqueDurees =
	historiqueLocalPour(CLE_HISTORIQUE)

/**
 * Les durées d'un détourage, en millisecondes, pour le journal de debug
 * (`console.debug`, filtre « DETOURAGE ») : c'est ce qui dit si l'attente est
 * chez le fournisseur (`serveur`) ou dans les transferts (`allerRetour − serveur`).
 */
export type ChronoDetourage = {
	source: number
	preparation: number
	/** Envoi, calcul et retour des en-têtes, vus du renderer. */
	allerRetour: number
	/** L'appel au fournisseur, mesuré par le mini-SaaS ; null s'il ne le rend pas. */
	serveur: number | null
	/** Lecture des octets et conversion en data URL. */
	reception: number
	rangement: number
	pose: number
	total: number
	octetsEnvoyes: number
	octetsRecus: number
	cote: string
}

// ── L'état affiché par le panneau ───────────────────────────────────────────

export type EtatDetourage = {
	/** Une requête d'IA est partie — détourage OU retouche : une seule à la fois. */
	enCours: boolean
	/** La tâche en cours, ou la dernière lancée : c'est d'elle que parlent `erreur` et `info`. */
	tache: NomTache | null
	erreur: ErreurDetourage | null
	/** Ce qui s'est passé APRÈS le paiement : image non rangée, ou élément changé. */
	info: { ton: 'info' | 'avertissement'; message: string } | null
	/** Images rangées depuis le lancement : le sous-onglet « Génération » s'y relit. */
	rangees: number
	/** L'étape en cours, pour la jauge ; null au repos. */
	etape: EtapeDetourage | null
	/** Début de l'étape en cours (`Date.now()`). */
	debutEtape: number
	/** Durée habituelle de l'étape « détourage » sur ce poste, lue au lancement. */
	habituelMs: number | null
}

/**
 * Hors du composant : le panneau est remplacé quand la sélection change, et ni
 * « en cours » (pas de double paiement) ni le message ne doivent s'y perdre.
 */
export const useEtatDetourage = create<EtatDetourage>(() => ({
	enCours: false,
	tache: null,
	erreur: null,
	info: null,
	rangees: 0,
	etape: null,
	debutEtape: 0,
	habituelMs: null,
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
			suffixe?: string
			type: string
		}) => Promise<unknown>
	}
	codec?: Codec
	source?: (el: any) => Promise<Blob>
	/** Durées des détourages précédents ; par défaut `historiqueLocal`. */
	historique?: HistoriqueDurees
	/** L'horloge, en millisecondes ; par défaut `Date.now`. */
	maintenant?: () => number
	/** Appelé dès que l'image est livrée, donc décomptée : rafraîchir le solde affiché. */
	apresDecompte?: () => void
}

export type ResultatDetourage =
	| {
			ok: true
			pose: boolean
			rangee: boolean
			src: string
			chrono: ChronoDetourage
	  }
	| { ok: false; erreur: ErreurDetourage }

const nomDe = (el: any) => String(el?.filename || el?.name || 'image')

/**
 * Ce qui distingue deux tâches d'IA sur le MÊME trajet (préparer, envoyer,
 * ranger, poser) : le détourage ci-dessous, la retouche dans `lib/retouche.ts`.
 */
export type TacheIA = {
	nom: NomTache
	peut: (el: any, nombre: number, enCours: boolean) => Refus
	appeler: (
		pb: Pb,
		image: Blob,
		surReception: () => void,
		/** Toutes les images préparées, quand la tâche a des `sources`. */
		images?: Blob[],
	) => Promise<ReponseDetourage>
	/** Plus grand côté envoyé ; par défaut `COTE_MAX`. */
	coteMax?: number
	/** Poids maximal de CHAQUE image envoyée ; par défaut `SEUIL_ENVOI_OCTETS`. */
	seuilOctets?: number
	/**
	 * Les sources, quand il n'y en a pas UNE : aucune (un texte seul,
	 * `lib/generer.ts`) ou plusieurs (les ingrédients, `lib/composer.ts`).
	 * Chacune est préparée comme une image seule ; `appeler` les reçoit en
	 * quatrième argument.
	 */
	sources?: () => Promise<Blob[]>
	/**
	 * Le résultat n'est PAS posé : il est rangé dans « Génération », et le
	 * vendeur le pose lui-même (`lib/generer.ts`). Rien de la page n'est touché.
	 */
	sansPose?: boolean
	/** Les durées de CETTE tâche sur le poste. */
	historique: HistoriqueDurees
	/** Ce qui s'est passé après le paiement. */
	messages: { nonRangee: string; elementChange: string; perdue: string }
	/** Messages d'erreur de repli propres à la tâche, par code. */
	messagesErreur?: Record<string, string>
	/** Filtre du journal de debug de la console. */
	journal: string
	/**
	 * La source, quand ce n'est pas l'image d'un élément : le rendu de la PAGE
	 * (`lib/embellir.ts`). `el` vaut alors null.
	 */
	source?: () => Promise<Blob>
	/**
	 * La pose, quand ce n'est pas le remplacement de la `src` d'un élément : un
	 * NOUVEAU calque. Rend vrai si l'image a été posée. Un seul pas d'historique.
	 */
	poser?: (src: string, etatStore: any) => boolean
	/** Le nom de l'image de départ, quand il n'y a pas d'élément. */
	depuis?: string
	/** Ce que la bibliothèque écrit après le nom : « détourée » par défaut. */
	suffixe?: string
}

export const TACHE_DETOURAGE: TacheIA = {
	nom: 'detourage',
	peut: peutDetourer,
	appeler: appelerDetourage,
	historique: historiqueLocal,
	messages: {
		nonRangee:
			"L'image détourée est posée, mais elle n'a pas pu être rangée dans « Génération » (espace du poste insuffisant).",
		elementChange:
			"L'image a changé pendant le détourage : le résultat n'a pas été posé. Il vous attend dans « Génération ».",
		perdue:
			"L'image a changé pendant le détourage, et le résultat n'a pu être ni posé ni rangé (espace du poste insuffisant). Recommencez.",
	},
	journal: 'DETOURAGE',
}

/**
 * Détoure `el` (l'élément tel qu'à l'instant du clic). Ne lève jamais : les
 * échecs sortent dans le résultat ET dans `useEtatDetourage`.
 */
export function lancerDetourage(
	el: any,
	nombre: number,
	deps: DepsDetourage,
): Promise<ResultatDetourage> {
	return lancerTraitement(el, nombre, deps, TACHE_DETOURAGE)
}

/**
 * LE trajet d'une tâche d'IA sur une image : préparer, envoyer, RANGER dans
 * « Génération », puis POSER en un pas d'historique. Ne lève jamais.
 */
export async function lancerTraitement(
	el: any,
	nombre: number,
	deps: DepsDetourage,
	tache: TacheIA,
): Promise<ResultatDetourage> {
	const etat = useEtatDetourage
	const refus = tache.peut(el, nombre, etat.getState().enCours)
	if (!refus.ok) {
		const erreur = new ErreurDetourage('service_indisponible', refus.raison)
		// Refusée parce qu'une AUTRE tâche est en cours : ne pas lui prendre sa jauge
		etat.setState(
			etat.getState().enCours
				? { erreur, info: null }
				: { erreur, info: null, tache: tache.nom },
		)
		return { ok: false, erreur }
	}

	// L'élément tel qu'au lancement : c'est ce que l'arrivée compare
	const id: string | undefined = el?.id
	const srcDepart: string | undefined = el?.src
	const depuis = tache.depuis ?? nomDe(el)
	const maintenant = deps.maintenant ?? Date.now
	const historique = deps.historique ?? tache.historique
	const debut = maintenant()
	let jalon = debut
	/** Le temps passé depuis le jalon précédent, qui avance. */
	const tour = () => {
		const t = maintenant()
		const ecoule = t - jalon
		jalon = t
		return ecoule
	}
	const passerA = (etape: EtapeDetourage) =>
		etat.setState({ etape, debutEtape: maintenant() })
	etat.setState({
		enCours: true,
		tache: tache.nom,
		erreur: null,
		info: null,
		etape: 'preparation',
		debutEtape: debut,
		habituelMs: dureeHabituelle(historique.lire()),
	})

	try {
		let png: Blob
		const chrono: ChronoDetourage = {
			source: 0,
			preparation: 0,
			allerRetour: 0,
			serveur: null,
			reception: 0,
			rangement: 0,
			pose: 0,
			total: 0,
			octetsEnvoyes: 0,
			octetsRecus: 0,
			cote: '',
		}
		try {
			// Une source (l'image d'un élément, le rendu de la page), aucune ou plusieurs
			const brutes = tache.sources
				? await tache.sources()
				: [
						await (tache.source
							? tache.source()
							: (deps.source ?? sourceAEnvoyer)(el)),
					]
			chrono.source = tour()
			const preparees: ImagePreparee[] = []
			for (const brute of brutes)
				preparees.push(
					await preparerImage(
						brute,
						deps.codec,
						tache.coteMax,
						tache.seuilOctets,
					),
				)
			chrono.preparation = tour()
			chrono.octetsEnvoyes = preparees.reduce((n, p) => n + p.blob.size, 0)
			chrono.cote = preparees
				.map((p) => `${p.largeur}×${p.hauteur}`)
				.join(' + ')
			passerA('detourage')
			const reponse = await tache.appeler(
				deps.pb,
				preparees[0]?.blob ?? new Blob([]),
				() => {
					chrono.allerRetour = tour()
					passerA('reception')
				},
				preparees.map((p) => p.blob),
			)
			png = reponse.png
			chrono.serveur = reponse.serveurMs
			chrono.octetsRecus = png.size
			// L'image est livrée : elle est décomptée, et cette durée est une durée réelle
			historique.ajouter(chrono.allerRetour)
			try {
				deps.apresDecompte?.()
			} catch {
				// le solde affiché se rafraîchira de lui-même
			}
		} catch (e) {
			let erreur =
				e instanceof ErreurDetourage
					? e
					: new ErreurDetourage(
							'service_indisponible',
							e instanceof Error ? e.message : undefined,
						)
			// Un message de repli parle du détourage : la tâche dit le sien
			const sien = tache.messagesErreur?.[erreur.code]
			if (sien && erreur.message === MESSAGES[erreur.code])
				erreur = new ErreurDetourage(erreur.code, sien)
			etat.setState({ erreur })
			return { ok: false, erreur }
		}

		// 2) RANGER, avant de toucher à l'élément. Une data URL, comme une image importée.
		const src = await blobEnDataURL(png)
		chrono.reception = tour()
		passerA('rangement')
		let rangee = true
		try {
			await deps.bibliotheque.ajouterGeneree({
				src,
				depuis,
				size: png.size,
				...(tache.suffixe ? { suffixe: tache.suffixe } : {}),
				type: 'image/png',
			})
			etat.setState((s) => ({ rangees: s.rangees + 1 }))
		} catch (e) {
			console.error(`❌ [${tache.journal}] Rangement impossible:`, e)
			rangee = false
		}
		chrono.rangement = tour()

		// 3) POSER, si l'élément est encore tel qu'au lancement. L'`id` capturé,
		// jamais la sélection courante : elle a pu bouger pendant l'attente.
		const etatStore = deps.store.getState()
		let posable: boolean
		if (tache.sansPose) {
			posable = false
		} else if (tache.poser) {
			posable = tache.poser(src, etatStore)
		} else {
			const cible = etatStore.elements.find((e: any) => e.id === id)
			posable = !!cible && !cible.locked && cible.src === srcDepart
			if (posable && id) etatStore.updateElements({ [id]: { src } })
		}
		chrono.pose = tour()
		chrono.total = maintenant() - debut
		// Journal discret (niveau « Verbose » de la console, filtre DETOURAGE ou RETOUCHE)
		console.debug(`[${tache.journal}] durées en ms`, chrono)

		if (tache.sansPose) {
			// Rien à poser : seul un rangement manqué se dit, l'image est alors perdue
			if (!rangee)
				etat.setState({
					info: { ton: 'avertissement', message: tache.messages.perdue },
				})
		} else if (posable && !rangee)
			etat.setState({
				info: { ton: 'avertissement', message: tache.messages.nonRangee },
			})
		else if (!posable) {
			etat.setState({
				info: rangee
					? { ton: 'info', message: tache.messages.elementChange }
					: { ton: 'avertissement', message: tache.messages.perdue },
			})
		}
		return { ok: true, pose: posable, rangee, src, chrono }
	} finally {
		etat.setState({ enCours: false, etape: null })
	}
}
