// frontend/modules/stick/labels/lib/retouche.ts
//
// RETOUCHE IA d'une image par consigne (« Modifier par IA », image-to-image) —
// la logique, sans React. Doc : `PocketStick-docs/11-image-to-image.md`.
//
// Même trajet que le détourage, par la MÊME fonction (`lancerTraitement`,
// `lib/detourage.ts`) : préparer, envoyer à la route Go
// `POST /api/ai/image-to-image` (`backend/routes/retouche_routes.go`), RANGER
// le PNG reçu dans « Génération », puis le POSER en un pas d'historique.
// Seuls changent l'appel (une consigne et une qualité en plus de l'image), les
// mots, et l'historique des durées — un par qualité.
//
// Le poste envoie une QUALITÉ, jamais un modèle : la correspondance qualité →
// modèle et prix ne vit que sur le mini-SaaS. Aucun prix n'est affiché.
//
// UNE seule requête d'IA à la fois, détourage et retouche confondus : les deux
// partagent `useEtatDetourage`.

import { create } from 'zustand'
import {
	type DepsDetourage,
	type MemoireIA,
	type Pb,
	type Refus,
	type ResultatDetourage,
	type TacheIA,
	appelerRouteImage,
	historiqueLocalPour,
	lancerDetourage,
	lancerTraitement,
	peutDetourer,
} from './detourage'

// ── Constantes ──────────────────────────────────────────────────────────────

export const ROUTE_RETOUCHE = '/api/ai/image-to-image'

/** Longueur maximale de la consigne : la même que la route Go et le mini-SaaS. */
export const CONSIGNE_MAX = 500

/**
 * Plus grand côté envoyé. Le mini-SaaS demande au fournisseur une image de
 * 1536 px au plus (`RETOUCHE_MAX_SIDE`) : envoyer 4096 px ne ferait qu'alourdir
 * l'envoi et le calcul.
 */
export const COTE_MAX_RETOUCHE = 2048

export type Qualite = 'rapide' | 'equilibree' | 'soignee'

/** Les qualités proposées. Les identifiants sont ceux du mini-SaaS (`retouche-lib.php`). */
export const QUALITES: { id: Qualite; label: string; titre: string }[] = [
	{
		id: 'rapide',
		label: 'Rapide',
		titre: 'Le résultat en quelques secondes, pour essayer une idée',
	},
	{
		id: 'equilibree',
		label: 'Équilibrée',
		titre: 'Plus fidèle à la consigne que Rapide',
	},
	{
		id: 'soignee',
		label: 'Soignée',
		titre:
			"Le meilleur rendu. L'image revient à un format proche du sien, pas toujours le même",
	},
]

export const QUALITE_DEFAUT: Qualite = 'rapide'

const estQualite = (q: unknown): q is Qualite =>
	QUALITES.some((x) => x.id === q)

/**
 * Idées de consigne, reprises de PocketStick (`src/topbar/postprocess.jsx`) :
 * libellé en français, consigne en anglais — mieux comprise par les modèles.
 * Un clic REMPLIT le champ ; le vendeur la lit et peut la changer.
 */
export const IDEES_CONSIGNE: { label: string; consigne: string }[] = [
	{
		label: 'Net et contrasté',
		consigne:
			'Make the image clean, crisp and sharp with enhanced contrast and clarity',
	},
	{
		label: 'Rendu 3D',
		consigne:
			'Make it look like a professional 3D render, add depth, realistic materials and soft shadows',
	},
	{
		label: 'Affiche vintage',
		consigne:
			'Make it look like a vintage poster, retro colors, slight texture',
	},
	{
		label: 'Croquis',
		consigne: 'Convert to pencil sketch, detailed linework, monochrome',
	},
	{
		label: 'Peinture',
		consigne:
			'Convert to oil painting style, detailed brush strokes, artistic texture',
	},
	{
		label: 'Papier doux',
		consigne: 'Transform into soft paper texture, gentle shadows, matte finish',
	},
	{
		label: 'Collage',
		consigne: 'Transform into paper cutout collage style, textured, artistic',
	},
	{
		label: 'Néon',
		consigne: 'Convert to cyberpunk style, neon colors, futuristic elements',
	},
]

// ── La consigne et la qualité choisies ──────────────────────────────────────

