// frontend/lib/queries/gallery-order.test.ts

import { describe, expect, it } from 'vitest'
import {
	MAX_GALERIE,
	ajouter,
	deplacer,
	estPromouvable,
	memeGalerie,
	nomEntree,
	retirer,
} from './gallery-order'

const fichier = (nom = 'neuf.png') =>
	new File([new Uint8Array([1])], nom, { type: 'image/png' })

describe('gallery-order', () => {
	it('ajoute en fin de liste — là où PocketBase mettra le fichier', () => {
		expect(ajouter(['a.jpg', 'b.jpg'], [fichier()]).map(nomEntree)).toEqual([
			'a.jpg',
			'b.jpg',
			'neuf.png',
		])
	})

	it('n’ajoute rien au-delà du maximum du schéma', () => {
		// PocketBase refuserait la requête entière : la galerie serait perdue
		// pour l'utilisateur, pas seulement la onzième image.
		const pleine = Array.from({ length: MAX_GALERIE }, (_, i) => `${i}.jpg`)
		expect(ajouter(pleine, [fichier()])).toHaveLength(MAX_GALERIE)
	})

	it('tronque un lot trop grand plutôt que de tout refuser', () => {
		const liste = ajouter(
			['a.jpg'],
			Array.from({ length: 20 }, (_, i) => fichier(`n${i}.png`)),
		)
		expect(liste).toHaveLength(MAX_GALERIE)
		expect(nomEntree(liste[0])).toBe('a.jpg')
	})

	it('retire une entrée sans toucher aux autres', () => {
		expect(retirer(['a.jpg', 'b.jpg', 'c.jpg'], 1)).toEqual(['a.jpg', 'c.jpg'])
	})

	it('ignore un retrait hors bornes plutôt que de vider la liste', () => {
		// `splice(-1, 1)` retirerait la DERNIÈRE image : un index fautif
		// supprimerait un fichier à l'envoi.
		expect(retirer(['a.jpg'], -1)).toEqual(['a.jpg'])
		expect(retirer(['a.jpg'], 5)).toEqual(['a.jpg'])
	})

	it('déplace une entrée vers la gauche et vers la droite', () => {
		expect(deplacer(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
		expect(deplacer(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
	})

	it('ne perd aucune entrée en déplaçant, ni n’en duplique', () => {
		const depart = ['a', 'b', 'c', 'd']
		const apres = deplacer(depart, 1, 3)
		expect([...apres].sort()).toEqual([...depart].sort())
		expect(depart).toEqual(['a', 'b', 'c', 'd']) // l'entrée n'est pas mutée
	})

	it('ignore un déplacement hors bornes', () => {
		expect(deplacer(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
		expect(deplacer(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
		expect(deplacer(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
	})

	it('ne déclare promouvable qu’une entrée déjà en base', () => {
		// La route serveur désigne l'image par son NOM : un fichier pas encore
		// envoyé n'en a pas.
		expect(estPromouvable('a.jpg')).toBe(true)
		expect(estPromouvable(fichier())).toBe(false)
	})
	// ── La galerie inchangée ne s'envoie pas ──────────────────────────────
	// Le défaut constaté à l'usage : la modale garde un instantané du produit
	// pris à l'ouverture. Renvoyer cette liste après une promotion faisait
	// échouer l'enregistrement — « The field contains unknown filenames. »

	it('reconnaît une galerie inchangée', () => {
		expect(memeGalerie(['a.jpg', 'b.jpg'], ['a.jpg', 'b.jpg'])).toBe(true)
		expect(memeGalerie([], [])).toBe(true)
	})

	it('voit un changement d’ORDRE — l’ordre est une donnée', () => {
		expect(memeGalerie(['a.jpg', 'b.jpg'], ['b.jpg', 'a.jpg'])).toBe(false)
	})

	it('voit un ajout, un retrait, et un fichier pas encore envoyé', () => {
		expect(memeGalerie(['a.jpg'], ['a.jpg', 'b.jpg'])).toBe(false)
		expect(memeGalerie(['a.jpg', 'b.jpg'], ['a.jpg'])).toBe(false)
		expect(memeGalerie([fichier()], [fichier()])).toBe(false)
	})
})
