// frontend/modules/stick/labels/utils/vignetteImage.js
//
// LA VIGNETTE d'une image de la bibliothèque du poste : 256 px au plus sur le
// grand côté, WebP (JPEG si le moteur n'écrit pas de WebP — l'alpha est alors
// perdu, mais la vignette est posée sur du blanc). Ne touche jamais à
// l'originale : elle ne fait que la LIRE. Rend `null` si l'image ne se décode
// pas — l'appelant garde alors l'originale pour l'aperçu.

export const COTE_VIGNETTE = 256

/** Dimensions de la vignette : le grand côté à `max`, jamais d'agrandissement. */
export const dimensionsVignette = (largeur, hauteur, max = COTE_VIGNETTE) => {
	if (!largeur || !hauteur) return { largeur: max, hauteur: max }
	const echelle = Math.min(1, max / Math.max(largeur, hauteur))
	return {
		largeur: Math.max(1, Math.round(largeur * echelle)),
		hauteur: Math.max(1, Math.round(hauteur * echelle)),
	}
}

const decoder = (src) =>
	new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = () => reject(new Error('image illisible'))
		img.src = src
	})

export async function fabriquerVignette(src, max = COTE_VIGNETTE) {
	try {
		if (typeof document === 'undefined') return null
		const img = await decoder(src)
		const { largeur, hauteur } = dimensionsVignette(img.naturalWidth, img.naturalHeight, max)
		const canvas = document.createElement('canvas')
		canvas.width = largeur
		canvas.height = hauteur
		const ctx = canvas.getContext('2d')
		if (!ctx) return null
		ctx.drawImage(img, 0, 0, largeur, hauteur)
		const webp = canvas.toDataURL('image/webp', 0.85)
		if (webp.startsWith('data:image/webp')) return webp
		return canvas.toDataURL('image/jpeg', 0.85)
	} catch {
		return null
	}
}
