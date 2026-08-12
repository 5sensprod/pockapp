// frontend/modules/site/lib/publish-menu.ts
// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITION DU DOCUMENT PUBLIÉ  (ticket 6)
// ═══════════════════════════════════════════════════════════════════════════
// Transforme les entrées de `site_menu` en le document décrit par
// ../PocketSite-docs/05-contrat-menu.md. **Ce fichier fait foi sur la forme,
// pas ce code** : toute divergence est un bogue d'ici.
//
// Fonctions pures : ni React, ni PocketBase, ni réseau. L'accès aux
// destinations passe par une interface injectée, ce qui rend la composition
// vérifiable sans AppPos.
//
// ─── Pourquoi la composition est ici et pas en Go ──────────────────────────
// La résolution `ref` → `url` part d'un identifiant WooCommerce et se termine
// dans AppPos, dont le client n'existe qu'en TypeScript. Écrire la composition
// en Go aurait demandé un second client AppPos — seconde authentification,
// second jeton, second chemin réseau. Voir docs/DECISIONS.md, bloc « Clé de
// publication dédiée, document composé en React, POST émis par le Go ».
//
// Conséquence assumée : le Go poste un document qu'il n'a pas composé et ne
// peut donc pas garantir conforme. L'endpoint PHP reste le seul gardien du
// contrat.
// ═══════════════════════════════════════════════════════════════════════════

import type { SiteMenuRefType, SiteMenuResponse } from '@/lib/queries/site-menu'
import { buildMenuTree, flattenMenuTree, hiddenByAncestor } from './menu-tree'

// ---------------------------------------------------------------------------
// LE DOCUMENT — §2 du contrat
// ---------------------------------------------------------------------------

/** Version de format que ce producteur écrit. §2.1 du contrat.
 *  L'endpoint PHP refuse toute autre valeur, et c'est voulu. */
export const CONTRACT_VERSION = 1

/** §6.2 du contrat : `menu.name` n'est stocké nulle part — un seul menu est
 *  publié, lui donner une ligne en base aurait créé une collection à un
 *  enregistrement. Le ticket 6 l'écrit en constante. */
export const MENU_NAME = 'Menu Principal'

export interface PublishedRef {
	type: SiteMenuRefType
	id: string
}

export interface PublishedItem {
	id: string
	title: string
	url: string
	parent: string | null
	ref: PublishedRef | null
}

export interface PublishedMenuDocument {
	contractVersion: number
	publishedAt: string
	menu: {
		name: string
		items: PublishedItem[]
	}
}

// ---------------------------------------------------------------------------
// RÉSOLUTION
// ---------------------------------------------------------------------------

/** Ce que la composition a besoin de savoir du catalogue. Injecté pour que
 *  tout ce fichier reste testable sans AppPos — `useDestinationIndex` le
 *  fournit en vrai. */
export interface DestinationUrlIndex {
	urlFor(type: SiteMenuRefType, refId: string): string | null
}

/** Une entrée que la publication ne sait pas écrire. */
export interface UnresolvedEntry {
	id: string
	title: string
	reason: string
}

const REF_TYPE_NOUNS: Record<SiteMenuRefType, string> = {
	category: 'catégorie',
	brand: 'marque',
	product: 'produit',
	page: 'page',
}

/**
 * Un `ref_id` hérité de WooCommerce est un nombre ; un `legacy_id` NeDB est une
 * chaîne alphanumérique de 8 à 30 caractères.
 *
 * Défini ICI et non dans le hook des destinations, parce que ce fichier doit
 * rester **pur** — son en-tête l'annonce, et un import du hook y ferait entrer
 * le client PocketBase, donc `window`, donc l'échec de toute la suite de tests.
 * Le hook l'importe depuis ici.
 */
export const looksLikeWooId = (refId: string): boolean => /^\d+$/.test(refId)

const isRefType = (value: string): value is SiteMenuRefType =>
	value === 'category' ||
	value === 'brand' ||
	value === 'product' ||
	value === 'page'

/**
 * L'URL d'une entrée, ou la raison pour laquelle elle n'en a pas.
 *
 * **Aucune URL n'est fabriquée.** Un slug approché n'est pas un moindre mal :
 * `CategoryPage.jsx:88-102` du site retombe sur un `includes()` partiel, donc
 * une URL approximative mène silencieusement à une autre catégorie. Mieux vaut
 * refuser de publier que publier une destination fausse — un refus se voit, une
 * mauvaise redirection non.
 */
