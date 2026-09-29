import { describe, expect, it } from 'vitest'
import { contenuFiche, lignesTableau } from './ficheProduit'

// La forme exacte produite par `renderProductSheetDescription`
const FICHE =
	'<p>Intro</p><p>Détails</p>' +
	'<h2>Points forts</h2><ul><li>Léger</li><li>Robuste &amp; fiable</li></ul>' +
	'<h2>Caractéristiques techniques</h2><table><tbody>' +
	'<tr><th>Puissance</th><td>50 W</td></tr>' +
	'<tr><th>Poids</th><td>3,2&nbsp;kg</td></tr>' +
	'</tbody></table>' +
	'<h2>Conseils d’utilisation</h2><p>Baissez le volume.</p>'

describe('contenuFiche', () => {
	it('le tableau des caractéristiques, en lignes nom / valeur', () => {
		expect(contenuFiche(FICHE, 'specs')).toEqual({
			kind: 'rows',
			rows: [
				['Puissance', '50 W'],
				['Poids', '3,2 kg'],
			],
		})
	})
	it('les points forts, en puces, entités décodées', () => {
		expect(contenuFiche(FICHE, 'highlights')).toEqual({
			kind: 'bullets',
			items: ['Léger', 'Robuste & fiable'],
		})
	})
	it('les conseils, en paragraphe', () => {
		expect(contenuFiche(FICHE, 'tips')).toEqual({
			kind: 'paragraph',
			text: 'Baissez le volume.',
		})
	})
	it('titre en majuscules sans accents : trouvé quand même', () => {
		const f = '<h2>CARACTERISTIQUES TECHNIQUES</h2><table><tr><td>A</td><td>B</td></tr></table>'
		expect(contenuFiche(f, 'specs')?.rows).toEqual([['A', 'B']])
	})
	it('produit sans fiche structurée : rien', () => {
		expect(contenuFiche('<p>Juste un texte</p>', 'specs')).toBeNull()
		expect(contenuFiche('', 'tips')).toBeNull()
		expect(contenuFiche(undefined, 'highlights')).toBeNull()
	})
})

describe('lignesTableau', () => {
	it('plus de deux cellules : la valeur les réunit', () => {
		expect(lignesTableau('<tr><th>Taille</th><td>S</td><td>M</td></tr>')).toEqual([
			['Taille', 'S — M'],
		])
	})
})

describe('entités HTML', () => {
	it('les codes numériques sont décodés (guillemet des pouces, accents)', () => {
		const f =
			'<h2>Caractéristiques techniques</h2><table>' +
			'<tr><th>Composition</th><td>1 Hi-hat 14&#34; et 1 Crash 18&#x22;</td></tr>' +
			'<tr><th>Mat&#233;riau</th><td>Cuivre</td></tr></table>'
		expect(contenuFiche(f, 'specs')?.rows).toEqual([
			['Composition', '1 Hi-hat 14" et 1 Crash 18"'],
			['Matériau', 'Cuivre'],
		])
	})
})
