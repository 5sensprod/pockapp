import { describe, expect, it } from 'vitest'

import {
	blocCorrespondant,
	decouperEnBlocs,
	recomposerBlocs,
} from './sheet-blocks'

// La forme exacte que produit `renderProductSheetDescription`
// (`backend/routes/gemini_routes.go:961`). Le test part de là, et non d'un HTML
// inventé : c'est ce HTML-là que la modale doit savoir rouvrir.
const FICHE =
	'<p>Les casques Alpine Muffy Kids protègent l’ouïe des enfants.</p>' +
	'<p>Ils s’utilisent aux concerts et aux feux d’artifice.</p>' +
	'<h2>Points forts</h2><ul><li>Protection auditive</li><li>Bandeau réglable</li></ul>' +
	'<h2>Caractéristiques techniques</h2><table><tbody><tr><th>Attenuation</th><td>25dB</td></tr></tbody></table>' +
	'<h2>Conseils d’utilisation</h2><p>Ajustez la taille du bandeau.</p>'

describe('decouperEnBlocs', () => {
	it('sépare l’introduction et les trois sections', () => {
		const blocs = decouperEnBlocs(FICHE)

		expect(blocs.map((bloc) => bloc.titre)).toEqual([
			null,
			'Points forts',
			'Caractéristiques techniques',
			'Conseils d’utilisation',
		])
		expect(blocs[0].html).toContain('Alpine Muffy Kids')
		expect(blocs[0].html).not.toContain('<h2>')
		expect(blocs[1].html).toBe(
			'<ul><li>Protection auditive</li><li>Bandeau réglable</li></ul>',
		)
	})

	it('n’invente pas de bloc d’introduction quand la description ouvre sur un titre', () => {
		const blocs = decouperEnBlocs('<h2>Points forts</h2><ul><li>A</li></ul>')

		expect(blocs).toHaveLength(1)
		expect(blocs[0].titre).toBe('Points forts')
	})

	it('rend un seul bloc sans titre pour une description courte', () => {
		const blocs = decouperEnBlocs('<p>Trois phrases, pas de section.</p>')

		expect(blocs).toHaveLength(1)
		expect(blocs[0].titre).toBeNull()
	})

	it('ne rend aucun bloc pour une description vide', () => {
		expect(decouperEnBlocs('')).toEqual([])
	})
})

describe('recomposerBlocs', () => {
	// LA GARANTIE CENTRALE : la description est UNE chaîne, en base comme au
	// contrat d'export. Ouvrir la modale puis la refermer sans rien toucher ne
	// doit rien changer — sinon le checksum d'export marquerait la fiche
	// « modifiée » et la page publique serait réécrite pour rien.
	it('reconstitue à l’identique ce qui a été découpé', () => {
		expect(recomposerBlocs(decouperEnBlocs(FICHE))).toBe(FICHE)
	})

	it('supprime un bloc entièrement vidé', () => {
		const blocs = decouperEnBlocs(FICHE).map((bloc) =>
			bloc.titre === 'Points forts' ? { ...bloc, titre: '', html: '' } : bloc,
		)

		const recompose = recomposerBlocs(blocs)
		expect(recompose).not.toContain('Points forts')
		expect(recompose).toContain('Caractéristiques techniques')
	})

	it('échappe un titre saisi à la main', () => {
		expect(
			recomposerBlocs([{ id: 'x', titre: 'Prix & <promo>', html: '<p>A</p>' }]),
		).toBe('<h2>Prix &amp; &lt;promo&gt;</h2><p>A</p>')
	})
})

describe('blocCorrespondant', () => {
	it('retrouve une section malgré la casse et les accents', () => {
		const trouve = blocCorrespondant(FICHE, 'CARACTERISTIQUES TECHNIQUES')

		expect(trouve?.html).toContain('25dB')
	})

	it('retrouve l’introduction, qui n’a pas de titre', () => {
		expect(blocCorrespondant(FICHE, null)?.html).toContain('Alpine')
	})

	// Le modèle peut rendre une fiche sans la section demandée. On garde alors
	// le texte en place : effacer un bloc sur une génération incomplète serait
	// une perte silencieuse.
	it('rend null quand la génération ne porte pas la section', () => {
		expect(blocCorrespondant('<p>Court.</p>', 'Points forts')).toBeNull()
	})
})
