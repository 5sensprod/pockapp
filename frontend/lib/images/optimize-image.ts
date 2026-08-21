// frontend/lib/images/optimize-image.ts
//
// Réduire et convertir en WebP une image choisie à l'écran, AVANT l'envoi.
//
// POURQUOI ICI, DANS LE NAVIGATEUR. Le déploiement est multi-postes : un poste
// sur l'application bureau, les autres au navigateur (`CLAUDE.md`). Une
// optimisation faite côté Go ne vaudrait que pour le premier. Et l'encodage
// WebP en Go pur n'existe pas — `golang.org/x/image/webp` est un DÉCODEUR
// seul ; il faudrait cgo/libvips, donc casser `pnpm build:windows`. Le canvas
// du navigateur, lui, encode le WebP nativement.
//
// TROIS RÈGLES, et elles sont là pour protéger l'utilisateur, pas les octets :
//
//  1. **on n'agrandit jamais.** Un logo de 200 px reste à 200 px : l'étirer
//     n'ajoute aucune information et alourdit le fichier.
//  2. **on ne rend jamais un fichier plus lourd que l'original.** Un PNG plat
//     de quelques kilo-octets peut grossir en WebP. Dans ce cas on rend
//     l'original, tel quel.
//  3. **un échec ne bloque pas l'enregistrement.** Format exotique, canvas
//     indisponible, image corrompue : on rend l'original et l'utilisateur
//     enregistre. Perdre l'optimisation vaut mieux que perdre la fiche.
//
// ⚠️ CE QUE ÇA CHANGE AILLEURS. `image_checksum` est le SHA-256 des OCTETS
// (`frontend/modules/site/lib/image-checksum.ts`). Réoptimiser une image
// change donc son empreinte et la marque « à ré-exporter ». C'est sain pour un
// import neuf. **Ne jamais repasser l'existant en masse** : les 2412 produits
// publiés basculeraient d'un coup, soit 1,5 Gio de ré-envoi.
//
// ⚠️ L'EXTENSION COMPTE. Le nom distant est calculé, pas transporté :
// `<kind>/<legacy_id>/<rang>.<ext>` (`CLAUDE.md`, point 7). Convertir en WebP
// sans renommer poserait un `.png` contenant du WebP.

/** Réglages d'une optimisation. */
export interface OptimizeOptions {
	/** Côté le plus long, en pixels. Au-delà, l'image est réduite. */
	maxSide: number
	/** Qualité WebP, entre 0 et 1. */
	quality?: number
}

/** Ce qu'on rend : le fichier à envoyer, et de quoi le dire à l'écran. */
export interface OptimizeResult {
	file: File
	/** Vrai si le fichier rendu diffère de celui qui est entré. */
	optimized: boolean
	/** Taille d'origine, en octets. */
	originalBytes: number
	/** Taille rendue, en octets. */
	bytes: number
}

/** Les types qu'on sait rastériser. Le SVG en est exclu à dessein : le
 *  redimensionner le figerait, alors qu'il est déjà résolution-libre. */
const TYPES_RASTERISABLES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
]

export function estRasterisable(type: string): boolean {
	return TYPES_RASTERISABLES.includes(type)
}

/**
 * Les dimensions cibles, côté long ramené à `maxSide`, proportions gardées.
 * Rend les dimensions d'entrée si l'image est déjà assez petite (règle 1).
 */
export function dimensionsCibles(
	largeur: number,
	hauteur: number,
	maxSide: number,
): { largeur: number; hauteur: number } {
	const cote = Math.max(largeur, hauteur)
	if (cote <= maxSide || cote === 0) return { largeur, hauteur }
	const facteur = maxSide / cote
	return {
		// `round` et non `floor` : sur une image 513×513 le floor rendrait 511
		// d'un côté et 512 de l'autre, cassant le carré sans raison.
		largeur: Math.max(1, Math.round(largeur * facteur)),
		hauteur: Math.max(1, Math.round(hauteur * facteur)),
	}
}

/** Remplace l'extension par `.webp`, en gardant le reste du nom. */
export function nomEnWebp(nom: string): string {
	const point = nom.lastIndexOf('.')
	const base = point > 0 ? nom.slice(0, point) : nom
	return `${base}.webp`
}

/**
 * Réduit et convertit en WebP. Rend TOUJOURS un fichier utilisable — celui
 * d'origine si l'optimisation n'a pas lieu d'être ou n'a pas abouti.
 */
export async function optimizeImage(
	file: File,
	{ maxSide, quality = 0.85 }: OptimizeOptions,
): Promise<OptimizeResult> {
	const inchange: OptimizeResult = {
		file,
		optimized: false,
		originalBytes: file.size,
		bytes: file.size,
	}

	if (!estRasterisable(file.type)) return inchange

	try {
		// `imageOrientation: 'from-image'` applique l'orientation EXIF. Sans
		// elle, une photo prise à l'horizontale ressort couchée : le canvas ne
		// lit pas l'EXIF de lui-même.
		const bitmap = await createImageBitmap(file, {
			imageOrientation: 'from-image',
		})
		const { largeur, hauteur } = dimensionsCibles(
			bitmap.width,
			bitmap.height,
			maxSide,
		)

		const canvas = document.createElement('canvas')
		canvas.width = largeur
		canvas.height = hauteur
		const ctx = canvas.getContext('2d')
		if (!ctx) {
			bitmap.close()
			return inchange
		}
		ctx.drawImage(bitmap, 0, 0, largeur, hauteur)
		bitmap.close()

		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, 'image/webp', quality)
		})
		// Un navigateur qui n'encode pas le WebP rend un PNG sans le dire :
		// on vérifie le type rendu plutôt que de faire confiance à l'appel.
		if (!blob || blob.type !== 'image/webp') return inchange

		// Règle 2 : on ne rend jamais plus lourd.
		if (blob.size >= file.size) return inchange

		return {
			file: new File([blob], nomEnWebp(file.name), {
				type: 'image/webp',
				lastModified: Date.now(),
			}),
			optimized: true,
			originalBytes: file.size,
			bytes: blob.size,
		}
	} catch {
		// Règle 3 : jamais bloquant.
		return inchange
	}
}
