// frontend/modules/site/lib/sheet-files.ts
//
// Les pièces jointes de l'assistant : mêmes limites que le serveur, vérifiées
// avant l'envoi pour que le refus se dise en français plutôt qu'en erreur
// d'API. Les valeurs sont celles de `backend/routes/gemini_routes.go:44-48` —
// les changer ici ne change rien là-bas, et l'inverse non plus : c'est le
// serveur qui décide, cet écran ne fait que l'annoncer plus tôt.

import type { ProductSheetFile } from '../hooks/use-ai-product-title'

export const MAX_FILES = 3
export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const MAX_TOTAL_BYTES = 5 * 1024 * 1024

export const ACCEPTED_MIME_TYPES = new Set([
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
])

export const ACCEPT_ATTRIBUTE = '.pdf,.jpg,.jpeg,.png,.webp'

/** Le type MIME d'un fichier, déduit du nom quand le navigateur se tait —
 *  ce qu'il fait couramment pour un PDF glissé depuis certains explorateurs. */
export function fileMIMEType(file: File): string {
	if (file.type) return file.type.toLowerCase()
	const extension = file.name.split('.').pop()?.toLowerCase()
	if (extension === 'pdf') return 'application/pdf'
	if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
	if (extension === 'png') return 'image/png'
	if (extension === 'webp') return 'image/webp'
	return ''
}

export function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onerror = () =>
			reject(new Error(`Lecture de ${file.name} impossible.`))
		reader.onload = () => {
			const result = String(reader.result ?? '')
			const comma = result.indexOf(',')
			if (comma < 0) {
				reject(new Error(`Contenu de ${file.name} invalide.`))
				return
			}
			resolve(result.slice(comma + 1))
		}
		reader.readAsDataURL(file)
	})
}

/**
 * Retenir ce qui est acceptable d'un lot choisi, et dire ce qui est refusé.
 *
 * Les fichiers valides du même lot entrent quand même : refuser les trois pour
 * un seul fautif obligerait à tout rechoisir — même règle que la galerie.
 */
export function trierPiecesJointes(
	dejaLa: File[],
	choisis: File[],
): { retenus: File[]; refus: string[] } {
	const retenus: File[] = [...dejaLa]
	const refus: string[] = []
	let total = dejaLa.reduce((somme, fichier) => somme + fichier.size, 0)

	for (const fichier of choisis) {
		if (retenus.length >= MAX_FILES) {
			refus.push(`${fichier.name} : ${MAX_FILES} fichiers au maximum.`)
			continue
		}
		if (!ACCEPTED_MIME_TYPES.has(fileMIMEType(fichier))) {
			refus.push(`${fichier.name} : format non accepté (PDF, JPEG, PNG, WebP).`)
			continue
		}
		if (fichier.size === 0 || fichier.size > MAX_FILE_BYTES) {
			refus.push(`${fichier.name} : 2 Mio au maximum par fichier.`)
			continue
		}
		if (total + fichier.size > MAX_TOTAL_BYTES) {
			refus.push(`${fichier.name} : 5 Mio au maximum en tout.`)
			continue
		}
		retenus.push(fichier)
		total += fichier.size
	}

	return { retenus, refus }
}

export async function encoderPiecesJointes(
	fichiers: File[],
): Promise<ProductSheetFile[]> {
	return await Promise.all(
		fichiers.map(async (fichier) => ({
			name: fichier.name,
			mimeType: fileMIMEType(fichier),
			data: await fileToBase64(fichier),
		})),
	)
}
