// Les produits du canvas suivent la base : le store ne garde que des ids,
// la relecture remplace la projection, les corrections manuelles survivent.
// Voir `PocketStick-docs/02-produits-vivants.md`.
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import { COLLECTIONS_SURVEILLEES } from '@/lib/realtime/catalog-realtime'
import {
	cleProduitsAffiche,
	filtreParIds,
	idsDisparus,
} from '../lib/produits-par-ids'
import { versProduitAffiche } from '../lib/produit-adapte'
import {
	ficheChangeeDepuisCorrection,
	resolvePropForElement,
	texteDeLaFiche,
} from '../utils/dataBinding'
import useLabelStore from './useLabelStore'

const JOUR = '2026-09-29' as any

const fiche = (id: string, extra: Record<string, unknown> = {}) =>
	({
		id,
		name: `Nom ${id}`,
		designation: `Désignation ${id}`,
		price_ttc: 100,
		brand: 'b1',
		supplier: 's1',
		barcode: '123',
		slug: `slug-${id}`,
		gallery: [],
		...extra,
	}) as any

const ctx = (marque = 'Yamaha', fournisseur = 'Fourni') => ({
	brandById: new Map([['b1', marque]]),
	supplierById: new Map([['s1', fournisseur]]),
	fileUrl: (_r: any, nom: string) => `http://x/${nom}`,
	jour: JOUR,
})

const etat = () => useLabelStore.getState() as any

beforeEach(() => {
	etat().setDataSource(null, null)
})

describe('le store ne garde que des identifiants', () => {
	it('la sélection est une liste d’ids ; les objets sont dérivés', () => {
		etat().setDataSource('data', [
			versProduitAffiche(fiche('a'), ctx()),
			versProduitAffiche(fiche('b'), ctx()),
		])
		expect(etat().selectedProductIds).toEqual(['a', 'b'])
		expect(etat().selectedProduct._id).toBe('a')
		etat().goToNextProduct()
		expect(etat().currentProductIndex).toBe(1)
		expect(etat().selectedProduct._id).toBe('b')
	})

	it('une relecture remplace la copie : prix, désignation, image, slug', () => {
		etat().setSelectedProducts([versProduitAffiche(fiche('a'), ctx())])
		const avant = etat().selectedProduct
		etat().synchroniserProduits([
			versProduitAffiche(
				fiche('a', {
					price_ttc: 80,
					designation: 'Nouveau nom',
					image: 'photo.jpg',
					slug: 'nouveau-slug',
				}),
				ctx(),
			),
		])
		const apres = etat().selectedProduct
		expect(apres).not.toBe(avant)
		expect(apres.price).toBe(80)
		expect(apres.name).toBe('Nouveau nom')
		expect(apres.image.src).toBe('http://x/photo.jpg')
		expect(apres.website_url).toContain('nouveau-slug')
		expect(etat().selectedProducts[0]).toBe(apres)
	})

	it('un produit inchangé garde sa référence (pas de rendu pour rien)', () => {
		etat().setSelectedProducts([versProduitAffiche(fiche('a'), ctx())])
		const avant = etat().selectedProduct
		etat().synchroniserProduits([versProduitAffiche(fiche('a'), ctx())])
		expect(etat().selectedProduct).toBe(avant)
	})

	it('une relecture ne rajoute pas un produit hors sélection et garde l’index', () => {
		etat().setSelectedProducts([
			versProduitAffiche(fiche('a'), ctx()),
			versProduitAffiche(fiche('b'), ctx()),
		])
		etat().goToProductIndex(1)
		etat().synchroniserProduits([
			versProduitAffiche(fiche('z'), ctx()),
			versProduitAffiche(fiche('b', { price_ttc: 5 }), ctx()),
		])
		expect(etat().selectedProductIds).toEqual(['a', 'b'])
		expect(etat().currentProductIndex).toBe(1)
		expect(etat().selectedProduct.price).toBe(5)
	})

	it('marque et fournisseur renommés suivent par le contexte vivant', () => {
		etat().setSelectedProducts([versProduitAffiche(fiche('a'), ctx())])
		etat().synchroniserProduits([
			versProduitAffiche(fiche('a'), ctx('Yamaha Music', 'Nouveau fourni')),
		])
		expect(etat().selectedProduct.brand_ref.name).toBe('Yamaha Music')
		expect(etat().selectedProduct.supplier_ref.name).toBe('Nouveau fourni')
	})
})

