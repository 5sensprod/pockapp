/**
 * Convertit une URL d'image en Data URL (base64) pour react-pdf
 */
export async function toPngDataUrl(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas')
				canvas.width = img.naturalWidth || img.width
				canvas.height = img.naturalHeight || img.height
				const ctx = canvas.getContext('2d')
				if (!ctx) {
					reject(new Error('Impossible de créer un contexte 2D'))
					return
				}
				ctx.drawImage(img, 0, 0)
				resolve(canvas.toDataURL('image/png'))
			} catch (err) {
				reject(err)
			}
		}
		img.onerror = (err) => reject(err)
		img.src = url
	})
}
