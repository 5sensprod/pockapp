// frontend/lib/facebook/client.ts
//
// PUBLICATION SUR FACEBOOK — le client des routes locales `/api/facebook/*`
// (`backend/routes/facebook_routes.go`). Doc :
// `modules/stick/PocketStick-docs/16-publication-facebook.md`.
//
// Le renderer ne voit JAMAIS un jeton : ni celui de la Page (gardé chiffré sur
// le mini-SaaS, qui publie lui-même), ni le jeton utilisateur qu'un
// administrateur colle — il part une fois et rien ne le rend. Rien n'est écrit
// dans `localStorage`, et rien ne part dans une adresse.

export const ROUTE_FACEBOOK_ETAT = '/api/facebook/etat'
export const ROUTE_FACEBOOK_CONNECTER = '/api/facebook/connecter'
export const ROUTE_FACEBOOK_CHOISIR = '/api/facebook/choisir'
export const ROUTE_FACEBOOK_DECONNECTER = '/api/facebook/deconnecter'
export const ROUTE_FACEBOOK_PUBLIER = '/api/facebook/publier'

/** `facebookMessageMax` de la route, `FB_MESSAGE_MAX` du mini-SaaS. */
export const MESSAGE_MAX = 2000
/** Le seul préfixe qu'un lien de publication peut porter. */
export const PREFIXE_LIEN = 'https://www.facebook.com/'

export type Pb = {
	send: (chemin: string, options: Record<string, unknown>) => Promise<unknown>
}

export type PageFacebook = { id: string; nom: string }

export type EtatFacebook = {
	/** Le serveur PocketApp a-t-il les secrets de l'application Facebook ? */
	configure: boolean
	/** Une Page est-elle choisie ? C'est sur elle que tout le monde publie. */
	connecte: boolean
	page: PageFacebook | null
	/** Date de la connexion, ISO 8601. */
	depuis: string | null
	/** Après une connexion à plusieurs Pages : celles qui attendent un choix. */
	aChoisir: PageFacebook[]
}

export type PublicationFacebook = { lien: string; page: PageFacebook | null }

// ── Erreurs ─────────────────────────────────────────────────────────────────

/** Replis quand la route n'a rendu aucun message (réseau coupé, session). */
const MESSAGES: Record<string, string> = {
	service_indisponible:
		"Le service PocketApp est injoignable. Rien n'est parti ; réessayez dans un instant.",
	reponse_invalide: 'Le service PocketApp a rendu une réponse inexploitable.',
	session_expiree: 'Votre session a expiré. Reconnectez-vous puis recommencez.',
	reserve_admin: 'Cette action est réservée aux administrateurs.',
	publication_incertaine:
		"La publication n'a pas été confirmée : elle est peut-être en ligne. Vérifiez la Page avant de réessayer.",
	deja_envoye:
		"Cette publication a déjà été envoyée. Vérifiez la Page avant d'en préparer une nouvelle.",
	image_trop_lourde: "L'image de l'affiche est trop lourde pour être publiée.",
}

/**
 * Après ces codes, l'affiche est PEUT-ÊTRE en ligne : on ne propose jamais de
 * renvoyer la même publication, on demande de regarder la Page.
 */
const INCERTAINS = new Set(['publication_incertaine', 'deja_envoye'])

/** Après ces codes, c'est à un administrateur de (re)faire la connexion. */
const A_RECONNECTER = new Set([
	'jeton_expire',
	'page_non_connectee',
	'permission_manquante',
	'configuration_absente',
])

export class ErreurFacebook extends Error {
	code: string
	incertain: boolean
	aReconnecter: boolean
	constructor(code: string, message?: string) {
		super(message || MESSAGES[code] || MESSAGES.service_indisponible)
		this.name = 'ErreurFacebook'
		this.code = code
		this.incertain = INCERTAINS.has(code)
		this.aReconnecter = A_RECONNECTER.has(code)
	}
}

/**
 * Ce que `pb.send` lève (`status`, `response` = `{ error, code }`) → une
 * `ErreurFacebook`. `publication` : sans réponse lisible, l'affiche a pu
 * partir — on ne dit pas « rien n'est parti » sans le savoir.
 */
export function traduireErreurFacebook(
	e: unknown,
	publication = false,
): ErreurFacebook {
	if (e instanceof ErreurFacebook) return e
	const err = e as {
		status?: number
		response?: { code?: unknown; error?: unknown }
	} | null
	const code = typeof err?.response?.code === 'string' ? err.response.code : ''
	const message =
		typeof err?.response?.error === 'string' ? err.response.error.trim() : ''
	if (code) return new ErreurFacebook(code, message || undefined)
	const status = err?.status ?? 0
	if (status === 401) return new ErreurFacebook('session_expiree')
	if (status === 403) return new ErreurFacebook('reserve_admin')
	if (status === 413) return new ErreurFacebook('image_trop_lourde')
	// Refus net de la route (400, 404…) : rien n'est parti
	if (status >= 400 && status < 500)
		return new ErreurFacebook('service_indisponible')
	return new ErreurFacebook(
		publication ? 'publication_incertaine' : 'service_indisponible',
	)
}

