// frontend/lib/catalog/web-links.test.ts
//
// La règle des liens de fiche vit ici et NULLE PART AILLEURS : le formulaire
// l'appelle, l'export la rappelle avant d'envoyer. Ce test tient les cas qui
// ont motivé chaque refus.

import { describe, expect, it } from 'vitest'

import { estUrlYouTube, liensNormalises, motifRefusLien } from './web-links'

describe('motifRefusLien', () => {
	it('accepte une page en https', () => {
		expect(motifRefusLien('link', 'https://www.yamaha.com/p/1')).toBeNull()
	})

	it('refuse le http en clair', () => {
		// La page du site est servie en https : un lien en clair déclenche un
		// avertissement de contenu mixte sur l'iframe d'une vidéo.
		expect(motifRefusLien('link', 'http://exemple.fr')).toBe(
			'Seul https est accepté',
		)
	})

	it('refuse une vidéo qui n’est pas sur YouTube', () => {
		// Le site l'intègre dans une iframe youtube-nocookie : un autre hôte y
		// donnerait un cadre vide, et le vendeur ne le verrait qu'en ligne.
		expect(motifRefusLien('video', 'https://vimeo.com/12345')).toBe(
			'Adresse YouTube attendue pour une vidéo',
		)
	})

	it('accepte les formes courtes et longues de YouTube', () => {
		for (const url of [
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
			'https://youtu.be/dQw4w9WgXcQ',
			'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
		]) {
			expect(motifRefusLien('video', url)).toBeNull()
		}
	})
})

describe('estUrlYouTube', () => {
	it('compare l’HÔTE, jamais le texte de l’URL', () => {
		// Une adresse qui CONTIENT « youtube.com » sans en être une : sans la
		// comparaison d'hôte, elle passerait et l'iframe chargerait un tiers.
		expect(estUrlYouTube('https://exemple.fr/?r=youtube.com')).toBe(false)
		expect(estUrlYouTube('https://youtube.com.pirate.fr/v')).toBe(false)
	})
})

describe('liensNormalises', () => {
	it('écarte ce qui ne passe pas, plutôt que de tout refuser', () => {
		// Le champ PocketBase est un JSON libre : rien ne garantit sa forme. Une
		// entrée tordue sur douze ne doit pas empêcher la fiche de s'ouvrir.
		const liens = liensNormalises([
			{ kind: 'link', url: 'https://ok.fr', label: '  Notice  ' },
			{ kind: 'link', url: 'pas-une-url' },
			null,
			'texte',
			{ kind: 'video', url: 'https://vimeo.com/1' },
		])
		expect(liens).toEqual([
			{ kind: 'link', url: 'https://ok.fr', label: 'Notice' },
		])
	})

	it('rend une liste vide pour tout ce qui n’est pas un tableau', () => {
		expect(liensNormalises(undefined)).toEqual([])
		expect(liensNormalises({ kind: 'link' })).toEqual([])
	})

	it('conserve l’ORDRE — c’est celui de l’affichage sur le site', () => {
		const liens = liensNormalises([
			{ kind: 'video', url: 'https://youtu.be/a', label: 'Démo' },
			{ kind: 'link', url: 'https://b.fr', label: '' },
		])
		expect(liens.map((l) => l.url)).toEqual([
			'https://youtu.be/a',
			'https://b.fr',
		])
	})
})
