// frontend/modules/stick/labels/lib/post-facebook.ts
//
// « PROPOSER UN TEXTE » pour la publication Facebook — la logique, sans React
// ni Konva. Doc : `PocketStick-docs/16-publication-facebook.md`, §12. Route :
// `backend/routes/post_facebook_routes.go` (point 12 des entrées réseau).
//
// Gemini rédige une PROPOSITION à partir de la page : ses textes, et les fiches
// de ses produits. Elle arrive dans le champ du message (`useBrouillonFacebook`),
// où le vendeur la relit et la corrige. RIEN n'est publié d'ici : la
// publication garde son bouton et sa confirmation (`PublierFacebook.jsx`).
//
// Ce qui part : les IDENTIFIANTS des produits de la page — jamais un prix ni
// une description : le Go relit les fiches et juge la promo au jour du
// serveur —, les textes visibles de l'affiche, un identifiant de ton, et la
// consigne facultative du vendeur. Ce n'est PAS le trajet de `lancerTraitement`
// (aucune image) ; il en partage `useEtatDetourage`, tâche `post` : UNE requête
// d'IA à la fois. Aucun prix n'est affiché pour la génération.

import { create } from 'zustand'
import { MESSAGE_MAX } from '@/lib/facebook/client'
import { elementsLies } from '../utils/champsProduit'
import { produitDe, resolvePropForElement } from '../utils/dataBinding'
import { type Pb, useEtatDetourage } from './detourage'

export const ROUTE_POST_FACEBOOK = '/api/ai/facebook-post'

/** `postProduitsMax`, `postTextesMax`, `postTexteLigne`, `postConsigneMax` de la route. */
export const PRODUITS_MAX = 6
export const TEXTES_MAX = 12
export const TEXTE_LIGNE_MAX = 300
export const CONSIGNE_POST_MAX = 300

/** Le ton est un IDENTIFIANT : c'est la route qui sait ce qu'il veut dire. */
export const TONS_POST = [
	{ id: 'chaleureux', label: 'Chaleureux' },
	{ id: 'sobre', label: 'Sobre' },
	{ id: 'enthousiaste', label: 'Enthousiaste' },
] as const
export type TonPost = (typeof TONS_POST)[number]['id']

/** Hors du composant et NON persisté, comme le brouillon du message. */
export const useReglagesPost = create<{ ton: TonPost; consigne: string }>(
	() => ({ ton: 'chaleureux', consigne: '' }),
)

export type Refus = { ok: true } | { ok: false; raison: string }

const enPlanche = (etat: any) =>
	etat?.formatTirage === 'planche' || !!etat?.lockCanvasToSheetCell

const visibles = (etat: any): any[] =>
	(etat?.elements ?? []).filter((e: any) => e && e.visible !== false)

/**
 * Les produits que la page PRÉSENTE : ceux de ses éléments liés visibles —
 * le produit de la page pour un élément sans épingle, le produit épinglé sinon
 * (`produitDe`). Un produit au tirage dont la page ne montre rien n'en est pas.
 * Sans doublon, dans l'ordre des calques.
 */
export function idsProduitsDeLaPage(etat: any): string[] {
	const ids: string[] = []
	for (const el of elementsLies(visibles(etat))) {
		const id = produitDe(el, etat?.selectedProduct, etat?.produitsParId)?._id
		if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id)
	}
	return ids
}

/**
 * Les textes de l'affiche TELS QU'ILS S'AFFICHENT (un texte lié est résolu pour
 * son produit, correction manuelle comprise) : titre, accroche, prix affiché.
 * Espaces resserrés, vides et doublons retirés, chacun borné ; au-delà de
 * `TEXTES_MAX`, les suivants ne partent pas (ce n'est qu'un contexte).
 */
export function textesDeLaPage(etat: any): string[] {
	const textes: string[] = []
	for (const el of visibles(etat)) {
		if (el.type !== 'text') continue
		const produit = produitDe(el, etat?.selectedProduct, etat?.produitsParId)
		const net = String(resolvePropForElement(el.text, el, produit) ?? '')
			.replace(/\s+/g, ' ')
			.trim()
		if (!net || net.includes('{{')) continue
		const borne = [...net].slice(0, TEXTE_LIGNE_MAX).join('')
		if (!textes.includes(borne)) textes.push(borne)
		if (textes.length === TEXTES_MAX) break
	}
	return textes
}

/** La consigne telle qu'elle part : espaces resserrés. Jamais tronquée. */
export const consignePostNette = (texte: string) =>
	String(texte ?? '')
		.replace(/\s+/g, ' ')
		.trim()

