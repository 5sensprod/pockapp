// frontend/modules/site/hooks/use-ai-product-title.ts
//
// Le renderer ne connaît ni la clé Gemini ni l'URL distante. Il parle à la
// route Go locale, authentifiée, qui garde le secret dans le processus Wails.
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation } from '@tanstack/react-query'

export type ProductTitleDraft = {
	name: string
	designation?: string
	sku?: string
	brand?: string
	categories?: string[]
	currentDescription?: string
}

export type GeneratedProductTitle = {
	title: string
	model: string
}

type APIError = {
	message?: string
	response?: {
		error?: string
		message?: string
	}
}

function generationError(cause: unknown): Error {
	const apiError = cause as APIError
	return new Error(
		apiError?.response?.error ??
			apiError?.response?.message ??
			apiError?.message ??
			'Génération du titre impossible.',
	)
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
