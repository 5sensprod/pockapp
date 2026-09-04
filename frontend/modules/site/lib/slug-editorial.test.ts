// frontend/modules/site/lib/slug-editorial.test.ts
// Le gardien de la réparation de slug depuis l'écran « Catalogue en ligne ».
// Il tient DEUX règles opposées : réparer le vide, et ne JAMAIS retoucher une
// adresse déjà en ligne.

import { describe, expect, it } from 'vitest'

import { slugAReparer } from './slug-editorial'

function fauxPb(produit: Record<string, unknown>, pris: string[] = []) {
	return {
		collection: () => ({
			getOne: async () => produit,
			getFirstListItem: async (filtre: string) => {
				const slug = filtre.match(/slug = "(.*)"/)?.[1] ?? ''
				if (pris.includes(slug)) return { id: 'autre' }
				throw new Error('404')
			},
		}),
	}
}

describe('slugAReparer', () => {
	it('laisse intact un slug existant, même si le nom change', async () => {
		const pb = fauxPb({ id: 'p1', name: 'Ancien nom', slug: 'ancien-nom' })
		expect(await slugAReparer(pb, 'p1', 'Nouveau nom')).toBeNull()
	})

	it('répare une fiche sans slug, à partir du nom en base', async () => {
		const pb = fauxPb({ id: 'p1', name: 'Guitare Alpine', slug: '' })
		expect(await slugAReparer(pb, 'p1', undefined)).toBe('guitare-alpine')
	})

	it('préfère le nom qu’on est en train d’écrire', async () => {
		const pb = fauxPb({ id: 'p1', name: 'Ancien', slug: '' })
		expect(await slugAReparer(pb, 'p1', 'Guitare Alpine')).toBe(
			'guitare-alpine',
		)
	})

	it('évite un slug déjà pris', async () => {
		const pb = fauxPb({ id: 'p1', name: 'Guitare Alpine', slug: '' }, [
			'guitare-alpine',
		])
		expect(await slugAReparer(pb, 'p1', undefined)).toBe('guitare-alpine-2')
	})

	it('rend null si la lecture échoue : le texte doit s’enregistrer quand même', async () => {
		const pb = {
			collection: () => ({
				getOne: async () => {
					throw new Error('réseau')
				},
			}),
		}
		expect(await slugAReparer(pb, 'p1', 'Guitare')).toBeNull()
	})
})
