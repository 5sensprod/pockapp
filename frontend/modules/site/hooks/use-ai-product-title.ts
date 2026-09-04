// frontend/modules/site/hooks/use-ai-product-title.ts
//
// Le renderer ne connaît ni la clé Gemini ni l'URL distante. Il parle aux
// routes Go locales, authentifiées, qui gardent le secret dans Wails. La fiche
// complète part du contexte et des sources jointes ; Google Search peut s'y
// ajouter explicitement lorsque l'utilisateur active le tag Web.
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation } from '@tanstack/react-query'

export type ProductTitleDraft = {
	name: string
	designation?: string
	sku?: string
	/** Le code-barres tel qu'il est en base. Le serveur ne le retient que s'il a
	 *  la forme d'un EAN/UPC : un code interne n'identifie rien sur le web. */
	barcode?: string
	brand?: string
	categories?: string[]
	currentDescription?: string
	/** Les mêmes pièces jointes que la fiche. Le titre s'en sert pour lire le
	 *  modèle exact sur un emballage ou une capture de page produit ; sans
	 *  elles, il ne peut que reformuler le nom déjà saisi. */
	files?: ProductSheetFile[]
}

export type GeneratedProductTitle = {
	title: string
	model: string
}

export type ProductSheetFile = {
	name: string
	mimeType: string
	data: string
}

export type ProductSheetDraft = ProductTitleDraft & {
	descriptionFormat: 'short' | 'detailed'
	instructions?: string
	sourceText?: string
	files?: ProductSheetFile[]
	webSearch: boolean
}

export type ProductSheetSource = {
	title: string
	url: string
}

export type GeneratedProductSheet = {
	description: string
	sources: ProductSheetSource[]
	searchQueries: string[]
	searchEntryPointHtml?: string
	/** Le doute du modèle sur le format demandé, quand il en a un : une phrase
	 *  adressée à l'utilisateur. Le modèle ne change JAMAIS le format de
	 *  lui-même — une fiche est un texte que le magasin publie, et c'est celui
	 *  qui la relit qui tranche. Vide quand le format demandé convient. */
	formatNote?: string
	/** Le format que le modèle aurait choisi. Vide s'il est d'accord. */
	suggestedFormat?: 'short' | 'detailed' | ''
	model: string
}

type APIError = {
	message?: string
	response?: {
		error?: string
		message?: string
		/** Le motif technique, quand la route en connaît un (`gemini_routes.go`).
		 *  Il est AFFICHÉ : sur un poste client personne ne lit les journaux de
		 *  l'exécutable, et sans lui « réessaie dans un instant » invite à
		 *  réessayer une demande qui ne peut pas aboutir. */
		detail?: string
	}
}

function generationError(cause: unknown): Error {
	const apiError = cause as APIError
	const message =
		apiError?.response?.error ??
		apiError?.response?.message ??
		apiError?.message ??
		'Génération du titre impossible.'
	const detail = apiError?.response?.detail
	return new Error(detail ? `${message}\n${detail}` : message)
}

export function useGenerateProductTitle() {
	const pb = usePocketBase() as any

	return useMutation<GeneratedProductTitle, Error, ProductTitleDraft>({
		mutationFn: async (draft) => {
			try {
				return (await pb.send('/api/ai/product-title', {
					method: 'POST',
					body: draft,
				})) as GeneratedProductTitle
			} catch (cause) {
				throw generationError(cause)
			}
		},
	})
}

export function useGenerateProductSheet() {
	const pb = usePocketBase() as any

	return useMutation<GeneratedProductSheet, Error, ProductSheetDraft>({
		mutationFn: async (draft) => {
			try {
				return (await pb.send('/api/ai/product-sheet', {
					method: 'POST',
					body: draft,
				})) as GeneratedProductSheet
			} catch (cause) {
				throw generationError(cause)
			}
		},
	})
}

/** Une photo proposée par la recherche : deux adresses, et rien d'autre. Aucun
 *  octet ne transite par PocketApp, rien n'entre dans la galerie. */
export type ProductImageCandidate = {
	imageUrl: string
	pageUrl?: string
	title?: string
}

export type GeneratedProductImages = {
	candidates: ProductImageCandidate[]
	searchQueries: string[]
	model: string
}

/**
 * Chercher des photos du produit sur le web.
 *
 * ⚠️ **Les adresses rendues ne sont pas vérifiées.** Une URL d'image est ce
 * qu'un modèle de langue invente le mieux, et le serveur ne va pas chercher
 * chaque fichier pour le savoir — ce serait une sortie réseau vers des
 * domaines arbitraires depuis le poste du client, pour un simple aperçu.
 * **C'est l'affichage qui tranche** : la vignette qui ne charge pas est
 * retirée de l'écran (`onError`). Attendre moins de propositions à l'écran
 * qu'il n'en revient d'ici est donc normal.
 */
export function useSearchProductImages() {
	const pb = usePocketBase() as any

	return useMutation<GeneratedProductImages, Error, ProductTitleDraft>({
		mutationFn: async (draft) => {
			try {
				return (await pb.send('/api/ai/product-images', {
					method: 'POST',
					body: draft,
				})) as GeneratedProductImages
			} catch (cause) {
				throw generationError(cause)
			}
		},
	})
}
