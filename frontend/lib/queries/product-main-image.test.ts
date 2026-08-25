// frontend/lib/queries/product-main-image.test.ts

import { beforeAll, describe, expect, it } from 'vitest'

let productMainImageRemovalPayload: () => Record<string, unknown> | FormData

beforeAll(async () => {
	// `catalog-products.ts` construit le client PocketBase à l'import et son
	// détecteur Wails lit `window`. Le dépôt n'embarque pas jsdom : ce décor
	// minimal suffit au test pur du corps de requête.
	const g = globalThis as any
	g.window ??= g
	g.document ??= { location: { origin: 'http://127.0.0.1:8090' } }
	productMainImageRemovalPayload = (await import('./catalog-products'))
		.productMainImageRemovalPayload
})

describe('suppression de l’image principale d’un produit', () => {
	it('vide image sans envoyer, réordonner ni promouvoir la galerie', () => {
		// La galerie peut être non vide en base : son absence du corps est
		// précisément la garantie qu'elle reste entière, dans son ordre. Une
		// promotion éventuelle restera un second geste, explicite.
		const form = productMainImageRemovalPayload() as FormData

		expect(form).toBeInstanceOf(FormData)
		expect(form.get('image')).toBe('')
		expect(form.getAll('gallery')).toEqual([])
	})
})
