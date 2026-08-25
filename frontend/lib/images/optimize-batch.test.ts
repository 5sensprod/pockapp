// Ce que ces tests gardent : les trois règles du lot — séquentiel, un échec
// n'arrête rien, l'annulation ne coupe pas au milieu d'un enregistrement — et
// la règle silencieuse qui coûterait le plus cher : **une image sans gain n'est
// pas réécrite**. La réécrire changerait `image_checksum` et enverrait
// l'entité au miroir sans avoir économisé un octet.

import { describe, expect, it } from 'vitest'
import {
	type BatchImageItem,
	formaterOctets,
	optimiserLotImages,
} from './optimize-batch'

const item = (id: string): BatchImageItem => ({
	id,
	label: `Marque ${id}`,
	url: `/files/${id}.jpg`,
})

/** Un faux fichier : seule sa taille compte pour ces tests. */
const fichier = (taille: number, nom = 'logo.jpg') =>
	({ size: taille, name: nom }) as File

describe('optimiserLotImages', () => {
	it('réécrit uniquement les images où il y a un gain', async () => {
		const ecrits: string[] = []

		const rapport = await optimiserLotImages([item('a'), item('b')], {
			fetchFile: async () => fichier(1000),
			optimize: async (f) =>
				// « a » gagne, « b » ne gagne rien.
				ecrits.length === 0
					? {
							file: fichier(400, 'logo.webp'),
							optimized: true,
							originalBytes: 1000,
							bytes: 400,
						}
					: { file: f, optimized: false, originalBytes: 1000, bytes: 1000 },
			save: async (it) => {
				ecrits.push(it.id)
			},
		})

		expect(ecrits).toEqual(['a'])
		expect(rapport.octetsAvant).toBe(1000)
		expect(rapport.octetsApres).toBe(400)
		expect(rapport.outcomes.map((o) => o.kind)).toEqual([
			'optimise',
			'inchange',
		])
	})

	it("n'arrête pas le lot sur un échec, et le nomme", async () => {
		const ecrits: string[] = []

		const rapport = await optimiserLotImages(
			[item('a'), item('b'), item('c')],
			{
				fetchFile: async (it) => {
					if (it.id === 'b') throw new Error('404')
					return fichier(1000)
				},
				optimize: async () => ({
					file: fichier(400, 'logo.webp'),
					optimized: true,
					originalBytes: 1000,
					bytes: 400,
				}),
				save: async (it) => {
					ecrits.push(it.id)
				},
			},
		)

		// « c » est traité malgré l'échec de « b ».
		expect(ecrits).toEqual(['a', 'c'])
		const echec = rapport.outcomes.find((o) => o.kind === 'echec')
		expect(echec).toMatchObject({ raison: '404' })
		expect(echec && echec.kind === 'echec' && echec.item.id).toBe('b')
	})

	it('traite les entités une par une, jamais en parallèle', async () => {
		let enVol = 0
		let maxEnVol = 0

		await optimiserLotImages([item('a'), item('b'), item('c')], {
			fetchFile: async () => {
				enVol += 1
				maxEnVol = Math.max(maxEnVol, enVol)
				await new Promise((r) => setTimeout(r, 0))
				enVol -= 1
				return fichier(1000)
			},
			optimize: async (f) => ({
				file: f,
				optimized: false,
				originalBytes: 1000,
				bytes: 1000,
			}),
			save: async () => {},
		})

		expect(maxEnVol).toBe(1)
	})

	it('interrompt entre deux entités, sans couper un enregistrement', async () => {
		const signal = { aborted: false }
		const ecrits: string[] = []

		const rapport = await optimiserLotImages(
			[item('a'), item('b'), item('c')],
			{
				fetchFile: async () => fichier(1000),
				optimize: async () => ({
					file: fichier(400, 'logo.webp'),
					optimized: true,
					originalBytes: 1000,
					bytes: 400,
				}),
				save: async (it) => {
					ecrits.push(it.id)
					// On annule PENDANT l'enregistrement de « a » : il doit aboutir,
					// et « b » ne doit jamais commencer.
					signal.aborted = true
				},
				signal,
			},
		)

		expect(ecrits).toEqual(['a'])
		expect(rapport.interrompu).toBe(true)
		expect(rapport.outcomes).toHaveLength(1)
	})

	it('annonce la progression après chaque entité', async () => {
		const vus: number[] = []

		await optimiserLotImages([item('a'), item('b')], {
			fetchFile: async () => fichier(1000),
			optimize: async (f) => ({
				file: f,
				optimized: false,
				originalBytes: 1000,
				bytes: 1000,
			}),
			save: async () => {},
			onProgress: (fait) => vus.push(fait),
		})

		expect(vus).toEqual([1, 2])
	})
})

describe('formaterOctets', () => {
	it('change d’unité aux seuils', () => {
		expect(formaterOctets(512)).toBe('512 o')
		expect(formaterOctets(2048)).toBe('2 Ko')
		expect(formaterOctets(1572864)).toBe('1.5 Mo')
	})
})
