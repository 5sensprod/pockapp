// frontend/modules/stick/labels/lib/embellir.ts
//
// EMBELLIR LA PAGE par IA — la logique, sans React ni Konva.
// Doc : `PocketStick-docs/11-image-to-image.md`, §10.
//
// Ce n'est plus une image de l'affiche qui part, mais le RENDU de la page.
// Même route et mêmes qualités que « Modifier par IA » (`lib/retouche.ts`),
// même trajet (`lancerTraitement`, `lib/detourage.ts`) : ranger dans
// « Génération », puis poser — ici un NOUVEAU CALQUE sur la même page, en un
// pas d'historique. Rien de la page n'est modifié ni supprimé.
//
// Deux modes :
//   - « décor » : la page est rendue SANS ses textes, ses codes et ses éléments
//     liés au produit ; l'image revient se glisser SOUS eux. Prix, codes-barres
//     et textes restent les vrais calques, exacts et modifiables.
//   - « entière » : tout part, l'image revient AU-DESSUS de tout. C'est une
//     image à plat : l'IA peut y avoir réécrit un texte ou abîmé un code.
//
// Jamais en planche : la page y est une case, pas une affiche.

import { create } from 'zustand'
import {
	type DepsDetourage,
	type MemoireIA,
	type Refus,
	type ResultatDetourage,
	type TacheIA,
	historiqueLocalPour,
	lancerTraitement,
} from './detourage'
import {
	CONSIGNE_MAX,
	COTE_MAX_RETOUCHE,
	MESSAGES_RETOUCHE,
	type Qualite,
	appelerRetouche,
	consigneNette,
} from './retouche'

// ── Les choix ───────────────────────────────────────────────────────────────

export type ModeEmbellir = 'decor' | 'entiere'

export const MODES: { id: ModeEmbellir; label: string; titre: string }[] = [
	{
		id: 'decor',
		label: 'Décor seul',
		titre:
			"L'IA ne voit pas les textes, les codes ni les données produit : ils restent tels quels, par-dessus le décor",
	},
	{
		id: 'entiere',
		label: 'Page entière',
		titre:
			"Toute la page part : l'image revient à plat, par-dessus. Un texte ou un code peut avoir été modifié",
	},
]

/** Les formats du résultat. Les identifiants sont ceux du mini-SaaS (`RETOUCHE_FORMATS`). */
export const FORMATS: { id: string; label: string }[] = [
	{ id: 'page', label: 'Celui de la page' },
	{ id: '1x1', label: 'Carré (1:1)' },
	{ id: '4x3', label: 'Paysage (4:3)' },
	{ id: '3x4', label: 'Portrait (3:4)' },
	{ id: '3x2', label: 'Paysage (3:2)' },
	{ id: '2x3', label: 'Portrait (2:3)' },
	{ id: '16x9', label: 'Large (16:9)' },
	{ id: '9x16', label: 'Haut (9:16)' },
]

export type Definition = 'standard' | 'haute'

export const DEFINITIONS: { id: Definition; label: string; titre: string }[] = [
	{
		id: 'standard',
		label: '1536 px',
		titre: 'Plus rapide ; suffit pour un écran ou une petite affiche',
	},
	{
		id: 'haute',
		label: '2048 px',
		titre: "Plus net à l'impression, plus long à calculer",
	},
]

/** Hors du composant, comme la consigne : le panneau Page est remplacé à chaque sélection. */
export const useReglagesEmbellir = create<{
	mode: ModeEmbellir
	format: string
	definition: Definition
}>(() => ({ mode: 'decor', format: 'page', definition: 'standard' }))

// ── Ce que l'IA voit, et où revient l'image ─────────────────────────────────

const TYPES_VIVANTS = ['text', 'qrcode', 'barcode', 'fiche']

/**
 * Un élément « vivant » : ce qu'on LIT sur l'affiche (texte, code, fiche) ou ce
 * qui suit le produit. En mode décor il n'est pas envoyé, et il reste dessus.
 */
export const estVivant = (el: any): boolean =>
	!!el &&
	(TYPES_VIVANTS.includes(el.type) ||
		!!el.dataBinding ||
		(typeof el.src === 'string' && el.src.includes('{{')))

/** Les calques à cacher dans le rendu envoyé. */
export const idsMasques = (elements: any[], mode: ModeEmbellir): string[] =>
	mode === 'decor' ? elements.filter(estVivant).map((e) => String(e.id)) : []

/**
 * Le rang du calque généré (0 = tout dessous). Décor : juste SOUS le premier
 * élément vivant — il couvre le décor qu'il remplace et ne cache aucun texte.
 * Page entière : au-dessus de tout.
 */
export function rangDePose(elements: any[], mode: ModeEmbellir): number {
	if (mode === 'entiere') return elements.length
	const premier = elements.findIndex(estVivant)
	return premier < 0 ? elements.length : premier
}

/** En décor, le format est celui de la page : un décor carré ne tomberait plus sous les textes. */
export const formatEffectif = (mode: ModeEmbellir, format: string): string =>
	mode === 'decor' ? 'page' : format

