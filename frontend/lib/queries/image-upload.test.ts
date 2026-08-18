// frontend/lib/queries/image-upload.test.ts

import { describe, expect, it } from 'vitest'
import { buildWritePayload } from './image-upload'

const fichier = () =>
	new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })

describe('buildWritePayload', () => {
	it("laisse un objet simple quand l'image n'est pas concernée", () => {
		const payload = buildWritePayload({ name: 'Fender', slug: 'fender' })
		expect(payload).not.toBeInstanceOf(FormData)
		expect(payload).toEqual({ name: 'Fender', slug: 'fender' })
	})

	it('ne dit rien de l’image quand le formulaire n’y a pas touché', () => {
		// Sinon enregistrer une fiche sans ouvrir le sélecteur de fichier
		// effacerait l'image existante.
		const payload = buildWritePayload({ name: 'Fender' })
		expect('image' in (payload as object)).toBe(false)
	})

	it('passe en FormData dès qu’un fichier est choisi', () => {
		const payload = buildWritePayload({ name: 'Fender', image: fichier() })
		expect(payload).toBeInstanceOf(FormData)
		const form = payload as FormData
		expect(form.get('name')).toBe('Fender')
		expect(form.get('image')).toBeInstanceOf(File)
	})

	it('envoie la chaîne vide — et non undefined — pour retirer une image', () => {
		// `undefined` disparaîtrait du corps et l'ancienne image resterait en
		// base : l'utilisateur verrait son image revenir au rechargement.
		const form = buildWritePayload({
			name: 'Fender',
			removeImage: true,
		}) as FormData
		expect(form).toBeInstanceOf(FormData)
		expect(form.get('image')).toBe('')
	})

	it('écarte les champs undefined plutôt que d’écrire « undefined »', () => {
		const form = buildWritePayload({
			name: 'Fender',
			description: undefined,
			image: fichier(),
		}) as FormData
		expect(form.get('description')).toBeNull()
	})

	it('envoie une valeur nulle en chaîne vide, pour vider le champ', () => {
		const form = buildWritePayload({
			name: 'Fender',
			description: null,
			image: fichier(),
		}) as FormData
		expect(form.get('description')).toBe('')
	})

	it('répète la clé pour une relation multiple', () => {
		const form = buildWritePayload({
			name: 'Algam',
			brands: ['b1', 'b2'],
			image: fichier(),
		}) as FormData
		expect(form.getAll('brands')).toEqual(['b1', 'b2'])
	})

	it('vide une relation multiple avec un tableau vide', () => {
		const form = buildWritePayload({
			name: 'Algam',
			brands: [],
			image: fichier(),
		}) as FormData
		expect(form.getAll('brands')).toEqual([])
	})
})
