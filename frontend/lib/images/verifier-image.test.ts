// frontend/lib/images/verifier-image.test.ts
//
// Ce qui est gardé ici : **un fichier refusé ne doit pas emporter le lot**, et
// l'ordre de la galerie est celui de la sélection. Le reste — décoder pour de
// vrai — est le travail du navigateur, injecté ici pour que le test n'ait pas
// besoin d'un moteur d'images.

import { describe, expect, it } from 'vitest'
import { messageRefus, typeUtilisable, verifierImages } from './verifier-image'

/** Un fichier dont seul le nom compte pour ces tests. */
function fichier(nom: string): File {
	return new File(['x'], nom, { type: 'image/png' })
}

/** Décodeur de test : échoue sur les noms contenant « menteur ». C'est la
 *  situation réelle — le nom dit `.png`, les octets disent autre chose. */
const decodeur = async (blob: Blob) => {
	if ((blob as File).name.includes('menteur')) {
		throw new Error('format non décodable')
	}
	return true
}

describe('verifierImages', () => {
	it('sépare ce qui se décode de ce qui ne se décode pas', async () => {
		const { lisibles, refuses } = await verifierImages(
			[fichier('bon.png'), fichier('menteur.png')],
			decodeur,
		)

		expect(lisibles.map((f) => f.name)).toEqual(['bon.png'])
		expect(refuses.map((f) => f.name)).toEqual(['menteur.png'])
	})

	// Refuser les huit pour un seul fautif obligerait à tout rechoisir.
	it('un fichier fautif n’emporte pas les autres du même lot', async () => {
		const { lisibles } = await verifierImages(
			[fichier('a.png'), fichier('menteur.png'), fichier('b.png')],
			decodeur,
		)

		expect(lisibles.map((f) => f.name)).toEqual(['a.png', 'b.png'])
	})

	// La galerie est une liste ORDONNÉE (règle du 19 août 2026) : l'ordre de
	// sélection est une donnée, `Promise.all` ne doit pas le brouiller.
	it('préserve l’ordre de sélection', async () => {
		const noms = ['z.png', 'a.png', 'm.png']
		const { lisibles } = await verifierImages(noms.map(fichier), decodeur)

		expect(lisibles.map((f) => f.name)).toEqual(noms)
	})

	it('ne refuse rien quand tout se décode', async () => {
		const { lisibles, refuses } = await verifierImages(
			[fichier('a.png'), fichier('b.webp')],
			decodeur,
		)

		expect(lisibles).toHaveLength(2)
		expect(refuses).toEqual([])
	})

	it('accepte une liste vide sans lever', async () => {
		await expect(verifierImages([], decodeur)).resolves.toEqual({
			lisibles: [],
			refuses: [],
		})
	})
})

describe('messageRefus', () => {
	// Un utilisateur qui a choisi huit fichiers doit savoir LESQUELS repartir
	// chercher : un message sans nom de fichier ne sert à rien.
	it('nomme le fichier refusé', () => {
		expect(messageRefus([fichier('valencia.png')])).toContain('valencia.png')
	})

	it('nomme les fichiers refusés, au pluriel', () => {
		const message = messageRefus([fichier('a.png'), fichier('b.png')])

		expect(message).toContain('a.png')
		expect(message).toContain('b.png')
		expect(message).toContain('2 fichiers')
	})

	// C'est la seule information qui permet de comprendre pourquoi un « .png »
	// est refusé comme n'étant pas une image. Sans elle, le message paraît faux.
	it('dit que l’extension ne correspond pas au contenu', () => {
		expect(messageRefus([fichier('a.png')])).toContain(
			'ne correspond pas à son contenu',
		)
	})
})

// Le second chemin d'`ImageField` : optimiser une image DÉJÀ EN BASE la
// retélécharge, et `blob.type` vient de l'en-tête `Content-Type` de la
// réponse. Vide ou en `application/octet-stream`, `estRasterisable` le refuse,
// l'optimisation est sautée EN SILENCE et le bouton annonce « déjà optimale,
// rien à gagner » sur une image qui avait tout à gagner.
describe('typeUtilisable', () => {
	it('garde le type du blob quand il dit quelque chose', () => {
		expect(typeUtilisable('image/png', 'photo.webp')).toBe('image/png')
	})

	it('replie sur l’extension quand le blob ne dit rien', () => {
		expect(typeUtilisable('', 'photo.png')).toBe('image/png')
		expect(typeUtilisable('application/octet-stream', 'photo.jpg')).toBe(
			'image/jpeg',
		)
	})

	it('accepte .jpg comme .jpeg', () => {
		expect(typeUtilisable('', 'a.jpeg')).toBe('image/jpeg')
		expect(typeUtilisable('', 'a.JPG')).toBe('image/jpeg')
	})

	// Rendre un type inventé serait pire que rien : `optimizeImage` tenterait un
	// décodage voué à l'échec et rendrait l'original de toute façon.
	it('rend une chaîne vide quand rien ne dit rien', () => {
		expect(typeUtilisable('', 'archive.zip')).toBe('')
		expect(typeUtilisable('', 'sans-extension')).toBe('')
	})
})
