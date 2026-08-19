// frontend/modules/site/lib/image-checksum.ts
// ═══════════════════════════════════════════════════════════════════════════
// L'EMPREINTE D'IMAGES — la seconde, celle qui ne couvre QUE les images
// ═══════════════════════════════════════════════════════════════════════════
// §4.2 de PocketSite-docs/16-conception-images.md.
//
// Le checksum d'entité (§4.4 du contrat, `catalog-export.ts:96`) couvre nom,
// slug, description, prix, stock et relations — **rien qui parle d'image**.
// Promouvoir une image ou réordonner une galerie n'écrit aucun de ces champs :
// un export incrémental fondé sur lui ne verrait jamais un changement d'image.
//
// D'où une SECONDE valeur, à côté, et non un élargissement de la première :
// toucher au checksum d'entité marquerait les 2563 produits « modifiés » et
// déclencherait un réexport complet du catalogue pour rien.
//
//   image_checksum = SHA-1 de la liste ORDONNÉE des SHA-256 des octets,
//                    principale en tête.
//
// L'ordre est signifiant, et c'est le point : les mêmes octets dans un autre
// rang donnent une autre valeur. Le contenu change → la liste change ; on
// promeut ou on réordonne → l'ordre change ; on retire une image → la liste
// raccourcit. Les risques 1, 2 et 3 de la conception, d'un seul geste.
//
// Comme le checksum d'entité : **aucune valeur de sécurité**. Il ne répond
// qu'à « ces images ont-elles changé depuis leur dernier envoi ? ». Il est
// stocké tel quel côté SQL et réémis sans être recalculé — le serveur continue
// de ne rien décider (§2 du contrat).
//
// Fonctions pures, aucun réseau. Gardien : image-checksum.test.ts.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Une entité SANS aucune image. La valeur n'est pas la chaîne vide, et c'est
 * délibéré : « pas d'images » est un état à part entière, qui doit se
 * distinguer de « jamais envoyé ». Sans elle, retirer la dernière image d'une
 * marque laisserait l'inventaire distant inchangé et l'écran dirait « à jour ».
 */
export const EMPTY_IMAGE_CHECKSUM = 'aucune-image'

const hex = (buffer: ArrayBuffer): string =>
	[...new Uint8Array(buffer)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')

/** SHA-256 des octets d'une image, en hexadécimal. */
export async function imageDigest(bytes: ArrayBuffer): Promise<string> {
	return hex(await crypto.subtle.digest('SHA-256', bytes))
}

/**
 * L'empreinte d'une entité, à partir des empreintes de ses images **dans leur
 * ordre d'affichage** — rang 0 en tête.
 *
 * Le séparateur `\n` n'est pas décoratif : sans lui, deux listes différentes
 * pourraient se concaténer en la même chaîne. Les empreintes étant ici de
 * longueur fixe, le risque est théorique — le séparateur le rend nul, et coûte
 * un octet.
 */
export async function imageChecksumOfDigests(
	digests: string[],
): Promise<string> {
	if (digests.length === 0) return EMPTY_IMAGE_CHECKSUM

	const bytes = new TextEncoder().encode(digests.join('\n'))
	return hex(await crypto.subtle.digest('SHA-1', bytes))
}

/** Le même calcul depuis les octets eux-mêmes. L'ordre du tableau EST l'ordre
 *  des rangs : le rang 0 est l'image principale (§4.1). */
export async function imageChecksumOf(images: ArrayBuffer[]): Promise<string> {
	return imageChecksumOfDigests(
		await Promise.all(images.map((bytes) => imageDigest(bytes))),
	)
}

/**
 * L'extension du rang, déduite du nom local. Le nom PocketBase ne voyage pas
 * (§4.1) — seule son extension survit, parce que le fichier distant doit rester
 * servable par Apache avec le bon type MIME.
 *
 * Un nom sans extension reconnue tombe sur `bin` plutôt que de produire un
 * fichier sans extension : c'est visible à l'œil dans un `ls` distant, là où
 * une absence passerait inaperçue.
 */
export function extensionOf(filename: string): string {
	const match = /\.([A-Za-z0-9]{1,5})$/.exec(filename.trim())
	if (!match) return 'bin'
	const ext = match[1].toLowerCase()
	return ext === 'jpeg' ? 'jpg' : ext
}

/** Les trois collections dont les images peuvent partir. `products` n'est pas
 *  encore accepté par le serveur : le premier livrable est les marques et les
 *  catégories (§4.4). */
export type ImageKind = 'brands' | 'categories' | 'products'

/** Le chemin distant d'un rang — calculé, jamais transporté (§4.1). Il sert au
 *  front à MONTRER où ira l'image ; le serveur le recalcule de son côté. */
export function remoteImagePath(
	kind: ImageKind,
	legacyId: string,
	rank: number,
	filename: string,
): string {
	return `${kind}/${legacyId}/${rank}.${extensionOf(filename)}`
}
