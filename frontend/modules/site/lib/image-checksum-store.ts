// frontend/modules/site/lib/image-checksum-store.ts
// ═══════════════════════════════════════════════════════════════════════════
// LE CACHE DES EMPREINTES D'IMAGES — pour ne pas relire 1,5 Gio à chaque fois
// ═══════════════════════════════════════════════════════════════════════════
// Calculer une empreinte d'images suppose de LIRE LES OCTETS : PocketBase les
// sert par HTTP, ils ne se lisent pas dans la base. Pour 261 marques et
// catégories, cela coûtait 57 Mio. Pour les 2412 produits publiés, c'est
// **1,503 Gio et 4132 fichiers** (mesuré le 20 août 2026) : le même geste, à
// six fois le prix par entité et dix fois le nombre d'entités.
//
// D'où ce cache, et son unique idée :
//
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │ La CLÉ est la liste ORDONNÉE des noms de fichiers locaux.           │
//   └─────────────────────────────────────────────────────────────────────┘
//
// Elle tient parce que **PocketBase suffixe le nom d'un jeton** qui change dès
// que le fichier change (`…_PiDxAYvQfC.jpg`). Propriété déjà énoncée et déjà
// exploitée dans ce dépôt, par le cache à la vie du montage de
// `use-image-sync.ts`. Ce fichier ne fait que la rendre PERSISTANTE.
//
// Les trois mouvements que le miroir doit voir sont couverts, et par la clé
// seule :
//
//   remplacer une image  → le nom change     → clé différente
//   promouvoir           → la liste change de forme → clé différente
//   réordonner la galerie → l'ordre change   → clé différente
//
// ⚠️ Ce n'est **pas** une empreinte de substitution. Ce qui part au serveur
// reste le SHA-1 des SHA-256 des octets (`image-checksum.ts`). Cette clé décide
// seulement s'il faut les relire. Un ratage de cache coûte du temps, jamais une
// valeur fausse — et c'est ce qui rend le pari acceptable.
//
// Pourquoi `localStorage` et pas une collection PocketBase : le §5 de la
// conception écarte « une table d'état de synchro en double », parce qu'un état
// doublé est un état à réconcilier. Ceci n'est pas un état, c'est un cache —
// le perdre coûte un recalcul, jamais une divergence. Il reste donc par poste,
// et ce fichier ne dépend d'aucune API de navigateur : le stockage est INJECTÉ,
// ce qui le rend testable sans jsdom.
//
// Gardien : image-checksum-store.test.ts.
// ═══════════════════════════════════════════════════════════════════════════

/** Le strict minimum de `Storage` dont ce module a besoin. Injecté, jamais lu
 *  dans `globalThis` : c'est ce qui rend le fichier pur et testable. */
export type CleValeur = {
	getItem: (cle: string) => string | null
	setItem: (cle: string, valeur: string) => void
}

/** Une entrée : la clé qui a produit l'empreinte, et l'empreinte. Les deux
 *  ensemble, jamais l'une sans l'autre — une empreinte dont on ignore de quels
 *  fichiers elle vient ne peut pas être invalidée. */
export type EntreeCache = { cle: string; empreinte: string }

/** `legacy_id → entrée`. */
export type CacheEmpreintes = Map<string, EntreeCache>

export const CLE_STOCKAGE = 'pocketapp.site.image-checksums.v1'

/**
 * Combien d'entités un seul geste peut mettre en calcul.
 *
 * Ce n'est pas une limite technique, c'est une limite de LISIBILITÉ : au-delà,
 * celui qui clique ne peut plus estimer ce qu'il déclenche.
 *
 * **300 et pas 200**, depuis le 20 août 2026, et le nombre n'est pas rond par
 * hasard : le plus grand ensemble qu'on veuille pouvoir mesurer D'UN SEUL GESTE
 * est **les 225 marques** (20,6 Mio) ou **les 36 catégories** (36,3 Mio) —
 * 57 Mio à elles deux, le premier livrable du miroir. Un plafond à 200 coupait
 * les marques en deux pour rien et transformait « envoyer toutes les images des
 * marques » en deux passes.
 *
 * Il reste très en dessous d'un balayage des produits : 2412 fiches et
 * 1,503 Gio. 300 produits au poids moyen mesuré pèsent environ 190 Mio, ce qui
 * se sent mais ne bloque pas.
 *
 * Le calcul suit la SÉLECTION affichée, filtres compris ; ce plafond n'est que
 * le garde-fou de dernier recours.
 */
export const MAX_ENTITES_PAR_CALCUL = 300

/**
 * Lit le cache. Un contenu illisible ou d'une autre forme n'est pas une
 * erreur : c'est un cache vide. Lever ici empêcherait l'écran de s'ouvrir pour
 * cause de recalcul à faire, ce qui serait absurde.
 */
export function lireCache(
	stockage: CleValeur | null | undefined,
): CacheEmpreintes {
	const vide: CacheEmpreintes = new Map()
	if (!stockage) return vide

	let brut: string | null = null
	try {
		brut = stockage.getItem(CLE_STOCKAGE)
	} catch {
		return vide
	}
	if (!brut) return vide

	try {
		const lu = JSON.parse(brut) as unknown
		if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return vide

		const cache: CacheEmpreintes = new Map()
		for (const [legacyId, valeur] of Object.entries(
			lu as Record<string, unknown>,
		)) {
			const entree = valeur as { cle?: unknown; empreinte?: unknown }
			if (
				typeof entree?.cle === 'string' &&
				typeof entree?.empreinte === 'string' &&
				entree.empreinte !== ''
			) {
				cache.set(legacyId, { cle: entree.cle, empreinte: entree.empreinte })
			}
		}
		return cache
	} catch {
		return vide
	}
}

/**
 * Écrit le cache. Un échec — quota dépassé, mode privé — est AVALÉ : perdre le
 * cache coûte un recalcul, alors qu'une exception ici ferait échouer un envoi
 * qui, lui, avait abouti.
 */
export function ecrireCache(
	stockage: CleValeur | null | undefined,
	cache: CacheEmpreintes,
): void {
	if (!stockage) return
	try {
		stockage.setItem(CLE_STOCKAGE, JSON.stringify(Object.fromEntries(cache)))
	} catch {
		// volontairement silencieux — voir ci-dessus
	}
}

/**
 * L'empreinte connue pour cette entité SI la liste de noms est celle qui l'a
 * produite. Sinon `undefined` : il faut relire les octets.
 */
export function empreinteConnue(
	cache: CacheEmpreintes,
	legacyId: string,
	cle: string,
): string | undefined {
	const entree = cache.get(legacyId)
	return entree && entree.cle === cle ? entree.empreinte : undefined
}

/** Retient une empreinte avec la clé qui l'a produite. Mute la carte reçue. */
export function retenir(
	cache: CacheEmpreintes,
	legacyId: string,
	cle: string,
	empreinte: string,
): CacheEmpreintes {
	cache.set(legacyId, { cle, empreinte })
	return cache
}
