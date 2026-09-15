// frontend/lib/catalog/web-links.ts
// ═══════════════════════════════════════════════════════════════════════════
// LES LIENS D'UNE FICHE — LA RÈGLE, EN UN SEUL ENDROIT
// ═══════════════════════════════════════════════════════════════════════════
//
// Écrit le 15 septembre 2026. Une fiche produit porte une liste ORDONNÉE de
// liens : des pages web (fiche constructeur, notice, test) et des vidéos
// YouTube. Le type est une donnée de l'entrée, pas deux champs du schéma —
// voir `backend/migrations/add_web_links_to_products.go`.
//
// Ce fichier est la SEULE définition de ce qu'est un lien valide côté
// PocketApp : le formulaire de la fiche le lit, l'export vers le site le relit
// avant d'envoyer. Deux validations écrites séparément finiraient par
// diverger, et c'est l'export — donc le site — qui perdrait.
//
// ── CE QUI EST REFUSÉ, ET POURQUOI ────────────────────────────────────────
//  • autre chose que `https` : la page du site est servie en https, un lien
//    en clair y déclencherait un avertissement de contenu mixte sur l'iframe
//    d'une vidéo, et n'apporte rien sur un lien ordinaire ;
//  • une vidéo dont l'hôte n'est pas YouTube : le site l'intègre dans une
//    iframe `youtube-nocookie.com`, qui ne saurait rien en faire. Le vendeur
//    doit le savoir À LA SAISIE, pas découvrir un cadre vide en ligne.
//
// ── CE QUI N'EST PAS ICI ──────────────────────────────────────────────────
// L'identifiant de la vidéo. Il se dérive de l'URL, et il se dérive au SEUL
// endroit qui l'affiche : le site (`AxeProductLinks.jsx`). Le stocker serait
// une troisième copie de la même donnée, à tenir d'accord avec les deux
// autres.

/** `link` : une page web. `video` : une vidéo YouTube, intégrée par le site. */
export type WebLinkKind = 'link' | 'video'

export type WebLink = {
	kind: WebLinkKind
	url: string
	/** Peut être vide : le site retombe alors sur le domaine. */
	label: string
}

/** Les hôtes qu'une vidéo peut porter. `youtube-nocookie` est celui de
 *  l'intégration ; on l'accepte en saisie, un vendeur peut coller l'URL d'un
 *  lecteur déjà intégré. */
const HOTES_YOUTUBE = [
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'youtu.be',
	'www.youtube-nocookie.com',
	'youtube-nocookie.com',
]

/** Vrai si l'URL désigne une vidéo YouTube. Compare l'HÔTE, jamais la chaîne :
 *  `https://exemple.fr/?x=youtube.com` contient le texte sans être YouTube. */
export function estUrlYouTube(url: string): boolean {
	try {
		return HOTES_YOUTUBE.includes(new URL(url).hostname.toLowerCase())
	} catch {
		return false
	}
}

/** `null` si l'URL est acceptable, sinon le motif du refus, en français, tel
 *  qu'il s'affiche sous le champ. */
export function motifRefusLien(kind: WebLinkKind, url: string): string | null {
	const valeur = url.trim()
	if (valeur === '') return 'Adresse requise'

	let analysee: URL
	try {
		analysee = new URL(valeur)
	} catch {
		return 'Adresse invalide (commencez par https://)'
	}
	if (analysee.protocol !== 'https:') return 'Seul https est accepté'
	if (kind === 'video' && !estUrlYouTube(valeur))
		return 'Adresse YouTube attendue pour une vidéo'
	return null
}

/** Une entrée mise au propre, ou `null` si elle ne passe pas. Le `label` est
 *  ébarbé et borné ; vide, il reste vide — c'est le site qui décide du repli. */
export function lienNormalise(entree: unknown): WebLink | null {
	if (!entree || typeof entree !== 'object') return null
	const brut = entree as Record<string, unknown>
	const kind = brut.kind === 'video' ? 'video' : 'link'
	const url = typeof brut.url === 'string' ? brut.url.trim() : ''
	if (motifRefusLien(kind, url) !== null) return null
	const label = typeof brut.label === 'string' ? brut.label.trim() : ''
	return { kind, url, label: label.slice(0, 120) }
}

/**
 * La liste telle qu'elle sort de PocketBase, remise au propre.
 *
 * Le champ est un JSON libre : PocketBase ne valide RIEN de sa forme. Une base
 * ancienne, un import, un poste sur un vieux build peuvent y avoir laissé
 * n'importe quoi — on ne fait donc jamais confiance à ce qu'on relit. Ce qui
 * ne passe pas est ÉCARTÉ en silence : refuser d'afficher toute la fiche parce
 * qu'un lien sur douze est tordu serait pire que de perdre ce lien.
 */
export function liensNormalises(valeur: unknown): WebLink[] {
	if (!Array.isArray(valeur)) return []
	return valeur
		.map(lienNormalise)
		.filter((lien): lien is WebLink => lien !== null)
		.slice(0, MAX_LIENS)
}

/** Vingt liens par fiche. Aucun produit n'en approchera ; le plafond borne ce
 *  qu'un poste peut écrire, et il borne le corps d'export. */
export const MAX_LIENS = 20