/**
 * Hors du composant, comme `useEtatDetourage` : le panneau est remplacé quand
 * la sélection change. La consigne reste donc après un échec, ET d'une image à
 * l'autre (appliquer la même retouche à plusieurs photos) ; elle n'est pas
 * écrite sur le disque et disparaît avec la session.
 */
export const useReglagesRetouche = create<{
	consigne: string
	qualite: Qualite
	/** Enchaîner un détourage après la retouche (deux requêtes, deux facturations). Décoché au départ. */
	detourerEnsuite: boolean
}>(() => ({ consigne: '', qualite: QUALITE_DEFAUT, detourerEnsuite: false }))

/** La consigne telle qu'elle part : sans espaces autour. */
export const consigneNette = (consigne: unknown): string =>
	typeof consigne === 'string' ? consigne.trim() : ''

// ── Peut-on retoucher cet élément ? ─────────────────────────────────────────

/**
 * Les refus de `peutDetourer` (photo liée au produit, verrou, sélection
 * multiple, requête en cours), avec les mots de la retouche, plus la consigne.
 */
export function peutRetoucher(
	el: any,
	nombre: number,
	enCours = false,
	consigne?: string,
): Refus {
	if (enCours)
		return { ok: false, raison: "Une requête d'IA est déjà en cours." }
	const base = peutDetourer(el, nombre, false)
	if (!base.ok) {
		if (nombre > 1)
			return { ok: false, raison: 'Sélectionnez une seule image à modifier.' }
		if (!el || el.type !== 'image')
			return { ok: false, raison: 'Seule une image se modifie par IA.' }
		if (el.dataBinding)
			return {
				ok: false,
				raison:
					'Cette photo suit le produit : la modifier la figerait pour un seul produit. Posez une image fixe pour la modifier.',
			}
		if (el.locked)
			return {
				ok: false,
				raison: "L'image est verrouillée : déverrouillez-la pour la modifier.",
			}
		return base
	}
	if (consigne !== undefined) {
		const nette = consigneNette(consigne)
		if (!nette)
			return {
				ok: false,
				raison: "Écrivez d'abord ce que vous voulez changer dans l'image.",
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

/** L'image, la consigne et la qualité : ni modèle ni dimensions, jamais. */
export function appelerRetouche(
	pb: Pb,
	image: Blob,
	consigne: string,
	qualite: Qualite,
	surReception?: () => void,
	/** Format et définition du résultat (`lib/embellir.ts`) : des identifiants, jamais des pixels. */
	resultat: { format?: string; definition?: string } = {},
) {
	const corps = new FormData()
	corps.append('image', image, 'image')
	corps.append('prompt', consigneNette(consigne))
	corps.append('qualite', qualite)
	if (resultat.format) corps.append('format', resultat.format)
	if (resultat.definition) corps.append('definition', resultat.definition)
	return appelerRouteImage(pb, ROUTE_RETOUCHE, corps, surReception)
}

// ── La tâche ────────────────────────────────────────────────────────────────

/** Un historique de durées PAR qualité : un modèle lent ne fausse pas l'estimation des autres, ni celle du détourage. */
export const historiqueRetouche = (qualite: Qualite) =>
	historiqueLocalPour(`pocketstick.retouche.durees.${qualite}`)

/** Les messages de repli de la retouche (réseau coupé, refus local) : ceux du détourage parlent de détourage. */
export const MESSAGES_RETOUCHE: Record<string, string> = {
	credit_epuise:
		"Les crédits IA ne suffisent pas pour cette qualité. La retouche n'a pas été faite ni facturée.",
	image_trop_lourde:
		'Cette image est trop grande pour la retouche. Utilisez-en une plus petite.',
	fournisseur_en_echec:
		'Le service de retouche est en panne. Réessayez dans un instant.',
	delai_depasse:
		"Le service de retouche n'a pas répondu à temps. Réessayez dans un instant.",
	service_indisponible:
		'Le service de retouche est injoignable. Réessayez dans un instant.',
	reponse_invalide: 'Le service de retouche a rendu une réponse inexploitable.',
	adresse_non_securisee: 'La retouche exige une adresse HTTPS.',
}

/**
 * L'image de départ gardée avec le résultat, pour « Refaire » : au plus
 * ~3 Mo de texte. Au-delà, rien n'est gardé — le résultat serait exposé au
 * refus de l'espace du poste — et « Refaire » ne sera pas proposé.
 */
export const DEPART_MAX_CARACTERES = 4_000_000

/** La `src` à garder comme départ, ou undefined (marqueur de liaison, trop lourde). */
export const departGardable = (el: any): string | undefined => {
	const src = typeof el?.src === 'string' ? el.src : ''
	return src && !src.includes('{{') && src.length <= DEPART_MAX_CARACTERES
		? src
		: undefined
}

/**
 * `memoriser` : écrire sur l'élément et dans « Génération » ce qui a produit
 * l'image (`MemoireIA`), et garder `depart` pour « Refaire ». Absent, la
 * retouche n'écrit que `src`, comme avant la reprise.
 */
export const tacheRetouche = (
	consigne: string,
	qualite: Qualite,
	options: { memoriser?: boolean; depart?: string } = {},
): TacheIA => ({
	nom: 'retouche',
	...(options.memoriser
		? {
				memoire: {
					tache: 'retouche',
					consigne: consigneNette(consigne),
					qualite,
				} satisfies MemoireIA,
				...(options.depart ? { depart: options.depart } : {}),
			}
		: {}),
	peut: (el, nombre, enCours) => peutRetoucher(el, nombre, enCours, consigne),
	appeler: (pb, image, surReception) =>
		appelerRetouche(pb, image, consigne, qualite, surReception),
	coteMax: COTE_MAX_RETOUCHE,
	historique: historiqueRetouche(qualite),
	suffixe: 'modifiée',
	messages: {
		nonRangee:
			"L'image modifiée est posée, mais elle n'a pas pu être rangée dans « Génération » (espace du poste insuffisant).",
		elementChange:
			"L'image a changé pendant la retouche : le résultat n'a pas été posé. Il vous attend dans « Génération ».",
		perdue:
			"L'image a changé pendant la retouche, et le résultat n'a pu être ni posé ni rangé (espace du poste insuffisant). Recommencez.",
	},
	messagesErreur: MESSAGES_RETOUCHE,
	journal: 'RETOUCHE',
})

/**
 * Modifie `el` selon `consigne`, à la `qualite` choisie. Ne lève jamais.
 *
 * Seule `src` est écrite sur l'élément : son cadre, son recadrage et son
 * ajustement ne bougent pas. L'image rendue n'a pas toujours les proportions
 * de l'originale — rien ne se déforme pour autant : en Contenir elle est
 * montrée entière, en Remplir elle couvre le cadre (`utils/crop.js`,
 * `visibleCrop` : jamais d'étirement).
 */
export function lancerRetouche(
	el: any,
	nombre: number,
	demande: { consigne: string; qualite: Qualite; memoriser?: boolean },
	deps: DepsDetourage,
): Promise<ResultatDetourage> {
	const qualite = estQualite(demande.qualite) ? demande.qualite : QUALITE_DEFAUT
	return lancerTraitement(
		el,
		nombre,
		deps,
		tacheRetouche(demande.consigne, qualite, {
			memoriser: demande.memoriser,
			depart: departGardable(el),
		}),
	)
}

/**
 * « Détourer ensuite » : si la retouche a posé son image, un détourage part sur
 * ce même élément. Deux requêtes, donc deux facturations, ET deux pas
 * d'historique ; un échec du détourage ne défait pas la retouche. Jamais
 * lancé si la retouche a échoué ou n'a pas pu poser (l'élément a changé).
 */
export async function detourerApres(
	deps: DepsDetourage,
	id: string,
	r: ResultatDetourage,
	voulu: boolean,
): Promise<ResultatDetourage> {
	if (!voulu || !r.ok || !r.pose) return r
	const frais = deps.store.getState().elements.find((e: any) => e.id === id)
	if (!frais || frais.src !== r.src) return r
	return lancerDetourage(frais, 1, deps)
}

/**
 * L'entrée de l'éditeur : « Modifier par IA » AVEC mémoire (`el.ia`), puis
 * « Détourer ensuite » si `detourerEnsuite`.
 */
export async function lancerRetoucheSuivie(
	el: any,
	nombre: number,
	demande: { consigne: string; qualite: Qualite; detourerEnsuite?: boolean },
	deps: DepsDetourage,
): Promise<ResultatDetourage> {
	const r = await lancerRetouche(
		el,
		nombre,
		{ ...demande, memoriser: true },
		deps,
	)
	return detourerApres(deps, el?.id, r, !!demande.detourerEnsuite)
}