describe('produit supprimé : gardé, signalé, retirable', () => {
	it('garde la dernière valeur et le signale', () => {
		etat().setSelectedProducts([
			versProduitAffiche(fiche('a'), ctx()),
			versProduitAffiche(fiche('b'), ctx()),
		])
		etat().goToProductIndex(1)
		const rendus = [fiche('b')]
		etat().synchroniserProduits(
			rendus.map((p) => versProduitAffiche(p, ctx())),
			idsDisparus(['a', 'b'], rendus),
		)
		expect(etat().produitsDisparus).toEqual(['a'])
		expect(etat().selectedProducts.map((p: any) => p._id)).toEqual(['a', 'b'])

		etat().retirerProduitsDisparus()
		expect(etat().selectedProductIds).toEqual(['b'])
		expect(etat().produitsDisparus).toEqual([])
		expect(etat().selectedProduct._id).toBe('b')
	})
})

describe('la requête par ids est périmée par le temps réel existant', () => {
	it('une seule requête, valeurs échappées par pb.filter', () => {
		const pb = {
			filter: (e: string, p: any) => e.replace('{:id}', `'${p.id}'`),
		}
		expect(filtreParIds(pb, ['b', 'a', 'b', ''])).toBe("id = 'a' || id = 'b'")
	})

	it('products invalide la clé ; brands et suppliers invalident le contexte', async () => {
		const qc = new QueryClient()
		const cle = cleProduitsAffiche(['a'])
		const invalidee = async (collection: string, key: readonly unknown[]) => {
			qc.setQueryData(key, [1])
			for (const k of COLLECTIONS_SURVEILLEES[collection])
				await qc.invalidateQueries({ queryKey: k, refetchType: 'none' })
			return qc.getQueryState(key)?.isInvalidated
		}
		expect(await invalidee('products', cle)).toBe(true)
		// `useBrands` / `useSuppliers` : clés `['brands', …]` / `['suppliers', …]`
		expect(await invalidee('brands', ['brands', 'c1'])).toBe(true)
		expect(await invalidee('suppliers', ['suppliers', 'c1'])).toBe(true)
	})
})

describe('les corrections manuelles survivent à une mise à jour', () => {
	const el = {
		type: 'text',
		dataBinding: 'name',
		text: '',
		textOverrides: { a: 'Nom corrigé' },
		textOverridesSource: { a: 'Désignation a' },
	}

	it('la correction l’emporte sur la nouvelle fiche', () => {
		etat().setSelectedProducts([versProduitAffiche(fiche('a'), ctx())])
		etat().synchroniserProduits([
			versProduitAffiche(fiche('a', { designation: 'Autre nom' }), ctx()),
		])
		expect(resolvePropForElement(el.text, el, etat().selectedProduct)).toBe(
			'Nom corrigé',
		)
	})

	it('signale la fiche changée depuis la correction, pas avant', () => {
		const inchangee = versProduitAffiche(fiche('a'), ctx())
		expect(texteDeLaFiche(el, inchangee)).toBe('Désignation a')
		expect(ficheChangeeDepuisCorrection(el, inchangee)).toBeUndefined()
		const changee = versProduitAffiche(
			fiche('a', { designation: 'Autre nom' }),
			ctx(),
		)
		expect(ficheChangeeDepuisCorrection(el, changee)).toBe('Autre nom')
		// Correction ancienne, sans mémo : aucun signal.
		const ancien = { ...el, textOverridesSource: undefined }
		expect(ficheChangeeDepuisCorrection(ancien, changee)).toBeUndefined()
	})
})
