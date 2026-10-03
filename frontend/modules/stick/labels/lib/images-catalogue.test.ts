import { describe, expect, it } from 'vitest'
import { CHAMPS_PRODUIT, champsPourType } from '../utils/champsProduit'
import { getProductField } from '../utils/dataBinding'
import { filtrerImages, imageCategorieDuProduit, imagesDe, urlParId } from './images-catalogue'
import { versProduitAffiche } from './produit-adapte'

const fileUrl = (r: any, nom: string) => `http://pb/files/${r.id}/${nom}`

describe('imagesDe', () => {
	it('ne garde que les enregistrements qui portent une image, avec leur URL', () => {
		const images = imagesDe(
			[
				{ id: 'b1', name: 'Fender', image: 'fender.png' },
				{ id: 'b2', name: 'Sans logo' },
				{ id: 'b3', name: 'Vide', image: '' },
			],
			fileUrl,
		)
		expect(images).toEqual([{ id: 'b1', nom: 'Fender', src: 'http://pb/files/b1/fender.png' }])
		expect(urlParId(images).get('b1')).toBe('http://pb/files/b1/fender.png')
		expect(imagesDe(undefined, fileUrl)).toEqual([])
	})
})

describe('imageCategorieDuProduit', () => {
	const parId = new Map([
		['c2', 'img-c2'],
		['c3', 'img-c3'],
	])
	it('la PREMIÈRE catégorie de la fiche qui a une image', () => {
		expect(imageCategorieDuProduit(['c1', 'c2', 'c3'], parId)).toBe('img-c2')
		expect(imageCategorieDuProduit(['c3', 'c2'], parId)).toBe('img-c3')
	})
	it('aucune : vide, l’élément lié ne dessinera rien', () => {
		expect(imageCategorieDuProduit(['c1'], parId)).toBe('')
		expect(imageCategorieDuProduit([], parId)).toBe('')
		expect(imageCategorieDuProduit(undefined, parId)).toBe('')
		expect(imageCategorieDuProduit(['c2'], undefined)).toBe('')
	})
})

describe('filtrerImages', () => {
	const images = [
		{ id: '1', nom: 'Éclat Audio', src: 'a' },
		{ id: '2', nom: 'Fender', src: 'b' },
	]
	it('plie la casse et les accents, chaque mot doit s’y trouver', () => {
		expect(filtrerImages(images, 'eclat').map((i) => i.id)).toEqual(['1'])
		expect(filtrerImages(images, 'AUDIO écl').map((i) => i.id)).toEqual(['1'])
		expect(filtrerImages(images, 'eclat fender')).toEqual([])
		expect(filtrerImages(images, '  ')).toBe(images)
	})
})

describe('logo de la marque et image de la catégorie, liés au produit', () => {
	const ctx = {
		brandById: new Map([['b1', 'Fender']]),
		supplierById: new Map<string, string>(),
		imageMarqueById: new Map([['b1', 'logo-fender']]),
		imageCategorieById: new Map([['c2', 'img-guitares']]),
		fileUrl: (_r: unknown, nom: string) => nom,
		jour: '2026-10-03',
	} as any
	const produit = { id: 'p1', name: 'Strat', brand: 'b1', categories: ['c1', 'c2'] } as any

	it('la projection porte les deux URL, et `getProductField` les rend', () => {
		const p = versProduitAffiche(produit, ctx)
		expect(getProductField(p, 'brand_image')).toBe('logo-fender')
		expect(getProductField(p, 'category_image')).toBe('img-guitares')
		// le nom de la marque n'a pas bougé
		expect(getProductField(p, 'brand')).toBe('Fender')
	})

	it('marque sans logo, produit sans marque, contexte sans images : vide', () => {
		const sansLogo = versProduitAffiche({ ...produit, brand: 'b9', categories: ['c1'] }, ctx)
		expect(getProductField(sansLogo, 'brand_image')).toBe('')
		expect(getProductField(sansLogo, 'category_image')).toBe('')
		const sansMarque = versProduitAffiche({ ...produit, brand: '' }, ctx)
		expect(getProductField(sansMarque, 'brand_image')).toBe('')
		const ancienCtx = { ...ctx, imageMarqueById: undefined, imageCategorieById: undefined }
		expect(getProductField(versProduitAffiche(produit, ancienCtx), 'brand_image')).toBe('')
	})

	it('le registre les propose pour une image, et seulement pour une image', () => {
		const cles = champsPourType('image').map((c: any) => c.cle)
		expect(cles).toEqual(['product_image', 'brand_image', 'category_image'])
		expect(champsPourType('text').map((c: any) => c.cle)).not.toContain('brand_image')
		expect(CHAMPS_PRODUIT.filter((c: any) => c.cle === 'brand_image')).toHaveLength(1)
	})
})
