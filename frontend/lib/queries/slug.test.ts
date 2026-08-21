// frontend/lib/queries/slug.test.ts
//
// Le défaut d'origine : « Soucoupe », créé au comptoir, est parti en ligne
// sans slug et son adresse rendait « Produit introuvable ». Ces tests gardent
// la règle qui l'empêche de se reproduire.

import { describe, expect, it } from 'vitest'
import { slugLibre, toSlug } from './slug'

describe('toSlug', () => {
	it('dérive une adresse simple du nom', () => {
		expect(toSlug('Soucoupe')).toBe('soucoupe')
	})

	it('retire les accents plutôt que les lettres', () => {
		// Sans la décomposition NFD, « É » disparaîtrait avec sa lettre et
		// l'adresse deviendrait `guitare-lectro-acoustique`.
		expect(toSlug('Guitare Électro-Acoustique')).toBe(
			'guitare-electro-acoustique',
		)
		expect(toSlug('Médiator nylon 0,73mm')).toBe('mediator-nylon-0-73mm')
	})

	it('joint les mots par un seul tiret, sans tiret aux extrémités', () => {
		expect(toSlug('  Ampli   Fender  ')).toBe('ampli-fender')
		expect(toSlug('« Guitare » (occasion)')).toBe('guitare-occasion')
	})

	it('ne rend jamais un slug qui se termine par un tiret, même tronqué', () => {
		// La troncature tombe parfois sur un séparateur : `…-mot-` serait une
		// adresse laide et, surtout, différente de sa version normalisée.
		const long = `${'a'.repeat(79)} suite du nom`
		expect(long.length).toBeGreaterThan(80)
		expect(toSlug(long).endsWith('-')).toBe(false)
	})

	it('rend la chaîne vide quand le nom n’a rien d’utilisable', () => {
		// Ce fichier ne fabrique pas d'adresse à partir de rien : l'appelant
		// décide quoi faire d'un nom composé de symboles seuls.
		expect(toSlug('!!! ???')).toBe('')
		expect(toSlug('')).toBe('')
	})
})

describe('slugLibre', () => {
	const pris =
		(...noms: string[]) =>
		async (c: string) =>
			noms.includes(c)

	it('rend le slug du nom quand il est libre', async () => {
		expect(await slugLibre('Soucoupe', pris())).toBe('soucoupe')
	})

	it('suffixe au premier rang libre en cas de collision', async () => {
		expect(await slugLibre('Soucoupe', pris('soucoupe'))).toBe('soucoupe-2')
		expect(await slugLibre('Soucoupe', pris('soucoupe', 'soucoupe-2'))).toBe(
			'soucoupe-3',
		)
	})

	it('ne boucle pas indéfiniment si la base répond toujours « pris »', async () => {
		// LE CAS QUI FIGERAIT LA CAISSE : `estPris` interroge le réseau. Un défaut
		// qui le ferait toujours répondre vrai bloquerait l'enregistrement, écran
		// figé, sans message. Deux adresses proches valent mieux que cela.
		let appels = 0
		const toujoursPris = async () => {
			appels += 1
			return true
		}
		expect(await slugLibre('Soucoupe', toujoursPris, 5)).toBe('soucoupe-6')
		expect(appels).toBe(5)
	})

	it('rend la chaîne vide sans interroger la base si le nom est inutilisable', async () => {
		let appels = 0
		const compte = async () => {
			appels += 1
			return false
		}
		expect(await slugLibre('!!!', compte)).toBe('')
		expect(appels).toBe(0)
	})
})
