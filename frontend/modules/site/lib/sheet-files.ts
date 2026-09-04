// frontend/modules/site/lib/sheet-files.ts
//
// Les pièces jointes de l'assistant : mêmes limites que le serveur, vérifiées
// avant l'envoi pour que le refus se dise en français plutôt qu'en erreur
// d'API. Les valeurs sont celles de `backend/routes/gemini_routes.go` —
// les changer ici ne change rien là-bas, et l'inverse non plus : c'est le
// serveur qui décide, cet écran ne fait que l'annoncer plus tôt.

import type { ProductSheetFile } from '../hooks/use-ai-product-title'

export const MAX_FILES = 3
export const MAX_FILE_BYTES = 7 * 1024 * 1024
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024

export const ACCEPTED_MIME_TYPES = new Set([
	'application/pdf',
	'text/plain',
	'image/jpeg',
	'image/png',
	'image/webp',
	// Gemini lit le HEIC/HEIF nativement. Le navigateur, lui, ne sait pas le
	// décoder : ces fichiers échappent au redimensionnement et partent tels
	// quels — c'est pour eux que le plafond par fichier est aussi haut.
	'image/heic',
	'image/heif',
])

export const ACCEPT_ATTRIBUTE = '.pdf,.txt,.jpg,.jpeg,.png,.webp,.heic,.heif'

/** Le type MIME d'un fichier, déduit du nom quand le navigateur se tait —
 *  ce qu'il fait couramment pour un PDF glissé depuis certains explorateurs. */
export function fileMIMEType(file: File): string {
	if (file.type) return file.type.toLowerCase()
	const extension = file.name.split('.').pop()?.toLowerCase()
	if (extension === 'pdf') return 'application/pdf'
	if (extension === 'txt') return 'text/plain'
	if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
	if (extension === 'png') return 'image/png'
	if (extension === 'webp') return 'image/webp'
	if (extension === 'heic') return 'image/heic'
	if (extension === 'heif') return 'image/heif'
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
			refus.push(
				`${fichier.name} : format non accepté (PDF, TXT, JPEG, PNG, WebP, HEIC).`,
			)
			continue
		}
		if (fichier.size === 0 || fichier.size > MAX_FILE_BYTES) {
			refus.push(`${fichier.name} : 7 Mio au maximum par fichier.`)
			continue
		}
		if (total + fichier.size > MAX_TOTAL_BYTES) {
			refus.push(`${fichier.name} : 15 Mio au maximum en tout.`)
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

/** Au-delà de ce côté, une capture est réduite : 2200 px suffisent largement à
 *  rendre lisible le texte d'une page produit ou d'un emballage, et Gemini
 *  découpe de toute façon l'image en tuiles de 768 px. */
const COTE_MAX = 2200
/** En deçà, on n'y touche pas : recompresser une petite capture PNG nette en
 *  JPEG ne ferait qu'abîmer le texte pour rien. */
const SEUIL_COMPRESSION = 1_200_000

/**
 * Réduire une capture d'écran ou une photo de téléphone avant l'envoi.
 *
 * Une capture pleine page ou une photo récente dépasse couramment le plafond
 * par fichier ; refusée, elle ne dit rien de plus à l'utilisateur que
 * « trop gros ». On la redimensionne donc localement, en gardant assez de
 * définition pour que le texte reste lisible — c'est ce texte qui fait tout
 * l'intérêt de l'image.
 *
 * Ce qui n'est pas une image décodable par le navigateur (PDF, TXT, HEIC)
 * ressort inchangé : la fonction ne juge pas, elle allège quand elle peut.
 */
export async function alleger(fichier: File): Promise<File> {
	const type = fileMIMEType(fichier)
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return fichier
	if (fichier.size <= SEUIL_COMPRESSION) return fichier
	if (typeof createImageBitmap !== 'function') return fichier

	try {
		const image = await createImageBitmap(fichier)
		const facteur = Math.min(1, COTE_MAX / Math.max(image.width, image.height))
		const largeur = Math.round(image.width * facteur)
		const hauteur = Math.round(image.height * facteur)
		const canvas = document.createElement('canvas')
		canvas.width = largeur
		canvas.height = hauteur
		const contexte = canvas.getContext('2d')
		if (!contexte) return fichier
		contexte.drawImage(image, 0, 0, largeur, hauteur)
		image.close?.()

		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', 0.9),
		)
		if (!blob || blob.size >= fichier.size) return fichier
		const nom = `${fichier.name.replace(/\.[^.]+$/, '')}.jpg`
		return new File([blob], nom, { type: 'image/jpeg' })
	} catch {
		// Un format que le navigateur refuse de décoder reste envoyé tel quel :
		// le serveur tranchera, et son refus est explicite.
		return fichier
	}
}

export async function allegerToutes(fichiers: File[]): Promise<File[]> {
	return await Promise.all(fichiers.map(alleger))
}
