// frontend/modules/site/lib/image-checksum.test.ts
//
// `pnpm test`
//
// Ce qui est gardé ici : les trois propriétés dont dépend la détection des
// changements d'image (§4.2 de 16-conception-images.md). Elles n'ont pas
// d'autre gardien — un `image_checksum` faux ne lève rien, il fait dire
// « à jour » à un écran qui a tort.

import { describe, expect, it } from 'vitest'
import {
	EMPTY_IMAGE_CHECKSUM,
	extensionOf,
	imageChecksumOf,
	imageChecksumOfDigests,
	orderedImageNames,
	remoteImagePath,
} from './image-checksum'

const octets = (...valeurs: number[]) => new Uint8Array(valeurs).buffer

describe('imageChecksumOf', () => {
	it('rend la même valeur pour les mêmes octets dans le même ordre', async () => {
		const a = await imageChecksumOf([octets(1, 2, 3), octets(4, 5)])
		const b = await imageChecksumOf([octets(1, 2, 3), octets(4, 5)])

		expect(a).toBe(b)
	})

	it('change quand le CONTENU d’une image change', async () => {
		// Risque 1 : le checksum d'entité, lui, ne bougerait pas.
		const avant = await imageChecksumOf([octets(1, 2, 3)])
		const apres = await imageChecksumOf([octets(1, 2, 4)])

		expect(apres).not.toBe(avant)
	})

	it('change quand l’ORDRE change, à octets identiques', async () => {
		// Risque 2 : promouvoir une image ou réordonner une galerie n'est qu'un
		// changement de rang. Une détection par « ensemble des fichiers » le
		// manquerait ; celle-ci ne le peut pas.
		const avant = await imageChecksumOf([octets(1), octets(2)])
		const apres = await imageChecksumOf([octets(2), octets(1)])

		expect(apres).not.toBe(avant)
	})

	it('change quand une image est RETIRÉE', async () => {
		// Risque 3 : sans cela, une image retirée en local resterait en ligne et
		// l'écran n'aurait rien à dire.
		const avant = await imageChecksumOf([octets(1), octets(2)])
		const apres = await imageChecksumOf([octets(1)])

		expect(apres).not.toBe(avant)
	})

	it('distingue « aucune image » de « jamais envoyé »', async () => {
		expect(await imageChecksumOf([])).toBe(EMPTY_IMAGE_CHECKSUM)
		expect(EMPTY_IMAGE_CHECKSUM).not.toBe('')
	})

	it('est un SHA-1 hexadécimal dès qu’il y a une image', async () => {
		expect(await imageChecksumOf([octets(1)])).toMatch(/^[0-9a-f]{40}$/)
	})

	it('se calcule aussi bien depuis les empreintes déjà connues', async () => {
		// C'est le chemin réel : les octets sont hachés une fois à la lecture,
		// jamais deux.
		const digests = ['aa', 'bb']
		expect(await imageChecksumOfDigests(digests)).toBe(
			await imageChecksumOfDigests(['aa', 'bb']),
		)
		expect(await imageChecksumOfDigests(digests)).not.toBe(
			await imageChecksumOfDigests(['bb', 'aa']),
		)
	})
})

describe('extensionOf', () => {
	it('garde l’extension du nom local, en minuscules', () => {
		// Forme réelle d'un nom PocketBase, lue dans le stockage.
		expect(extensionOf('logo_axe_neon_7RFjfnokJJ.PNG')).toBe('png')
	})

	it('normalise jpeg en jpg', () => {
		expect(extensionOf('photo.jpeg')).toBe('jpg')
	})

	it('ne rend jamais un nom sans extension', () => {
		expect(extensionOf('sans_extension')).toBe('bin')
	})
})

describe('remoteImagePath', () => {
	it('nomme par (entité, rang), jamais par le nom local', () => {
		// §4.1 : le nom PocketBase change quand on réimporte la même photo. Ce
		// qui identifie une image est le couple (entité, rang).
		expect(
			remoteImagePath(
				'brands',
				'pa_abc1234567890xyz',
				0,
				'logo_PiDxAYvQfC.jpg',
			),
		).toBe('brands/pa_abc1234567890xyz/0.jpg')
	})

	it('range la galerie derrière la principale', () => {
		expect(remoteImagePath('products', 'zXcMvjNmvWAoQJqN', 2, 'x.webp')).toBe(
			'products/zXcMvjNmvWAoQJqN/2.webp',
		)
	})
})

