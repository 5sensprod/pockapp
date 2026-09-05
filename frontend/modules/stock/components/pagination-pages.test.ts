// frontend/modules/stock/components/pagination-pages.test.ts
//
// La fenêtre de numéros du catalogue. Elle se teste parce qu'elle est le seul
// endroit où une erreur ne se voit PAS : une rangée qui rétrécit d'un bouton
// en page 2 déplace toutes les cibles sous le curseur, et un « … » qui cache
// une page unique coûte un clic sans que personne ne comprenne pourquoi.

import { describe, expect, it } from 'vitest'

import { pagesAffichees } from './PaginationBar'

const numeros = (page: number, total: number) =>
	pagesAffichees(page, total).filter(
		(entree): entree is number => typeof entree === 'number',
	)

describe('la fenêtre de pagination', () => {
	it('rend toutes les pages tant qu’elles tiennent', () => {
		expect(pagesAffichees(1, 1)).toEqual([1])
		expect(pagesAffichees(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
	})

	it('garde la première et la dernière, où qu’on soit', () => {
		for (const page of [1, 2, 7, 60, 119, 120]) {
			const rendu = numeros(page, 120)
			expect(rendu[0], `page ${page}`).toBe(1)
			expect(rendu.at(-1), `page ${page}`).toBe(120)
		}
	})

	it('montre toujours la page courante', () => {
		for (const page of [1, 2, 3, 4, 5, 59, 60, 116, 117, 118, 119, 120]) {
			expect(numeros(page, 120), `page ${page}`).toContain(page)
		}
	})

	it('garde une largeur constante — les boutons ne se déplacent pas', () => {
		const largeurs = new Set(
			[1, 2, 3, 4, 5, 40, 60, 116, 117, 118, 119, 120].map(
				(page) => pagesAffichees(page, 120).length,
			),
		)
		expect(largeurs.size).toBe(1)
	})

	it('n’ouvre jamais un trou d’une seule page', () => {
		// Un « … » à la place du 4 coûterait un clic pour rien.
		for (let page = 1; page <= 40; page++) {
			const entrees = pagesAffichees(page, 40)
			entrees.forEach((entree, index) => {
				if (typeof entree === 'number') return
				const avant = entrees[index - 1]
				const apres = entrees[index + 1]
				expect(typeof avant === 'number' && typeof apres === 'number').toBe(
					true,
				)
				expect(
					(apres as number) - (avant as number),
					`page ${page}, trou entre ${avant} et ${apres}`,
				).toBeGreaterThan(2)
			})
		}
	})

	it('reste croissante et sans doublon', () => {
		for (const page of [1, 5, 60, 119]) {
			const rendu = numeros(page, 120)
			expect(new Set(rendu).size, `page ${page}`).toBe(rendu.length)
			expect(
				[...rendu].sort((a, b) => a - b),
				`page ${page}`,
			).toEqual(rendu)
		}
	})
})
