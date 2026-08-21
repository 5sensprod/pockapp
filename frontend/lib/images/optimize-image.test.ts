// Ce que ces tests gardent : les RÈGLES, pas l'encodeur du navigateur.
//
// `createImageBitmap` et `canvas.toBlob` n'existent pas sous jsdom. Vérifier
// qu'un WebP sort réellement à 512 px demanderait un vrai navigateur ; ce qui
// se casse en relisant le code, en revanche, ce sont les règles ci-dessous.

import { describe, expect, it } from 'vitest'
import {
	dimensionsCibles,
	estRasterisable,
	nomEnWebp,
	optimizeImage,
} from './optimize-image'

describe('dimensionsCibles', () => {
	it("n'agrandit jamais une image déjà petite", () => {
		expect(dimensionsCibles(200, 120, 512)).toEqual({
			largeur: 200,
			hauteur: 120,
		})
	})

	it('ramène le côté LE PLUS LONG au plafond, proportions gardées', () => {
		expect(dimensionsCibles(2048, 1024, 512)).toEqual({
			largeur: 512,
			hauteur: 256,
		})
		expect(dimensionsCibles(1024, 2048, 512)).toEqual({
			largeur: 256,
			hauteur: 512,
		})
	})

	it('garde un carré carré — le floor casserait 513×513', () => {
		const { largeur, hauteur } = dimensionsCibles(513, 513, 512)
		expect(largeur).toBe(hauteur)
	})

	it('ne descend jamais à zéro sur une image très allongée', () => {
		const { hauteur } = dimensionsCibles(4000, 3, 512)
		expect(hauteur).toBeGreaterThanOrEqual(1)
	})
})

describe('nomEnWebp', () => {
	it("remplace l'extension, sans quoi un .png contiendrait du WebP", () => {
		expect(nomEnWebp('yamaha.png')).toBe('yamaha.webp')
		expect(nomEnWebp('logo.final.JPEG')).toBe('logo.final.webp')
	})

	it('ajoute une extension à un nom qui n’en a pas', () => {
		expect(nomEnWebp('logo')).toBe('logo.webp')
	})
})

describe('estRasterisable', () => {
	it('exclut le SVG : résolution-libre, le réduire le figerait', () => {
		expect(estRasterisable('image/svg+xml')).toBe(false)
		expect(estRasterisable('application/pdf')).toBe(false)
		expect(estRasterisable('image/webp')).toBe(true)
	})
})

describe('optimizeImage — ne bloque jamais un enregistrement', () => {
	it('rend le fichier tel quel pour un type non rastérisable', async () => {
		const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })
		const res = await optimizeImage(svg, { maxSide: 512 })
		expect(res.file).toBe(svg)
		expect(res.optimized).toBe(false)
	})

	it("rend l'original quand le canvas n'aboutit pas", async () => {
		// Sous jsdom, `createImageBitmap` est absent : c'est exactement le
		// chemin d'échec qu'on veut voir se rattraper.
		const png = new File([new Uint8Array([1, 2, 3])], 'x.png', {
			type: 'image/png',
		})
		const res = await optimizeImage(png, { maxSide: 512 })
		expect(res.file).toBe(png)
		expect(res.optimized).toBe(false)
		expect(res.bytes).toBe(png.size)
	})
})
