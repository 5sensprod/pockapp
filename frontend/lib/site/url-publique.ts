// frontend/lib/site/url-publique.ts
//
// L'ADRESSE PUBLIQUE DU SITE — écrite une fois.
//
// Ce n'est ni un secret ni un endpoint à clé : c'est l'adresse que lit un
// client, celle qu'on imprime sur une affiche ou qu'on encode dans un QR code.
// Elle ne passe donc pas par les réglages chiffrés (`backend/secrets`), dont
// la lecture est réservée aux administrateurs — un vendeur qui compose une
// affiche doit pouvoir obtenir l'adresse d'un produit.
//
// `VITE_SITE_PUBLIC_URL` la surcharge, pour viser une préproduction sans
// recompiler.

const PAR_DEFAUT = 'https://axemusique.shop'

/** Sans barre oblique finale, pour que la concaténation reste prévisible. */
export const urlPubliqueDuSite = (): string =>
	(import.meta.env.VITE_SITE_PUBLIC_URL || PAR_DEFAUT).replace(/\/+$/, '')

/**
 * L'adresse d'une fiche produit sur le site : `/produit/:slug`, la route servie
 * par le bundle du site (`App.jsx`).
 *
 * Un produit sans slug n'a PAS de page : le slug est posé au premier
 * enregistrement publié, et un brouillon n'en porte pas (`CLAUDE.md`). On rend
 * alors une chaîne vide plutôt qu'une adresse qui afficherait
 * « Produit introuvable ».
 */
export const urlProduitSurLeSite = (slug?: string | null): string =>
	slug ? `${urlPubliqueDuSite()}/produit/${slug}` : ''

/**
 * Ouvre une adresse dans le NAVIGATEUR DU POSTE, jamais dans l'application.
 *
 * Sous Wails, un `target='_blank'` ouvre une seconde fenêtre de PocketApp —
 * constaté sur les liens de l'avertissement de doublon (`CLAUDE.md`). Le
 * runtime expose `BrowserOpenURL`, qui passe la main au navigateur par défaut ;
 * hors Wails (les postes au navigateur) on retombe sur `window.open`.
 */
export const ouvrirDansLeNavigateur = (url: string): void => {
	if (!url) return
	const runtime = (
		window as unknown as { runtime?: { BrowserOpenURL?: (u: string) => void } }
	).runtime
	if (runtime?.BrowserOpenURL) {
		runtime.BrowserOpenURL(url)
		return
	}
	window.open(url, '_blank', 'noopener,noreferrer')
}
