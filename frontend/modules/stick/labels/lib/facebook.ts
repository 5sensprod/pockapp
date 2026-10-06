// frontend/modules/stick/labels/lib/facebook.ts
//
// « PUBLIER SUR FACEBOOK » depuis l'éditeur — la logique, sans React ni Konva.
// Doc : `PocketStick-docs/16-publication-facebook.md`.
//
// L'affiche COURANTE est rendue en image (`utils/renduPage.js`, comme
// « Embellir »), montrée au vendeur telle qu'elle partira, puis publiée avec
// son message sur la Page que le magasin a connectée. Le client des routes est
// `@/lib/facebook/client` ; ici, ce qui est propre à l'éditeur : peut-on
// publier cette page, et l'image qui part.
//
// Ce n'est PAS une requête d'IA : `useEtatDetourage` n'est pas pris, rien n'est
// décompté, rien n'est rangé dans la bibliothèque, la page n'est pas touchée.

import { create } from 'zustand'
import {
	type EtatFacebook,
	MESSAGE_MAX,
	messageNet,
} from '@/lib/facebook/client'
import {
	type Codec,
	codecNavigateur,
	preparerImage,
	SEUIL_ENVOI_OCTETS,
} from './detourage'

/**
 * Plus grand côté de l'image publiée, en pixels. PocketStick rendait en
 * `pixelRatio: 2` ; ici le rendu vise ce côté, quelle que soit la page.
 */
export const COTE_PUBLICATION = 2048

export type Refus = { ok: true } | { ok: false; raison: string }

const enPlanche = (etat: any) =>
	etat?.formatTirage === 'planche' || !!etat?.lockCanvasToSheetCell

/** Le bouton n'existe pas en planche : la page y est une case d'étiquette. */
export const publicationProposee = (etat: any) => !enPlanche(etat)

/**
 * `etat` : le store de l'éditeur. `facebook` : l'état de la connexion, ou
 * `null` tant qu'il n'est pas lu. `message` absent : seule la page est jugée.
 */
export function peutPublier(
	etat: any,
	facebook: EtatFacebook | null,
	message?: string,
): Refus {
	if (enPlanche(etat))
		return {
			ok: false,
			raison:
				"En planche, la page est une case d'étiquette : la publication se fait en format « page ».",
		}
	if (!(etat?.elements ?? []).some((e: any) => e.visible !== false))
		return { ok: false, raison: "La page est vide : il n'y a rien à publier." }
	if (!facebook)
		return { ok: false, raison: 'Lecture de la connexion à Facebook…' }
	if (!facebook.connecte || !facebook.page)
		return {
			ok: false,
			raison:
				"Aucune Page Facebook n'est connectée. Un administrateur doit le faire dans Réglages → Clés API & Secrets.",
		}
	if (message !== undefined && [...messageNet(message)].length > MESSAGE_MAX)
		return {
			ok: false,
			raison: `Le message est trop long (${MESSAGE_MAX} caractères au plus).`,
		}
	return { ok: true }
}

/**
 * L'image qui part : le rendu de la page (un PNG). S'il dépasse le plafond
 * d'envoi, il est réencodé — JPEG, puis réduit par paliers —, comme une image
 * envoyée au détourage. Ce qui est rendu ici est EXACTEMENT ce que l'aperçu
 * montre et ce qui sera publié.
 */
export async function preparerAffiche(
	rendre: (coteMax: number) => Promise<Blob>,
	codec: Codec = codecNavigateur,
): Promise<Blob> {
	const png = await rendre(COTE_PUBLICATION)
	if (png.size <= SEUIL_ENVOI_OCTETS) return png
	return (await preparerImage(png, codec, COTE_PUBLICATION, SEUIL_ENVOI_OCTETS))
		.blob
}

/**
 * Le message en cours de rédaction. Hors du composant et NON persisté : il
 * survit à la fermeture de la fenêtre (un échec ne le fait pas retaper), pas à
 * un rechargement. Vidé après une publication réussie.
 */
export const useBrouillonFacebook = create<{ message: string }>(() => ({
	message: '',
}))

/** Le texte de la confirmation : la Page, le caractère public, et le message tel qu'il partira. */
export function texteDeConfirmation(nomPage: string, message: string): string {
	const net = messageNet(message)
	return [
		`Cette affiche sera publiée tout de suite sur la Page « ${nomPage} », visible de tous.`,
		"Depuis l'application, elle ne pourra être ni modifiée ni retirée.",
		net ? `Message :\n${net}` : 'Sans message.',
	].join('\n\n')
}