/**
 * Le calque posé : une image à la taille de la page. Décor : elle COUVRE la
 * page (un format imposé par le modèle peut rogner un bord, rien ne se
 * déforme). Page entière : elle est montrée ENTIÈRE, centrée — un carré sur
 * une page A4 laisse des marges.
 */
export const calqueGenere = (
	src: string,
	mode: ModeEmbellir,
	canvas: { width: number; height: number },
	ia?: MemoireIA,
) => ({
	type: 'image',
	src,
	name: mode === 'decor' ? 'Décor IA' : 'Page embellie',
	filename: mode === 'decor' ? 'decor-ia.png' : 'page-embellie.png',
	x: 0,
	y: 0,
	width: canvas?.width || 800,
	height: canvas?.height || 600,
	rotation: 0,
	scaleX: 1,
	scaleY: 1,
	opacity: 1,
	fit: mode === 'decor' ? 'cover' : 'contain',
	...(ia ? { ia } : {}),
})

// ── Peut-on embellir cette page ? ───────────────────────────────────────────

const enPlanche = (etat: any) =>
	etat?.formatTirage === 'planche' || !!etat?.lockCanvasToSheetCell

/** `etat` : le store de l'éditeur. `consigne` absente : seule la page est jugée. */
export function peutEmbellir(
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
				"En planche, la page est une case d'étiquette : l'embellissement se fait en format « page ».",
		}
	if (!(etat?.elements ?? []).some((e: any) => e.visible !== false))
		return {
			ok: false,
			raison: "La page est vide : il n'y a rien à embellir.",
		}
	if (consigne !== undefined) {
		const nette = consigneNette(consigne)
		if (!nette)
			return {
				ok: false,
				raison: "Écrivez d'abord ce que vous voulez obtenir.",
			}
		if ([...nette].length > CONSIGNE_MAX)
			return {
				ok: false,
				raison: `La consigne est trop longue (${CONSIGNE_MAX} caractères au plus).`,
			}
	}
	return { ok: true }
}

// ── La tâche ────────────────────────────────────────────────────────────────

export type DemandeEmbellir = {
	consigne: string
	qualite: Qualite
	mode: ModeEmbellir
	format: string
	definition: Definition
}

export type DepsEmbellir = DepsDetourage & {
	/**
	 * Le rendu de la page en image, sans les calques `masques` (Konva :
	 * `utils/renduPage.js`). `coteMax` : son plus grand côté, en pixels.
	 */
	rendre: (masques: string[], coteMax: number) => Promise<Blob>
}

/** Durées par qualité ET par définition : 2048 px est plus long que 1536. */
export const historiqueEmbellir = (qualite: Qualite, definition: Definition) =>
	historiqueLocalPour(`pocketstick.embellir.durees.${qualite}.${definition}`)

export const tacheEmbellir = (
	demande: DemandeEmbellir,
	deps: DepsEmbellir,
): TacheIA => {
	const { consigne, qualite, mode, definition } = demande
	const format = formatEffectif(mode, demande.format)
	return {
		nom: 'embellir',
		memoire: {
			tache: 'embellir',
			consigne: consigneNette(consigne),
			qualite,
			format,
			definition,
		},
		peut: (_el, _nombre, enCours) =>
			peutEmbellir(deps.store.getState(), enCours, consigne),
		// La page telle qu'au clic : les calques cachés sont lus maintenant
		source: () =>
			deps.rendre(
				idsMasques(deps.store.getState().elements, mode),
				COTE_MAX_RETOUCHE,
			),
		appeler: (pb, image, surReception) =>
			appelerRetouche(pb, image, consigne, qualite, surReception, {
				format,
				definition,
			}),
		coteMax: COTE_MAX_RETOUCHE,
		historique: historiqueEmbellir(qualite, definition),
		depuis: 'page',
		suffixe: mode === 'decor' ? 'décor' : 'embellie',
		// Le rang est calculé À L'ARRIVÉE : la page a pu changer pendant l'attente
		poser: (src, etatStore, ia) => {
			if (enPlanche(etatStore)) return false
			etatStore.addElement(calqueGenere(src, mode, etatStore.canvasSize, ia), {
				index: rangDePose(etatStore.elements, mode),
			})
			return true
		},
		messages: {
			nonRangee:
				"Le calque est posé sur la page, mais l'image n'a pas pu être rangée dans « Génération » (espace du poste insuffisant).",
			elementChange:
				"La page est passée en planche pendant l'embellissement : le résultat n'a pas été posé. Il vous attend dans « Génération ».",
			perdue:
				"La page est passée en planche pendant l'embellissement, et le résultat n'a pu être ni posé ni rangé (espace du poste insuffisant). Recommencez.",
		},
		messagesErreur: MESSAGES_RETOUCHE,
		journal: 'EMBELLIR',
	}
}

/** Embellit la page. Ne lève jamais : voir `lancerTraitement`. */
export function lancerEmbellissement(
	demande: DemandeEmbellir,
	deps: DepsEmbellir,
): Promise<ResultatDetourage> {
	return lancerTraitement(null, 0, deps, tacheEmbellir(demande, deps))
}
