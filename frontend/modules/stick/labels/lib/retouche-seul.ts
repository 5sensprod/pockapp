// frontend/modules/stick/labels/lib/retouche-seul.ts
//
// MODIFIER PAR IA une FORME ou un DESSIN seul (`PocketStick-docs/14-reprise-retouche.md`).
// Une forme n'a pas de fichier à envoyer : son rendu seul, sur fond transparent
// (`utils/renduPage.js`, `rendreElement` — comme un ingrédient de composition),
// part à la MÊME porte que « Modifier par IA » (`lib/retouche.ts`), par le même
// trajet (`lancerTraitement`). L'élément n'est pas remplacé : le résultat
// revient en NOUVEAU CALQUE image, juste au-dessus de lui, au cadre de ce qui a
// été rendu — l'original reste dessous, intact. Un pas d'historique.
//
// Jamais en planche. Aucun prix affiché ; une seule requête d'IA à la fois.

import { enPlanche } from './composer'
import {
	type DepsDetourage,
	type MemoireIA,
	type Refus,
	type ResultatDetourage,
	type TacheIA,
	lancerTraitement,
} from './detourage'
import {
	CONSIGNE_MAX,
	COTE_MAX_RETOUCHE,
	MESSAGES_RETOUCHE,
	type Qualite,
	appelerRetouche,
	consigneNette,
	detourerApres,
	historiqueRetouche,
} from './retouche'

export type Zone = { x: number; y: number; width: number; height: number }

const NOMS: Record<string, string> = { shape: 'Forme', dessin: 'Dessin' }

/** Les types retouchables seuls : ceux qui n'ont pas de fichier (les images ont `Retoucher`). */
export const retoucheSeulPropose = (el: any): boolean => !!NOMS[el?.type]

export function peutRetoucherSeul(
	el: any,
	nombre: number,
	etat: any,
	enCours = false,
	consigne?: string,
): Refus {
	if (enCours)
		return { ok: false, raison: "Une requête d'IA est déjà en cours." }
	if (nombre > 1)
		return { ok: false, raison: 'Sélectionnez un seul élément à modifier.' }
	if (!retoucheSeulPropose(el))
		return {
			ok: false,
			raison: 'Seules une forme ou un dessin se modifient seuls par IA.',
		}
	if (el.locked)
		return {
			ok: false,
			raison: "L'élément est verrouillé : déverrouillez-le pour le modifier.",
		}
	if (el.visible === false)
		return {
			ok: false,
			raison: "L'élément est masqué : affichez-le pour le modifier.",
		}
	if (enPlanche(etat))
		return {
			ok: false,
			raison:
				"En planche, la page est une case d'étiquette : la retouche se fait en format « page ».",
		}
	if (consigne !== undefined) {
		const nette = consigneNette(consigne)
		if (!nette)
			return {
				ok: false,
				raison: "Écrivez d'abord ce que vous voulez changer.",
			}
		if ([...nette].length > CONSIGNE_MAX)
			return {
				ok: false,
				raison: `La consigne est trop longue (${CONSIGNE_MAX} caractères au plus).`,
			}
	}
	return { ok: true }
}

export type DepsRetoucheSeul = DepsDetourage & {
	/**
	 * Le rendu de l'élément seul, fond transparent. `surZone` reçoit le cadre
	 * rendu, en coordonnées de la page : c'est là que le calque se pose.
	 */
	rendreSeul: (
		id: string,
		coteMax: number,
		surZone: (zone: Zone) => void,
	) => Promise<Blob>
}

/** Le calque posé : l'image revient exactement au cadre rendu, montrée ENTIÈRE. */
export const calqueRetouche = (
	id: string,
	src: string,
	zone: Zone,
	ia?: MemoireIA,
) => ({
	type: 'image',
	id,
	src,
	name: 'Retouche IA',
	filename: 'retouche-ia.png',
	x: zone.x,
	y: zone.y,
	width: zone.width,
	height: zone.height,
	rotation: 0,
	scaleX: 1,
	scaleY: 1,
	opacity: 1,
	fit: 'contain',
	...(ia ? { ia } : {}),
})

export const tacheRetoucheSeul = (
	el: any,
	demande: { consigne: string; qualite: Qualite },
	deps: DepsRetoucheSeul,
	/** L'identifiant du calque à poser : connu d'avance pour pouvoir enchaîner. */
	idPose: string,
): TacheIA => {
	const { consigne, qualite } = demande
	const idSource = String(el?.id)
	let zone: Zone | null = null
	return {
		nom: 'retouche',
		memoire: { tache: 'retouche', consigne: consigneNette(consigne), qualite },
		peut: (courant, nombre, enCours) =>
			peutRetoucherSeul(
				courant,
				nombre,
				deps.store.getState(),
				enCours,
				consigne,
			),
		source: () =>
			deps.rendreSeul(idSource, COTE_MAX_RETOUCHE, (z) => {
				zone = z
			}),
		appeler: (pb, image, surReception) =>
			appelerRetouche(pb, image, consigne, qualite, surReception),
		coteMax: COTE_MAX_RETOUCHE,
		historique: historiqueRetouche(qualite),
		depuis: NOMS[el?.type] ?? 'Forme',
		suffixe: 'modifiée',
		// Au-dessus de l'élément s'il existe encore, sinon au-dessus de tout ; rang calculé À L'ARRIVÉE
		poser: (src, etatStore, ia) => {
			if (enPlanche(etatStore)) return false
			const cadre: Zone = zone ?? {
				x: Number(el?.x) || 0,
				y: Number(el?.y) || 0,
				width: Number(el?.width) || 100,
				height: Number(el?.height) || 100,
			}
			const rang = etatStore.elements.findIndex((e: any) => e.id === idSource)
			etatStore.addElement(calqueRetouche(idPose, src, cadre, ia), {
				index: rang >= 0 ? rang + 1 : etatStore.elements.length,
			})
			return true
		},
		messages: {
			nonRangee:
				"L'image modifiée est posée sur la page, mais elle n'a pas pu être rangée dans « Génération » (espace du poste insuffisant).",
			elementChange:
				"La page est passée en planche pendant la retouche : le résultat n'a pas été posé. Il vous attend dans « Génération ».",
			perdue:
				"La page est passée en planche pendant la retouche, et le résultat n'a pu être ni posé ni rangé (espace du poste insuffisant). Recommencez.",
		},
		messagesErreur: MESSAGES_RETOUCHE,
		journal: 'RETOUCHE',
	}
}

/**
 * Modifie la forme ou le dessin `el` : un nouveau calque image, puis
 * « Détourer ensuite » si demandé (deux requêtes, deux facturations). Ne lève jamais.
 */
export async function lancerRetoucheSeul(
	el: any,
	demande: { consigne: string; qualite: Qualite; detourerEnsuite?: boolean },
	deps: DepsRetoucheSeul,
): Promise<ResultatDetourage> {
	const idPose = `el-ia-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
	const r = await lancerTraitement(
		el,
		1,
		deps,
		tacheRetoucheSeul(el, demande, deps, idPose),
	)
	return detourerApres(deps, idPose, r, !!demande.detourerEnsuite)
}
