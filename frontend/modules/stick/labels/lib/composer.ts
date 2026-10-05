// frontend/modules/stick/labels/lib/composer.ts
//
// COMPOSER PAR IA — des éléments sélectionnés servent d'INGRÉDIENTS à une
// nouvelle image. La logique, sans React ni Konva.
// Doc : `PocketStick-docs/12-composition-et-generation.md`.
//
// Même porte que « Modifier par IA », champ `tache` = `composition` : UNE
// image de référence par élément, `INGREDIENTS_MAX` au plus quelle que soit la
// qualité. Même trajet (`lancerTraitement`) : ranger dans « Génération », puis
// poser un NOUVEAU CALQUE au-dessus de tout, en un pas d'historique. Les
// ingrédients restent sur la page, intacts.
//
// Ce qu'un élément envoie :
//   - une image : son fichier. Une photo LIÉE au produit est résolue pour le
//     produit affiché, par la seule résolution de l'éditeur (`getProductField`,
//     à travers `resolvePropForElement`) ;
//   - une forme, un dessin : son rendu seul, sur fond transparent
//     (`utils/renduPage.js`, `rendreElement`).
// Textes, QR codes, codes-barres, fiches et éléments verrouillés sont refusés.
//
// Jamais en planche.

import { resolvePropForElement } from '../utils/dataBinding'
import {
	type DepsDetourage,
	historiqueLocalPour,
	lancerTraitement,
	type Refus,
	type ResultatDetourage,
	SEUIL_ENVOI_OCTETS,
	sourceAEnvoyer,
	type TacheIA,
} from './detourage'
import type { Definition } from './embellir'
import { appelerTacheImage, formatNomme, messagesDeTache } from './generer'
import { CONSIGNE_MAX, consigneNette, type Qualite } from './retouche'

// ── Les ingrédients ─────────────────────────────────────────────────────────

/** Le plafond du mini-SaaS (`COMPOSITION_MAX_IMAGES`) et de la route Go. */
export const INGREDIENTS_MAX = 4
export const INGREDIENTS_MIN = 2

/** Plus grand côté d'un ingrédient envoyé : une référence, pas une image à imprimer. */
export const COTE_MAX_INGREDIENT = 1536

const NOMS_REFUSES: Record<string, string> = {
	text: 'Un texte',
	qrcode: 'Un QR code',
	barcode: 'Un code-barres',
	fiche: 'Une fiche',
}

/** Les types qui se RENDENT (pas de fichier à envoyer). */
const TYPES_RENDUS = ['shape', 'dessin']

/** La `src` d'une image telle qu'elle s'affiche : résolue pour le produit si elle lui est liée. */
export const srcIngredient = (el: any, produit: any): string => {
	const liee =
		!!el?.dataBinding || (typeof el?.src === 'string' && el.src.includes('{{'))
	if (!liee) return String(el?.src ?? '')
	const resolue = resolvePropForElement(el.src, el, produit)
	return typeof resolue === 'string' && !resolue.includes('{{') ? resolue : ''
}

/** Pourquoi cet élément ne peut pas servir d'ingrédient, ou null s'il le peut. */
export function refusIngredient(el: any, produit: any): string | null {
	if (!el) return "Un élément sélectionné n'existe plus."
	if (NOMS_REFUSES[el.type])
		return `${NOMS_REFUSES[el.type]} ne sert pas d'ingrédient : retirez-le de la sélection.`
	if (el.type !== 'image' && !TYPES_RENDUS.includes(el.type))
		return "Cet élément ne sert pas d'ingrédient : retirez-le de la sélection."
	if (el.locked)
		return 'Un élément sélectionné est verrouillé : déverrouillez-le ou retirez-le de la sélection.'
	if (el.visible === false)
		return 'Un élément sélectionné est masqué : affichez-le ou retirez-le de la sélection.'
	if (el.type === 'image' && !srcIngredient(el, produit))
		return el.dataBinding || String(el.src ?? '').includes('{{')
			? "Une photo sélectionnée suit le produit, et aucun produit affiché ne lui donne d'image."
			: "Une image sélectionnée n'a pas de source utilisable."
	return null
}

/** Les éléments de la sélection, dans l'ordre des calques (du dessous au dessus). */
export const elementsSelectionnes = (etat: any): any[] => {
	const ids = new Set(
		etat?.selectedId ? [etat.selectedId, ...(etat.extraIds ?? [])] : [],
	)
	return (etat?.elements ?? []).filter((e: any) => ids.has(e.id))
}

/** Le bloc « Composer par IA » ne se montre que pour une sélection multiple, hors planche. */
export const composerPropose = (etat: any): boolean =>
	!enPlanche(etat) && elementsSelectionnes(etat).length >= INGREDIENTS_MIN

const enPlanche = (etat: any) =>
	etat?.formatTirage === 'planche' || !!etat?.lockCanvasToSheetCell

/**
 * `etat` : le store de l'éditeur ; `ingredients` : les éléments tels qu'au
 * clic. `consigne` absente : seule la sélection est jugée.
 */
