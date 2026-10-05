// frontend/modules/stick/labels/lib/generer.ts
//
// GÉNÉRER UNE IMAGE depuis un texte seul (text-to-image) — la logique, sans
// React. Doc : `PocketStick-docs/12-composition-et-generation.md`.
//
// Même porte que « Modifier par IA » (`POST /api/ai/image-to-image`), avec le
// champ `tache` = `generation` : AUCUNE image ne part, seulement la consigne,
// une qualité, un format et une définition — des identifiants, jamais un
// modèle ni des pixels. Même trajet (`lancerTraitement`, `lib/detourage.ts`),
// à une différence près : le résultat est RANGÉ dans « Génération » et n'est
// PAS posé (`sansPose`). Le vendeur le pose d'un clic, comme toute image.
//
// `appelerTacheImage` sert aussi à la composition (`lib/composer.ts`).

import { create } from 'zustand'
import {
	type DepsDetourage,
	type Pb,
	type Refus,
	type ResultatDetourage,
	type TacheIA,
	appelerRouteImage,
	historiqueLocalPour,
	lancerTraitement,
} from './detourage'
import { type Definition, FORMATS } from './embellir'
import {
	CONSIGNE_MAX,
	MESSAGES_RETOUCHE,
	type Qualite,
	ROUTE_RETOUCHE,
	consigneNette,
} from './retouche'

// ── Les formats ─────────────────────────────────────────────────────────────

/** Les sept formats NOMMÉS : « celui de la page » n'a pas de sens sans image. */
export const FORMATS_NOMMES = FORMATS.filter((f) => f.id !== 'page')

/** Les proportions d'un identifiant « 16x9 ». */
const proportionsDe = (id: string): number => {
	const [l, h] = id.split('x').map(Number)
	return l > 0 && h > 0 ? l / h : 1
}

/**
 * Le format nommé le plus proche des proportions données (celles de la page).
 * Écart en logarithme, comme le mini-SaaS (`dimensionsRetouche`) : 2:1 et 1:2
 * sont aussi loin l'un que l'autre de 1:1.
 */
export function formatProche(largeur: number, hauteur: number): string {
	const cible = largeur > 0 && hauteur > 0 ? largeur / hauteur : 1
	let mieux = FORMATS_NOMMES[0].id
	let ecart = Number.POSITIVE_INFINITY
	for (const f of FORMATS_NOMMES) {
		const e = Math.abs(Math.log(proportionsDe(f.id) / cible))
		if (e < ecart) {
			ecart = e
			mieux = f.id
		}
	}
	return mieux
}

/** Le format envoyé : celui choisi s'il est nommé, sinon le plus proche de la page. */
export const formatNomme = (
	format: string | null | undefined,
	canvas: { width: number; height: number } | null | undefined,
): string =>
	FORMATS_NOMMES.some((f) => f.id === format)
		? (format as string)
		: formatProche(canvas?.width ?? 1, canvas?.height ?? 1)

// ── Les idées et les réglages ───────────────────────────────────────────────

/**
 * Idées de SUJET, pour un magasin de musique : libellé en français, consigne
 * en anglais — mieux comprise par les modèles. Un clic REMPLIT le champ.
 */
export const IDEES_SUJET: { label: string; consigne: string }[] = [
	{
		label: 'Guitare sur scène',
		consigne:
			'An electric guitar on a concert stage, warm spotlights, shallow depth of field, photorealistic',
	},
	{
		label: 'Vinyles et platine',
		consigne:
			'A turntable and a stack of vinyl records on a wooden table, cozy warm light, top view',
	},
	{
		label: 'Piano en studio',
		consigne:
			'A grand piano in a bright recording studio, soft daylight, clean and elegant',
	},
	{
		label: 'Batterie et néons',
		consigne:
			'A drum kit in a dark room lit by blue and pink neon lights, dramatic, photorealistic',
	},
	{
		label: 'Fond de fête',
		consigne:
			'A festive abstract background with musical notes and confetti, vivid colors, empty space in the center',
	},
]

/**
 * Hors du composant, comme la consigne. `format` nul : pas encore choisi, le
 * plus proche de la page est proposé (`formatNomme`).
 */
export const useReglagesGenerer = create<{
	format: string | null
	definition: Definition
}>(() => ({ format: null, definition: 'standard' }))

// ── Peut-on générer ? ───────────────────────────────────────────────────────

