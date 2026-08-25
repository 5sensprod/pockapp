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
	// ── LA GALERIE, 19 août 2026 ──────────────────────────────────────────
	// « Une image ne se perd pas » : chacun de ces cas protège un fichier que
	// PocketBase supprimerait sans confirmation si la liste envoyée était
	// incomplète.

	it('ne dit rien de la galerie quand le formulaire n’y a pas touché', () => {
		const payload = buildWritePayload({ name: 'Ampli' })
		expect('gallery' in (payload as object)).toBe(false)
	})

	it('renvoie la galerie COMPLÈTE, noms d’abord, dans l’ordre donné', () => {
		// L'ordre est une donnée : c'est lui qui décidera de l'ordre des
		// vignettes sur le site. PocketBase le respecte
		// (`forms/record_upsert.go:461`).
		const form = buildWritePayload({
			name: 'Ampli',
			gallery: ['c.jpg', 'a.jpg', 'b.jpg'],
		}) as FormData
		expect(form).toBeInstanceOf(FormData)
		expect(form.getAll('gallery')).toEqual(['c.jpg', 'a.jpg', 'b.jpg'])
	})

	it('mêle un fichier neuf aux noms déjà en base', () => {
		const form = buildWritePayload({
			name: 'Ampli',
			gallery: ['a.jpg', fichier()],
		}) as FormData
		const entrees = form.getAll('gallery')
		expect(entrees[0]).toBe('a.jpg')
		expect(entrees[1]).toBeInstanceOf(File)
	})

	it('vide la galerie avec la chaîne vide, jamais par le silence', () => {
		// `undefined` laisserait les fichiers en base ; un tableau vide sans
		// entrée n'écrirait rien du tout dans le FormData.
		const form = buildWritePayload({ name: 'Ampli', gallery: [] }) as FormData
		expect(form.getAll('gallery')).toEqual([''])
	})

	it('ne touche PAS à l’image principale quand seule la galerie change', () => {
		// LE PIÈGE : la galerie fait basculer en FormData, et l'ancienne
		// version y écrivait `image: ''` — enregistrer une galerie aurait
		// supprimé le fichier de l'image principale.
		const form = buildWritePayload({
			name: 'Ampli',
			gallery: ['a.jpg'],
		}) as FormData
		expect(form.getAll('image')).toEqual([])
	})

	it('écrit l’image ET la galerie dans la même requête', () => {
		// Le cas du remplacement de la principale : les deux champs partent
		// ensemble, et la galerie porte sa liste complète.
		const form = buildWritePayload({
			name: 'Ampli',
			image: fichier(),
			gallery: ['a.jpg', 'b.jpg'],
		}) as FormData
		expect(form.get('image')).toBeInstanceOf(File)
		expect(form.getAll('gallery')).toEqual(['a.jpg', 'b.jpg'])
	})

	it('retire l’image principale sans emporter la galerie', () => {
		const form = buildWritePayload({
			name: 'Ampli',
			removeImage: true,
			gallery: ['a.jpg'],
		}) as FormData
		expect(form.get('image')).toBe('')
		expect(form.getAll('gallery')).toEqual(['a.jpg'])
	})

	it('retire la principale en gardant le silence sur toute galerie existante', () => {
		// Règle produit : supprimer la principale ne choisit pas implicitement la
		// première image secondaire. La requête immédiate ne porte donc QUE le
		// retrait ; la galerie reste en base, entière et dans son ordre.
		const form = buildWritePayload({ removeImage: true }) as FormData
		expect(form.get('image')).toBe('')
		expect(form.getAll('gallery')).toEqual([])
	})
})