export function peutComposer(
	etat: any,
	ingredients: any[],
	enCours = false,
	consigne?: string,
): Refus {
	if (enCours)
		return { ok: false, raison: "Une requête d'IA est déjà en cours." }
	if (enPlanche(etat))
		return {
			ok: false,
			raison:
				"En planche, la page est une case d'étiquette : la composition se fait en format « page ».",
		}
	if (ingredients.length < INGREDIENTS_MIN)
		return {
			ok: false,
			raison: `Sélectionnez de ${INGREDIENTS_MIN} à ${INGREDIENTS_MAX} éléments (Maj+clic) : images, formes ou dessins.`,
		}
	// Jamais de troncature : au-delà du plafond, rien ne part
	if (ingredients.length > INGREDIENTS_MAX)
		return {
			ok: false,
			raison: `Une composition accepte ${INGREDIENTS_MAX} éléments au plus : ${ingredients.length} sont sélectionnés.`,
		}
	for (const el of ingredients) {
		const raison = refusIngredient(el, etat?.selectedProduct)
		if (raison) return { ok: false, raison }
	}
	if (consigne !== undefined) {
		const nette = consigneNette(consigne)
		if (!nette)
			return {
				ok: false,
				raison: "Écrivez d'abord ce que vous voulez obtenir avec ces éléments.",
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

export type DemandeComposer = {
	consigne: string
	qualite: Qualite
	/** « page » (défaut) ou un format nommé, comme « Embellir ». */
	format: string
	definition: Definition
}

export type DepsComposer = DepsDetourage & {
	/**
	 * Le rendu d'UN calque seul, sur fond transparent (Konva :
	 * `utils/renduPage.js`, `rendreElement`). `coteMax` : son plus grand côté.
	 */
	rendreSeul: (id: string, coteMax: number) => Promise<Blob>
}

/** Durées par qualité ET par définition, distinctes de celles des autres tâches. */
export const historiqueComposer = (qualite: Qualite, definition: Definition) =>
	historiqueLocalPour(`pocketstick.composition.durees.${qualite}.${definition}`)

/** Le calque posé : une image à la taille de la page, montrée ENTIÈRE. */
export const calqueCompose = (
	src: string,
	canvas: { width: number; height: number },
) => ({
	type: 'image',
	src,
	name: 'Composition IA',
	filename: 'composition-ia.png',
	x: 0,
	y: 0,
	width: canvas?.width || 800,
	height: canvas?.height || 600,
	rotation: 0,
	scaleX: 1,
	scaleY: 1,
	opacity: 1,
	fit: 'contain',
})

export const tacheComposer = (
	demande: DemandeComposer,
	/** Les `id` des ingrédients, capturés au clic : la sélection peut bouger pendant l'attente. */
	ids: string[],
	deps: DepsComposer,
): TacheIA => {
	const { consigne, qualite, definition } = demande
	const ingredients = () => {
		const etat = deps.store.getState()
		return ids.map((id) => etat.elements.find((e: any) => e.id === id))
	}
	return {
		nom: 'composition',
		peut: (_el, _nombre, enCours) =>
			peutComposer(deps.store.getState(), ingredients(), enCours, consigne),
		// UNE image par élément, dans l'ordre des calques
		sources: () => {
			const produit = deps.store.getState().selectedProduct
			return Promise.all(
				ingredients().map((el) =>
					TYPES_RENDUS.includes(el.type)
						? deps.rendreSeul(String(el.id), COTE_MAX_INGREDIENT)
						: (deps.source ?? sourceAEnvoyer)({
								...el,
								src: srcIngredient(el, produit),
							}),
				),
			)
		},
		appeler: (pb, _image, surReception, images = []) =>
			appelerTacheImage(
				pb,
				'composition',
				images,
				consigne,
				qualite,
				{
					// « page » n'a de sens que pour UNE image : le format nommé le plus proche part
					format: formatNomme(demande.format, deps.store.getState().canvasSize),
					definition,
				},
				surReception,
			),
		coteMax: COTE_MAX_INGREDIENT,
		// Le plafond d'envoi vaut pour le TOUT : il se partage entre les images
		seuilOctets: Math.floor(SEUIL_ENVOI_OCTETS / Math.max(1, ids.length)),
		historique: historiqueComposer(qualite, definition),
		depuis: 'Composition',
		suffixe: 'composée',
		// Au-dessus de tout, rang calculé À L'ARRIVÉE ; les ingrédients ne bougent pas
		poser: (src, etatStore) => {
			if (enPlanche(etatStore)) return false
			etatStore.addElement(calqueCompose(src, etatStore.canvasSize), {
				index: etatStore.elements.length,
			})
			return true
		},
		messages: {
			nonRangee:
				"La composition est posée sur la page, mais l'image n'a pas pu être rangée dans « Génération » (espace du poste insuffisant).",
			elementChange:
				"La page est passée en planche pendant la composition : le résultat n'a pas été posé. Il vous attend dans « Génération ».",
			perdue:
				"La page est passée en planche pendant la composition, et le résultat n'a pu être ni posé ni rangé (espace du poste insuffisant). Recommencez.",
		},
		messagesErreur: {
			...messagesDeTache(
				'de composition',
				"La composition n'a pas été faite ni facturée.",
			),
			contenu_refuse:
				"Cette demande a été refusée par le service : changez la consigne ou les éléments. Rien n'a été décompté.",
		},
		journal: 'COMPOSITION',
	}
}

/** Compose une image depuis les éléments `ids`. Ne lève jamais : voir `lancerTraitement`. */
export function lancerComposition(
	demande: DemandeComposer,
	ids: string[],
	deps: DepsComposer,
): Promise<ResultatDetourage> {
	return lancerTraitement(
		null,
		ids.length,
		deps,
		tacheComposer(demande, ids, deps),
	)
}