/** `etat` : le store de l'éditeur. `consigne` absente : seule la page est jugée. */
export function peutRediger(
	etat: any,
	enCours = false,
	consigne?: string,
): Refus {
	if (enCours)
		return { ok: false, raison: "Une requête d'IA est déjà en cours." }
	if (enPlanche(etat))
		return {
			ok: false,
			raison:
				"En planche, la page est une case d'étiquette : le texte se propose en format « page ».",
		}
	const produits = idsProduitsDeLaPage(etat)
	if (produits.length === 0)
		return {
			ok: false,
			raison:
				'La page ne présente aucun produit : ajoutez une info produit pour qu’un texte soit proposé.',
		}
	// Jamais de troncature : au-delà du plafond, rien ne part
	if (produits.length > PRODUITS_MAX)
		return {
			ok: false,
			raison: `La page présente ${produits.length} produits : un texte se propose pour ${PRODUITS_MAX} au plus.`,
		}
	if (
		consigne !== undefined &&
		[...consignePostNette(consigne)].length > CONSIGNE_POST_MAX
	)
		return {
			ok: false,
			raison: `La consigne est trop longue (${CONSIGNE_POST_MAX} caractères au plus).`,
		}
	return { ok: true }
}

// ── Erreurs ─────────────────────────────────────────────────────────────────

const MESSAGES: Record<string, string> = {
	service_indisponible:
		"L'assistant est injoignable. Réessayez dans un instant.",
	session_expiree: 'Votre session a expiré. Reconnectez-vous puis recommencez.',
	reponse_invalide: "L'assistant n'a pas proposé de texte. Réessayez.",
}

export class ErreurPost extends Error {
	code: string
	constructor(code: string, message?: string) {
		super(message || MESSAGES[code] || MESSAGES.service_indisponible)
		this.name = 'ErreurPost'
		this.code = code
	}
}

/** Ce que `pb.send` lève (`status`, `response` = `{ error, code }`) → une `ErreurPost`. */
export function traduireErreurPost(e: unknown): ErreurPost {
	if (e instanceof ErreurPost) return e
	const err = e as {
		status?: number
		response?: { code?: unknown; error?: unknown }
	} | null
	const code = typeof err?.response?.code === 'string' ? err.response.code : ''
	const message =
		typeof err?.response?.error === 'string' ? err.response.error.trim() : ''
	if (code) return new ErreurPost(code, message || undefined)
	const status = err?.status ?? 0
	if (status === 401 || status === 403) return new ErreurPost('session_expiree')
	return new ErreurPost('service_indisponible')
}

// ── La demande ──────────────────────────────────────────────────────────────

export type ResultatPost =
	| {
			ok: true
			texte: string
			/** La proposition cite un prix qui n'est dans aucune donnée : à vérifier. */
			prixAVerifier: boolean
	  }
	| { ok: false; erreur: ErreurPost }

/** La proposition telle qu'elle entre dans le champ : jamais plus que le plafond du message. */
export const propositionBornee = (texte: string) =>
	[
		...String(texte ?? '')
			.replace(/\r\n?/g, '\n')
			.trim(),
	]
		.slice(0, MESSAGE_MAX)
		.join('')

/**
 * Demande un texte et le rend. Ne lève jamais, et N'ÉCRIT PAS le brouillon :
 * c'est l'appelant qui décide de remplacer ce que le vendeur a déjà tapé.
 * UNE requête d'IA à la fois : l'état est celui du détourage.
 */
export async function proposerTexte(deps: {
	pb: Pb
	store: { getState: () => any }
	apresDecompte?: () => void
}): Promise<ResultatPost> {
	const etat = useEtatDetourage
	const { ton, consigne } = useReglagesPost.getState()
	const page = deps.store.getState()
	const refus = peutRediger(page, etat.getState().enCours, consigne)
	if (!refus.ok)
		return {
			ok: false,
			erreur: new ErreurPost('service_indisponible', refus.raison),
		}

	// `etape: null` : pas de jauge, un texte n'a pas d'étapes
	etat.setState({
		enCours: true,
		tache: 'post',
		erreur: null,
		info: null,
		etape: null,
	})
	try {
		const rendu = (await deps.pb.send(ROUTE_POST_FACEBOOK, {
			method: 'POST',
			body: {
				produits: idsProduitsDeLaPage(page),
				textes: textesDeLaPage(page),
				ton,
				consigne: consignePostNette(consigne),
			},
			// Pas d'auto-annulation par une autre requête
			requestKey: null,
		})) as { texte?: unknown; alerte?: unknown } | null
		const texte = propositionBornee(
			typeof rendu?.texte === 'string' ? rendu.texte : '',
		)
		if (!texte) return { ok: false, erreur: new ErreurPost('reponse_invalide') }
		try {
			deps.apresDecompte?.()
		} catch {
			// le solde affiché se rafraîchira de lui-même
		}
		return {
			ok: true,
			texte,
			prixAVerifier: rendu?.alerte === 'prix_a_verifier',
		}
	} catch (e) {
		return { ok: false, erreur: traduireErreurPost(e) }
	} finally {
		etat.setState({ enCours: false, etape: null })
	}
}