// ═══════════════════════════════════════════════════════════════════════════
// LA LISTE ORDONNÉE — ce que les PRODUITS ajoutent, et rien d'autre
// ═══════════════════════════════════════════════════════════════════════════
// Elle décide de trois choses à la fois : le rang distant de chaque fichier,
// l'ordre haché par l'empreinte, et donc ce que l'inventaire appellera
// « modifié ». Aucun autre gardien ne la couvre.

describe('orderedImageNames', () => {
	it('met la principale au rang 0 et la galerie derrière, dans son ordre', () => {
		expect(orderedImageNames('a.jpg', ['b.png', 'c.webp'])).toEqual([
			'a.jpg',
			'b.png',
			'c.webp',
		])
	})

	it('préserve l’ordre de la galerie — c’est lui l’ordre des vignettes', () => {
		expect(orderedImageNames('a.jpg', ['c.webp', 'b.png'])).toEqual([
			'a.jpg',
			'c.webp',
			'b.png',
		])
	})

	it('rend une liste vide quand le produit ne porte aucune image', () => {
		// « aucune image » est un état, pas un manque : l'empreinte vaut alors
		// EMPTY_IMAGE_CHECKSUM, distinct de « jamais envoyé ».
		expect(orderedImageNames(undefined, undefined)).toEqual([])
		expect(orderedImageNames('', [])).toEqual([])
	})

	it('ne laisse jamais un trou au rang 0', () => {
		// Le serveur s'arrête au premier trou de numérotation : un rang 0 vide
		// n'enverrait AUCUNE image, en silence. Le cas n'existe pas dans la base
		// (0 produit sur 2999 au 20 août 2026), mais il ne doit pas être muet.
		expect(orderedImageNames('', ['b.png'])).toEqual(['b.png'])
		expect(orderedImageNames('   ', ['b.png'])).toEqual(['b.png'])
	})
})

// ═══════════════════════════════════════════════════════════════════════════
// L'EMPREINTE BOUGE À LA PROMOTION ET AU RÉORDONNANCEMENT
// ═══════════════════════════════════════════════════════════════════════════
// Le risque 2 de la conception : « les mêmes octets, dans un autre rang ».
// Toute détection fondée sur « l'ensemble des fichiers » les manquerait — ces
// deux cas sont exactement ceux qu'un produit apporte et qu'une marque n'avait
// pas.

describe('la liste ordonnée d’un produit, bout à bout', () => {
	const empreinteDe = async (image: string, galerie: string[]) =>
		imageChecksumOfDigests(orderedImageNames(image, galerie))

	it('change quand on PROMEUT une image de la galerie', async () => {
		// Ce que fait `POST /api/catalog/products/:id/promote-image` : `image`
		// et une entrée de `gallery` sont ÉCHANGÉES (product_image_routes.go).
		const avant = await empreinteDe('a.jpg', ['b.png', 'c.webp'])
		const apres = await empreinteDe('b.png', ['a.jpg', 'c.webp'])
		expect(apres).not.toBe(avant)
	})

	it('change quand on RÉORDONNE la galerie, à contenu identique', async () => {
		const avant = await empreinteDe('a.jpg', ['b.png', 'c.webp'])
		const apres = await empreinteDe('a.jpg', ['c.webp', 'b.png'])
		expect(apres).not.toBe(avant)
	})

	it('change quand on RETIRE une image', async () => {
		const avant = await empreinteDe('a.jpg', ['b.png', 'c.webp'])
		const apres = await empreinteDe('a.jpg', ['b.png'])
		expect(apres).not.toBe(avant)
	})

	it('ne change pas quand rien ne bouge', async () => {
		expect(await empreinteDe('a.jpg', ['b.png'])).toBe(
			await empreinteDe('a.jpg', ['b.png']),
		)
	})
})