export function resolveEntryUrl(
	entry: SiteMenuResponse,
	index: DestinationUrlIndex,
): { url: string } | { reason: string } {
	// Entrée qui ne sert qu'à porter un sous-menu. §2.3 du contrat autorise
	// explicitement `#`.
	if (entry.link_type === 'none') {
		return { url: '#' }
	}

	// Lien libre : ce que l'opérateur a saisi, tel quel. On ne le valide pas
	// au-delà du vide — c'est sa responsabilité, et le contrat accepte aussi
	// bien un chemin relatif qu'une URL absolue.
	if (entry.link_type === 'manual') {
		const url = entry.link_url?.trim()
		return url ? { url } : { reason: 'lien manuel sans adresse' }
	}

	if (!isRefType(entry.link_type)) {
		return { reason: `type de lien inconnu : ${entry.link_type}` }
	}

	const refId = entry.ref_id?.trim()
	if (!refId) {
		return { reason: `${REF_TYPE_NOUNS[entry.link_type]} sans destination` }
	}

	// Les pages n'ont aucune source interrogeable : PocketApp ne parle pas à
	// WordPress. Le contrat prévoit « identifiant ou slug » (§3) et l'opérateur
	// le saisit à la main — on le traite donc comme un chemin, sans rien
	// inventer autour.
	if (entry.link_type === 'page') {
		return { url: refId.startsWith('/') ? refId : `/${refId}` }
	}

	const url = index.urlFor(entry.link_type, refId)
	if (url) return { url }

	// Depuis le 11 août 2026, les destinations viennent du catalogue PocketBase
	// et `ref_id` porte un `legacy_id`. Une entrée enregistrée AVANT porte un
	// identifiant WooCommerce, qui ne correspond à rien : le dire dans ces
	// termes évite de chercher une cible supprimée qui existe très bien.
	if (looksLikeWooId(refId)) {
		return {
			reason: `${REF_TYPE_NOUNS[entry.link_type]} ${refId} : destination héritée de WooCommerce, à repointer sur le catalogue`,
		}
	}

	// Les marques n'ont pas de page sur le site : aucune route ne leur
	// correspond, une URL les concernant mènerait à la page 404.
	if (entry.link_type === 'brand') {
		return {
			reason: `marque ${refId} : le site n'a pas de page marque — utiliser un lien manuel en attendant`,
		}
	}

	return {
		reason: `${REF_TYPE_NOUNS[entry.link_type]} ${refId} : absente du catalogue en ligne, ou sans slug`,
	}
}

// ---------------------------------------------------------------------------
// COMPOSITION
// ---------------------------------------------------------------------------

export type ComposeResult =
	| { ok: true; document: PublishedMenuDocument }
	| { ok: false; unresolved: UnresolvedEntry[] }

/**
 * Instant de publication, ISO 8601 UTC, suffixe `Z`, à la seconde.
 *
 * §2.1 du contrat : produit par PocketApp au moment de l'envoi, pas par le PHP
 * à la réception — c'est l'instant qui fait sens pour l'opérateur qui vient de
 * cliquer. Les millisecondes de `toISOString()` sont retirées : l'endpoint les
 * accepte, mais elles n'ont aucun sens ici.
 */
export function publicationTimestamp(now: Date = new Date()): string {
	return now.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Compose le document publiable, ou rend la liste de ce qui l'empêche.
 *
 * Trois règles du contrat sont appliquées ici, et nulle part ailleurs :
 *
 * 1. **L'ordre du tableau fait foi** (§2.3). Il n'y a pas de champ `order` dans
 *    le document publié : `position` sert à ordonner ici, puis disparaît.
 * 2. **Les entrées masquées sont absentes** (§4), *et leur descendance avec* —
 *    publier un enfant dont le parent est absent produirait une entrée
 *    orpheline, que l'endpoint refuse et que le site n'afficherait jamais.
 * 3. **`parent` vaut `null` à la racine** (§6.3), là où PocketBase stocke une
 *    chaîne vide.
 */
export function composeMenuDocument(
	entries: SiteMenuResponse[],
	index: DestinationUrlIndex,
	now: Date = new Date(),
): ComposeResult {
	const tree = buildMenuTree(entries)
	const hidden = hiddenByAncestor(tree)

	// L'aplatissement suit l'ordre d'affichage : parent avant enfants, frères
	// dans leur ordre. C'est exactement ce que le contrat demande de publier.
	const visible = flattenMenuTree(tree)
		.map((node) => node.entry)
		.filter((entry) => entry.visible !== false && !hidden.has(entry.id))

	const published = new Set(visible.map((entry) => entry.id))

	const items: PublishedItem[] = []
	const unresolved: UnresolvedEntry[] = []

	for (const entry of visible) {
		const resolved = resolveEntryUrl(entry, index)

		if ('reason' in resolved) {
			unresolved.push({
				id: entry.id,
				title: entry.title,
				reason: resolved.reason,
			})
			continue
		}

		// Défensif. Le filtrage par sous-arbre garantit déjà qu'un parent publié
		// existe pour toute entrée publiée ; si cette garantie sautait un jour,
		// mieux vaut une entrée remontée à la racine qu'un document refusé par
		// l'endpoint pour parent orphelin (§4).
		const parent =
			entry.parent && published.has(entry.parent) ? entry.parent : null

		items.push({
			id: entry.id,
			title: entry.title,
			url: resolved.url,
			parent,
			ref: isRefType(entry.link_type)
				? { type: entry.link_type, id: entry.ref_id }
				: null,
		})
	}

	// Tout ou rien. Publier le menu amputé des entrées non résolues laisserait
	// un site où des rubriques disparaissent sans que personne ne l'ait décidé.
	if (unresolved.length > 0) {
		return { ok: false, unresolved }
	}

	return {
		ok: true,
		document: {
			contractVersion: CONTRACT_VERSION,
			publishedAt: publicationTimestamp(now),
			menu: { name: MENU_NAME, items },
		},
	}
}