// ── L'état ──────────────────────────────────────────────────────────────────

const estPage = (p: any): p is PageFacebook =>
	!!p && typeof p.id === 'string' && /^\d{1,32}$/.test(p.id)

const enPage = (p: any): PageFacebook => ({
	id: p.id,
	nom: typeof p.nom === 'string' && p.nom.trim() ? p.nom : `Page ${p.id}`,
})

/** La réponse des routes d'état, relue champ par champ : rien d'autre n'entre. */
export function lireEtatRendu(rendu: unknown): EtatFacebook {
	const r = (rendu ?? {}) as Record<string, unknown>
	const page = estPage(r.page) ? enPage(r.page) : null
	return {
		configure: r.configure === true,
		connecte: r.connecte === true && page !== null,
		page,
		depuis: typeof r.depuis === 'string' && r.depuis ? r.depuis : null,
		aChoisir: Array.isArray(r.a_choisir)
			? r.a_choisir.filter(estPage).map(enPage)
			: [],
	}
}

const envoyerEtat = async (
	pb: Pb,
	route: string,
	method: 'GET' | 'POST',
	body?: Record<string, string>,
): Promise<EtatFacebook> => {
	try {
		return lireEtatRendu(
			await pb.send(route, {
				method,
				...(body ? { body } : {}),
				// Pas d'auto-annulation par une autre requête
				requestKey: null,
			}),
		)
	} catch (e) {
		throw traduireErreurFacebook(e)
	}
}

export const lireEtatFacebook = (pb: Pb) =>
	envoyerEtat(pb, ROUTE_FACEBOOK_ETAT, 'GET')

/**
 * Le jeton utilisateur généré dans les outils de Meta (phase 1). Il part dans
 * le CORPS, une fois ; rien ne le garde ici, et aucune réponse ne le rend.
 */
export const connecterFacebook = (pb: Pb, jeton: string) =>
	envoyerEtat(pb, ROUTE_FACEBOOK_CONNECTER, 'POST', { jeton: jeton.trim() })

export const choisirPageFacebook = (pb: Pb, pageId: string) =>
	envoyerEtat(pb, ROUTE_FACEBOOK_CHOISIR, 'POST', { page_id: pageId })

export const deconnecterFacebook = (pb: Pb) =>
	envoyerEtat(pb, ROUTE_FACEBOOK_DECONNECTER, 'POST')

// ── La publication ──────────────────────────────────────────────────────────

/**
 * Un identifiant d'envoi NEUF, pour UNE publication préparée. Le mini-SaaS
 * refuse de publier deux fois sous le même.
 */
export const nouvelEnvoi = (): string => {
	const octets = new Uint8Array(16)
	crypto.getRandomValues(octets)
	return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('')
}

/** Le message tel qu'il part : sauts de ligne normalisés, bords rognés. Jamais tronqué. */
export const messageNet = (texte: string) =>
	String(texte ?? '')
		.replace(/\r\n?/g, '\n')
		.trim()

/** Les envois déjà partis de CET onglet : un double clic ne publie pas deux fois. */
const partis = new Set<string>()

export const oublierEnvois = () => partis.clear()

/**
 * Publie l'image avec son message sur la Page connectée. UN envoi par
 * identifiant, jamais de second essai : un post parti deux fois est public
 * deux fois. Lève une `ErreurFacebook`.
 */
export async function publierSurFacebook(
	pb: Pb,
	publication: { image: Blob; message: string; envoi: string },
): Promise<PublicationFacebook> {
	if (partis.has(publication.envoi)) throw new ErreurFacebook('deja_envoye')
	partis.add(publication.envoi)

	const corps = new FormData()
	corps.append('image', publication.image, 'affiche')
	corps.append('message', messageNet(publication.message))
	corps.append('envoi', publication.envoi)

	let rendu: { lien?: unknown; page?: unknown } | null
	try {
		rendu = (await pb.send(ROUTE_FACEBOOK_PUBLIER, {
			method: 'POST',
			body: corps,
			requestKey: null,
		})) as typeof rendu
	} catch (e) {
		const erreur = traduireErreurFacebook(e, true)
		// Refus NET : rien n'est en ligne, la même publication peut repartir
		if (!erreur.incertain) partis.delete(publication.envoi)
		throw erreur
	}
	const lien = typeof rendu?.lien === 'string' ? rendu.lien : ''
	// La route a répondu 200 : c'est publié. Un lien illisible n'y change rien.
	if (!lien.startsWith(PREFIXE_LIEN) || /[\s"'<>]/.test(lien))
		throw new ErreurFacebook('publication_incertaine')
	return { lien, page: estPage(rendu?.page) ? enPage(rendu?.page) : null }
}
