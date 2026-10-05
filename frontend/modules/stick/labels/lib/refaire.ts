// frontend/modules/stick/labels/lib/refaire.ts
//
// REFAIRE une image par IA : la même consigne, la même qualité, un NOUVEAU
// tirage (`PocketStick-docs/14-reprise-retouche.md`). Lit `el.ia`
// (`MemoireIA`, écrite par `lancerTraitement`), jamais un état global : la
// consigne en cours de saisie n'y entre pas.
//
// Deux tâches se refont, sur le MÊME trajet (`lancerTraitement`) :
//   - `retouche` : repart de l'image de DÉPART gardée avec le résultat dans
//     « Génération » (`departSrc`), jamais du résultat — retoucher une retouche
//     la ferait dériver. Sans départ gardé, c'est refusé et dit.
//   - `generation` : un texte seul, donc rien à retrouver.
// Le résultat REMPLACE la `src` de l'élément (Ctrl+Z rend l'ancien tirage, qui
// reste rangé dans « Génération »). Chaque tirage est facturé au prix plein, sans
// prix affiché et sans second essai automatique : c'est un clic.
//
// Pas de Refaire pour une composition ni un embellissement : leurs ingrédients
// ne sont pas gardés. Leur consigne se reprend (`reprendreConsigne`).

import {
	type DepsDetourage,
	ErreurDetourage,
	type MemoireIA,
	type Refus,
	type ResultatDetourage,
	lancerTraitement,
	sourceAEnvoyer,
	useEtatDetourage,
} from './detourage'
import { DEFINITIONS, type Definition } from './embellir'
import { formatNomme, peutGenerer, tacheGenerer } from './generer'
import {
	QUALITES,
	QUALITE_DEFAUT,
	type Qualite,
	tacheRetouche,
	useReglagesRetouche,
} from './retouche'

/** Ce que `el.ia` porte n'est pas digne de confiance (JSON importé) : tout est revalidé. */
const qualiteDe = (q: unknown): Qualite =>
	QUALITES.find((x) => x.id === q)?.id ?? QUALITE_DEFAUT

export const aUneMemoire = (el: any): boolean =>
	typeof el?.ia?.consigne === 'string' && typeof el?.ia?.tache === 'string'

/** Reprend la consigne et la qualité de l'élément dans les champs du panneau, pour les corriger. */
export function reprendreConsigne(ia: MemoireIA) {
	useReglagesRetouche.setState({
		consigne: String(ia.consigne ?? ''),
		qualite: qualiteDe(ia.qualite),
	})
}

export const REFAISABLES = ['retouche', 'generation']

const RAISON_SANS_DEPART =
	"L'image de départ n'est plus gardée dans « Génération » : refaire repartirait d'un résultat déjà modifié. Reprenez la consigne et relancez depuis la photo d'origine."

/**
 * Le refus, sans lire la bibliothèque. `departGarde` : l'image de départ est
 * encore dans « Génération » (la tâche `retouche` n'en a pas d'autre).
 */
export function peutRefaire(
	el: any,
	enCours = false,
	departGarde = true,
): Refus {
	if (enCours)
		return { ok: false, raison: "Une requête d'IA est déjà en cours." }
	if (!aUneMemoire(el) || !REFAISABLES.includes(el.ia.tache))
		return {
			ok: false,
			raison:
				'Cette image ne se refait pas : ses éléments de départ ne sont pas gardés. Reprenez la consigne et relancez.',
		}
	if (el.type !== 'image')
		return { ok: false, raison: 'Seule une image se refait.' }
	if (el.locked)
		return {
			ok: false,
			raison: "L'image est verrouillée : déverrouillez-la pour la refaire.",
		}
	if (el.dataBinding)
		return {
			ok: false,
			raison: 'Cette photo suit le produit : elle ne se refait pas.',
		}
	if (el.ia.tache === 'retouche' && !departGarde)
		return { ok: false, raison: RAISON_SANS_DEPART }
	return { ok: true }
}

export type DepsRefaire = DepsDetourage & {
	/** `presetImageService` : seul le départ gardé d'une image rangée est lu. */
	lireDepart: (nomRange: string) => Promise<string | undefined>
}

/** Refait l'image `el`. Ne lève jamais. */
export async function lancerRefaire(
	el: any,
	deps: DepsRefaire,
): Promise<ResultatDetourage> {
	const etat = useEtatDetourage
	const tache = el?.ia?.tache === 'generation' ? 'generation' : 'retouche'
	const echec = (message: string): ResultatDetourage => {
		const erreur = new ErreurDetourage('service_indisponible', message)
		// Refusé parce qu'une AUTRE tâche est en cours : ne pas lui prendre sa jauge
		etat.setState(
			etat.getState().enCours
				? { erreur, info: null }
				: { erreur, info: null, tache },
		)
		return { ok: false, erreur }
	}
	const refus = peutRefaire(el, etat.getState().enCours)
	if (!refus.ok) return echec(refus.raison)
	const ia: MemoireIA = el.ia
	const qualite = qualiteDe(ia.qualite)

	if (ia.tache === 'generation') {
		const definition: Definition =
			DEFINITIONS.find((d) => d.id === ia.definition)?.id ?? 'standard'
		const demande = {
			consigne: ia.consigne,
			qualite,
			format: formatNomme(ia.format, deps.store.getState().canvasSize),
			definition,
		}
		const sortie = peutGenerer(false, demande.consigne)
		if (!sortie.ok) return echec(sortie.raison)
		// Le même trajet qu'une génération, mais le résultat REMPLACE l'image de l'élément
		return lancerTraitement(el, 1, deps, {
			...tacheGenerer(demande),
			sansPose: false,
		})
	}

	const depart = ia.rangee
		? await deps.lireDepart(ia.rangee).catch(() => undefined)
		: undefined
	if (!depart) return echec(RAISON_SANS_DEPART)
	return lancerTraitement(el, 1, deps, {
		...tacheRetouche(ia.consigne, qualite, { memoriser: true, depart }),
		// L'image de DÉPART, pas la `src` courante
		source: () => (deps.source ?? sourceAEnvoyer)({ src: depart }),
	})
}
