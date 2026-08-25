// frontend/lib/images/verifier-image.ts
//
// UN FICHIER QUI DIT ÊTRE UNE IMAGE, ET UN FICHIER QUI EN EST UNE.
//
// ── LE DÉFAUT QUE CE FICHIER CORRIGE ──────────────────────────────────────
// Ajouter une photo à un produit rendait, le 25 août 2026 :
//
//	Enregistrement refusé : gallery — "valencia_gva_..._bt7eo0HUC7.png"
//	mime type must be one of: image/jpeg, image/png, image/webp, image/gif,
//	image/avif.
//
// Le fichier portait `.png`, et `image/png` était dans la liste. Le refus ne
// venait donc pas de l'extension : PocketBase RENIFLE LES OCTETS. Vérifié dans
// la bibliothèque v0.22.22, `forms/validators/file.go:65` appelle
// `mimetype.DetectReader(f)` et compare le type détecté, pas le type déclaré.
// Le nom affiché n'était même pas celui du disque — c'est celui que PocketBase
// venait de fabriquer (`tools/filesystem/file.go:170-201`, suffixe aléatoire
// de dix caractères), ce qui rendait le message encore plus opaque.
//
// Autrement dit : le fichier n'était pas un PNG. Une photo HEIC renommée, un
// BMP, un TIFF, un fichier tronqué — le contenu ne correspondait à aucun des
// cinq types du schéma (`backend/migrations/catalog_v2.go:269`).
//
// ── POURQUOI `file.type` NE SUFFIT PAS, ET POURQUOI `accept` NON PLUS ─────
// C'est le piège de ce correctif, et il faut le dire ici parce qu'il est
// invisible à la relecture : **le navigateur déduit `file.type` de
// l'extension**, pas du contenu. Un HEIC renommé `.png` s'annonce donc
// `image/png`, franchit l'attribut `accept` de l'input, franchirait un filtre
// sur `file.type`, et n'échouerait qu'au serveur — c'est exactement le cas
// signalé.
//
// Seul un DÉCODAGE réel tranche. `createImageBitmap` demande au navigateur de
// décoder les octets : il échoue sur ce que le moteur ne sait pas lire, et
// c'est précisément la question posée.
//
// ── CE QUE CE MODULE NE PRÉTEND PAS FAIRE ─────────────────────────────────
// Il n'est pas une garde de sécurité et ne remplace pas la validation
// serveur, qui reste la seule autorité. Il déplace seulement le refus AVANT
// l'envoi, pour que l'utilisateur lise une phrase utile plutôt qu'un message
// d'API en anglais portant un nom de fichier qu'il n'a jamais vu.
//
// Il peut aussi refuser un fichier que PocketBase aurait accepté : un GIF est
// dans la liste du schéma mais absent de `TYPES_ACCEPTES` côté écran, et un
// navigateur exotique pourrait ne pas décoder un AVIF. Le refus est alors un
// faux négatif, dit clairement, plutôt qu'un envoi qui échoue plus loin.

/** Ce que le schéma accepte ET que l'écran propose. Le message d'erreur en
 *  découle : inutile de nommer un format qu'on ne laisse pas choisir. */
export const FORMATS_LISIBLES = 'JPEG, PNG, WebP ou AVIF'

export interface VerdictImage {
	fichier: File
	/** Le navigateur a su décoder les octets. */
	lisible: boolean
}

/** Ce qu'il faut pour décoder, isolé pour que le test n'ait pas besoin d'un
 *  vrai moteur d'images. */
export type Decodeur = (fichier: Blob) => Promise<unknown>

const decodeurParDefaut: Decodeur = (fichier) =>
	// `createImageBitmap` rend une ressource qu'il faut libérer : la garder
	// retiendrait en mémoire une copie décodée de chaque image choisie, et on
	// n'en veut que le verdict.
	createImageBitmap(fichier).then((bitmap) => {
		if (bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
			;(bitmap as ImageBitmap).close()
		}
		return true
	})

/**
 * Trie les fichiers choisis entre ceux que le navigateur sait décoder et les
 * autres.
 *
 * L'ordre d'entrée est préservé dans `lisibles` : la galerie est une liste
 * ORDONNÉE (règle du 19 août 2026), et l'ordre de sélection est ce que
 * l'utilisateur a voulu.
 */
export async function verifierImages(
	fichiers: File[],
	decodeur: Decodeur = decodeurParDefaut,
): Promise<{ lisibles: File[]; refuses: File[] }> {
	const verdicts = await Promise.all(
		fichiers.map(async (fichier): Promise<VerdictImage> => {
			try {
				await decodeur(fichier)
				return { fichier, lisible: true }
			} catch {
				return { fichier, lisible: false }
			}
		}),
	)

	return {
		lisibles: verdicts.filter((v) => v.lisible).map((v) => v.fichier),
		refuses: verdicts.filter((v) => !v.lisible).map((v) => v.fichier),
	}
}

/**
 * Le message montré quand des fichiers sont refusés.
 *
 * Il nomme les fichiers : un utilisateur qui en a choisi huit d'un coup doit
 * savoir LESQUELS repartir chercher. Et il dit que l'extension ment, parce que
 * c'est la seule information qui permet de comprendre pourquoi un « .png »
 * est refusé comme n'étant pas une image.
 */
export function messageRefus(refuses: File[]): string {
	const noms = refuses.map((f) => f.name).join(', ')
	const pluriel = refuses.length > 1

	return pluriel
		? `${refuses.length} fichiers n'ont pas pu être lus comme des images : ${noms}. Leur extension ne correspond pas à leur contenu — il faut les convertir en ${FORMATS_LISIBLES}.`
		: `« ${noms} » n'a pas pu être lu comme une image. Son extension ne correspond pas à son contenu — il faut le convertir en ${FORMATS_LISIBLES}.`
}

/** Le type MIME à donner au fichier reconstruit : celui du blob s'il est
 *  exploitable, sinon celui que l'extension désigne. Rend une chaîne vide
 *  quand ni l'un ni l'autre ne dit rien — `optimizeImage` sautera alors, ce
 *  qui reste le comportement voulu. */
export function typeUtilisable(typeDuBlob: string, nom: string): string {
	if (typeDuBlob && typeDuBlob !== 'application/octet-stream') return typeDuBlob

	const extension = nom.slice(nom.lastIndexOf('.') + 1).toLowerCase()
	switch (extension) {
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg'
		case 'png':
			return 'image/png'
		case 'webp':
			return 'image/webp'
		case 'avif':
			return 'image/avif'
		default:
			return ''
	}
}
