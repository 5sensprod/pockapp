// frontend/modules/stick/labels/lib/images-catalogue.ts
//
// LES IMAGES DE POCKETSTOCK que l'éditeur d'affiche peut poser : logos des
// marques, images des catégories, logo de l'entreprise. Deux usages :
// - LIÉES au produit (`produit-adapte.ts`) : le logo de SA marque, l'image de
//   SA catégorie, qui changent d'une page à l'autre du tirage ;
// - FIXES, choisies dans la bibliothèque de l'onglet Médias.
//
// `image` et `logo` sont des NOMS DE FICHIER PocketBase : seul
// `pb.files.getUrl` en fait des URL — passé en paramètre plutôt qu'importé,
// comme dans `produit-adapte.ts`. Module pur, testable sous Node.

export interface ImageCatalogue {
	id: string
	nom: string
	src: string
}

interface AvecImage {
	id: string
	name: string
	image?: string
}

type UrlFichier = (record: any, nom: string) => string

/** Les enregistrements qui portent une image, avec son URL, dans leur ordre. */
export function imagesDe(records: AvecImage[] | undefined, fileUrl: UrlFichier): ImageCatalogue[] {
	return (records ?? [])
		.filter((r) => !!r.image)
		.map((r) => ({ id: r.id, nom: r.name, src: fileUrl(r, r.image as string) }))
}

/** id → URL de l'image, pour la projection du produit. */
export function urlParId(images: ImageCatalogue[]): Map<string, string> {
	return new Map(images.map((i) => [i.id, i.src]))
}

/**
 * L'image de catégorie d'un produit : un produit est rangé dans PLUSIEURS
 * catégories, et toutes n'ont pas d'image — on prend la première, dans
 * l'ordre de la fiche, qui en a une. Aucune : chaîne vide, l'élément lié ne
 * dessine rien pour ce produit.
 */
export function imageCategorieDuProduit(
	categories: string[] | undefined,
	imageParCategorie: Map<string, string> | undefined,
): string {
	for (const id of categories ?? []) {
		const src = imageParCategorie?.get(id)
		if (src) return src
	}
	return ''
}

/** Recherche dans une bibliothèque : casse et accents pliés, chaque mot doit s'y trouver. */
const plier = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()

export function filtrerImages(images: ImageCatalogue[], terme: string): ImageCatalogue[] {
	const mots = plier(terme).split(/\s+/).filter(Boolean)
	if (!mots.length) return images
	return images.filter((i) => {
		const nom = plier(i.nom)
		return mots.every((m) => nom.includes(m))
	})
}
