// frontend/lib/queries/slug.ts
//
// L'ADRESSE PUBLIQUE D'UNE ENTITÉ — dérivée de son nom, une seule fois.
//
// ── LE DÉFAUT QUE CE FICHIER CORRIGE ──────────────────────────────────────
// Constaté à l'usage le 20 août 2026 : un produit créé au comptoir arrivait en
// ligne SANS SLUG, et son adresse tombait sur « Produit introuvable ».
//
// La règle « le slug est figé au premier envoi, le serveur en est le gardien »
// (§4.5 du contrat d'export) avait été écrite pour les produits venus de NeDB,
// qui arrivaient avec un slug WooCommerce. Elle dit qui a le droit de le
// CHANGER — personne — mais elle ne disait pas qui le POSE. Personne ne le
// posait :
//
//   PocketBase `slug = ''`
//     → `catalog-export.ts` envoie `null`
//       → `products-sync.php` PROTÈGE un slug existant, n'en invente jamais
//         → `catalog.php` rend `slug: null`
//           → le site retombe sur le `legacy_id` (`AxeSearch.jsx`)
//             → `WHERE p.slug = 'pa_…'` ne rend aucune ligne → 404.
//
// ── OÙ LE CORRIGER, ET POURQUOI ICI ───────────────────────────────────────
// Dans PocketApp, pas dans le PHP : « le serveur ne décide de rien » (§2 du
// contrat). Il reçoit un résultat, pas une question. C'est exactement le
// raisonnement qui a mis `legacy_id` dans `legacy-key.ts` — et le slug est de
// la même famille : une valeur que l'écran ne saisit pas et que la couche
// d'accès garantit.
//
// ── CE QUI RESTE VRAI DE LA RÈGLE ─────────────────────────────────────────
// **Un slug non vide n'est JAMAIS retouché.** Le dériver ne s'applique qu'au
// vide : une entité qui en porte un le garde, quelle que soit l'évolution de
// son nom. Renommer « Soucoupe » en « Soucoupe 2026 » ne déplace pas son
// adresse — un lien mis en favori resterait valide, et c'est tout l'intérêt.

/** Longueur maximale retenue. Le champ est plafonné à 255 au schéma distant
 *  (`server/sql/schema.sql`) ; on reste loin dessous, une adresse de boutique
 *  n'ayant aucune raison d'être un paragraphe. */
const LONGUEUR_MAX = 80

/**
 * Le slug d'un nom : minuscules, sans accents, mots joints par des tirets.
 *
 * `normalize('NFD')` décompose « é » en « e » + accent, et `\p{M}` retire
 * ensuite les marques combinantes. C'est ce qui fait que « Guitare
 * Électro-Acoustique » donne `guitare-electro-acoustique` et non
 * `guitare-lectro-acoustique`.
 *
 * **La propriété Unicode plutôt qu'une plage :** `[̀-ͯ]` disait la
 * même chose pour le français, mais Biome la refuse — une classe ne peut pas
 * décrire à la fois un caractère et un caractère combinant
 * (`noMisleadingCharacterClass`). `\p{M}` n'est pas une classe, couvre toutes
 * les écritures, et demande le drapeau `u`.
 *
 * Rend la chaîne vide si le nom ne contient aucun caractère utilisable — un
 * nom entièrement composé de symboles, par exemple. L'appelant décide alors ;
 * ce fichier ne fabrique pas d'adresse à partir de rien.
 */
export function toSlug(nom: string): string {
	return nom
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, LONGUEUR_MAX)
		.replace(/-+$/g, '')
}

/**
 * Le premier slug libre, à partir du nom.
 *
 * `estPris` est fourni par l'appelant — c'est lui qui sait interroger la base.
 * En cas de collision : `soucoupe`, `soucoupe-2`, `soucoupe-3`…
 *
 * **La boucle est bornée**, et ce n'est pas de la superstition : `estPris`
 * interroge le réseau, et un défaut qui le ferait toujours répondre « pris »
 * bloquerait l'enregistrement dans une boucle infinie, écran figé. Au-delà de
 * la borne on rend le candidat suffixé du rang atteint : deux adresses proches
 * valent mieux qu'une caisse qui ne répond plus.
 */
export async function slugLibre(
	nom: string,
	estPris: (candidat: string) => Promise<boolean>,
	maxTentatives = 50,
): Promise<string> {
	const base = toSlug(nom)
	if (base === '') return ''

	for (let rang = 1; rang <= maxTentatives; rang += 1) {
		const candidat = rang === 1 ? base : `${base}-${rang}`
		if (!(await estPris(candidat))) return candidat
	}

	return `${base}-${maxTentatives + 1}`
}

/**
 * Le premier slug libre dans une collection PocketBase.
 *
 * La collection est explicite au point d'appel : produits et catégories ont
 * la même règle d'adresse, mais pas le même espace de noms. L'unicité se lit
 * dans PocketBase, jamais dans le serveur du site, qui ne doit rien inventer.
 */
export async function slugLibreDansCollection(
	pb: any,
	collection: 'products' | 'categories' | 'brands',
	nom: string,
): Promise<string> {
	return slugLibre(nom, async (candidat) => {
		try {
			await pb
				.collection(collection)
				.getFirstListItem(`slug = "${candidat}"`, { fields: 'id' })
			return true
		} catch {
			// PocketBase lève un 404 quand rien ne correspond : c'est le cas
			// normal. La contrainte unique de la collection reste le dernier garde
			// en cas de créations concurrentes depuis deux postes.
			return false
		}
	})
}