/** `consigne` absente : seule la requête en cours est jugée. */
export function peutGenerer(enCours = false, consigne?: string): Refus {
	if (enCours)
		return { ok: false, raison: "Une requête d'IA est déjà en cours." }
	if (consigne !== undefined) {
		const nette = consigneNette(consigne)
		if (!nette)
			return {
				ok: false,
				raison: "Décrivez d'abord l'image que vous voulez obtenir.",
			}
		if ([...nette].length > CONSIGNE_MAX)
			return {
				ok: false,
				raison: `La consigne est trop longue (${CONSIGNE_MAX} caractères au plus).`,
			}
	}
	return { ok: true }
}

// ── L'appel de la route ─────────────────────────────────────────────────────

/**
 * La tâche, zéro ou plusieurs images (`images[]`), la consigne, la qualité, le
 * format et la définition : ni modèle ni dimensions, jamais.
 */
export function appelerTacheImage(
	pb: Pb,
	tache: 'generation' | 'composition',
	images: Blob[],
	consigne: string,
	qualite: Qualite,
	resultat: { format: string; definition: string },
	surReception?: () => void,
) {
	const corps = new FormData()
	corps.append('tache', tache)
	for (const image of images) corps.append('images[]', image, 'image')
	corps.append('prompt', consigneNette(consigne))
	corps.append('qualite', qualite)
	corps.append('format', resultat.format)
	corps.append('definition', resultat.definition)
	return appelerRouteImage(pb, ROUTE_RETOUCHE, corps, surReception)
}

/** Les mots d'une tâche pour les replis d'erreur (réseau coupé, refus local). */
export const messagesDeTache = (
	service: string,
	rien: string,
): Record<string, string> => ({
	...MESSAGES_RETOUCHE,
	credit_epuise: `Les crédits IA ne suffisent pas pour cette qualité. ${rien}`,
	image_trop_lourde:
		'Les images sont trop lourdes, ensemble, pour être envoyées.',
	fournisseur_en_echec: `Le service ${service} est en panne. Réessayez dans un instant.`,
	delai_depasse: `Le service ${service} n'a pas répondu à temps. Réessayez dans un instant.`,
	service_indisponible: `Le service ${service} est injoignable. Réessayez dans un instant.`,
	reponse_invalide: `Le service ${service} a rendu une réponse inexploitable.`,
	adresse_non_securisee: 'Ce service exige une adresse HTTPS.',
	prompt_absent: 'Écrivez ce que vous voulez obtenir.',
	qualite_inconnue: "Cette qualité n'existe pas.",
})

// ── La tâche ────────────────────────────────────────────────────────────────

export type DemandeGenerer = {
	consigne: string
	qualite: Qualite
	/** Un format NOMMÉ (`formatNomme`). */
	format: string
	definition: Definition
}

/** Durées par qualité ET par définition, distinctes de celles des autres tâches. */
export const historiqueGenerer = (qualite: Qualite, definition: Definition) =>
	historiqueLocalPour(`pocketstick.generation.durees.${qualite}.${definition}`)

export const tacheGenerer = (demande: DemandeGenerer): TacheIA => {
	const { consigne, qualite, format, definition } = demande
	return {
		nom: 'generation',
		memoire: {
			tache: 'generation',
			consigne: consigneNette(consigne),
			qualite,
			format,
			definition,
		},
		peut: (_el, _nombre, enCours) => peutGenerer(enCours, consigne),
		// Un texte seul : aucune image n'est préparée ni envoyée
		sources: async () => [],
		appeler: (pb, _image, surReception) =>
			appelerTacheImage(
				pb,
				'generation',
				[],
				consigne,
				qualite,
				{ format, definition },
				surReception,
			),
		historique: historiqueGenerer(qualite, definition),
		depuis: 'Image',
		suffixe: 'générée',
		// Rangée, PAS posée : le vendeur la pose d'un clic depuis « Génération »
		sansPose: true,
		messages: {
			nonRangee: '',
			elementChange: '',
			perdue:
				"L'image a été générée, mais elle n'a pas pu être rangée dans « Génération » (espace du poste insuffisant). Libérez de la place puis recommencez.",
		},
		messagesErreur: {
			...messagesDeTache(
				'de génération',
				"L'image n'a pas été générée ni facturée.",
			),
			contenu_refuse:
				"Cette demande a été refusée par le service : changez la consigne. Rien n'a été décompté.",
		},
		journal: 'GENERATION',
	}
}

/** Génère une image depuis la consigne. Ne lève jamais : voir `lancerTraitement`. */
export function lancerGeneration(
	demande: DemandeGenerer,
	deps: DepsDetourage,
): Promise<ResultatDetourage> {
	return lancerTraitement(null, 0, deps, tacheGenerer(demande))
}
