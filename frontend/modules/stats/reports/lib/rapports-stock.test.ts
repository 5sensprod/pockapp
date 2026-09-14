// frontend/modules/stats/reports/lib/rapports-stock.test.ts
//
// Les gardiens du portage des Rapports. Ils tiennent UNE règle : la couche
// React de ce module met en forme, elle n'additionne pas. Ce qui est vérifié
// ici, ce sont les deux endroits où la tentation existait — le camembert et
// l'arbre de l'export — plus le fait qu'aucun fichier du module ne rouvre un
// chemin vers AppPos.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PARTS_MAXIMUM, donneesCamembert } from './donnees-camembert'
import { construireArbreExport } from './arbre-export'

const racine = join(__dirname, '..')

function fichiersDuModule(dossier = racine): string[] {
	return readdirSync(dossier).flatMap((entree) => {
		const chemin = join(dossier, entree)
		if (statSync(chemin).isDirectory()) return fichiersDuModule(chemin)
		return /\.(ts|tsx|js|jsx)$/.test(entree) ? [chemin] : []
	})
}

describe('les données du camembert', () => {
	const categories = {
		rootCategories: [
			{ id: 'a', name: 'Guitares', value: 750, products: 3, margin: 250 },
			{ id: 'b', name: 'Batteries', value: 250, products: 1, margin: 0 },
		],
		totals: { totalValue: 1000, totalProducts: 4, totalMargin: 250 },
	}

	it('reprend les totaux du serveur sans les recalculer', () => {
		// La règle du dépôt : l'écran affiche ce que le Go a additionné. Si ce
		// fichier se mettait à sommer les parts, un filtre ou un plafond
		// changerait le total affiché sans changer le stock.
		const parMode = donneesCamembert(categories)
		expect(parMode.totals).toBe(categories.totals)
	})

	it('calcule les pourcentages sur le total du serveur', () => {
		const parMode = donneesCamembert(categories)
		expect(parMode.value[0]).toMatchObject({
			name: 'Guitares',
			value: 750,
			percentage: '75.0',
		})
		expect(parMode.products[0].percentage).toBe('75.0')
	})

	it('écarte d’un mode les parts qui n’y valent rien', () => {
		// Une catégorie sans marge sort du mode « Marge » : un camembert ne sait
		// pas dessiner une part nulle, et elle prendrait une couleur pour rien.
		const parMode = donneesCamembert(categories)
		expect(parMode.margin.map((p) => p.name)).toEqual(['Guitares'])
		expect(parMode.value.map((p) => p.name)).toEqual(['Guitares', 'Batteries'])
	})

	it('ne garde que les douze plus grosses parts', () => {
		const beaucoup = {
			rootCategories: Array.from({ length: 20 }, (_, index) => ({
				id: `c${index}`,
				name: `Catégorie ${index}`,
				value: index + 1,
				products: 1,
				margin: index + 1,
			})),
			totals: { totalValue: 210, totalProducts: 20, totalMargin: 210 },
		}

		const parMode = donneesCamembert(beaucoup)
		expect(parMode.value).toHaveLength(PARTS_MAXIMUM)
		// Les plus grosses, pas les premières venues.
		expect(parMode.value[0].value).toBe(20)
	})

	it('rend des listes vides quand le serveur n’a rien rendu', () => {
		const parMode = donneesCamembert(undefined)
		expect(parMode.value).toEqual([])
		expect(parMode.totals.totalValue).toBe(0)
	})
})

describe('l’arbre de catégories de l’export', () => {
	const categories = [
		{ id: 'gui', name: 'Guitares', parent: '' },
		{ id: 'elec', name: 'Électriques', parent: 'gui' },
		{ id: 'vide', name: 'Sans stock', parent: '' },
		{ id: 'orphelin', name: 'Parent inconnu', parent: 'disparu' },
	]
	const parCategorie = {
		gui: { direct: 2, total: 9 },
		elec: { direct: 7, total: 7 },
		orphelin: { direct: 1, total: 1 },
	}

	it('reprend les décomptes du serveur, sans compter lui-même', () => {
		const arbre = construireArbreExport(categories, parCategorie)
		const guitares = arbre.find((n) => n._id === 'gui')

		expect(guitares?.productsInStockCount).toBe(2)
		// 9, pas 2 + 7 : le total du serveur dédoublonne les fiches rangées dans
		// deux catégories sœurs. L'additionner ici les compterait deux fois.
		expect(guitares?.totalProductsInStock).toBe(9)
	})

	it('élague les branches sans stock', () => {
		const arbre = construireArbreExport(categories, parCategorie)
		expect(arbre.map((n) => n._id)).not.toContain('vide')
	})

	it('remonte à la racine une catégorie dont le parent est inconnu', () => {
		// Un parent hors entreprise ou effacé ferait sinon disparaître la
		// catégorie de l'arbre, et ses produits de la sélection, sans erreur.
		const arbre = construireArbreExport(categories, parCategorie)
		expect(arbre.map((n) => n._id)).toContain('orphelin')
	})

	it('projette les nœuds en forme NeDB (`_id`)', () => {
		// Les composants portés lisent `_id`. Le jour où ils passeront en
		// TypeScript, c'est cette projection qui disparaîtra.
		const arbre = construireArbreExport(categories, parCategorie)
		expect(arbre[0]).toHaveProperty('_id')
	})
})

describe('le module ne rouvre aucun chemin vers AppPos', () => {
	it('n’importe ni `@/lib/apppos` ni un service AppServe', () => {
		// Au 10 septembre 2026, le seul importateur de `@/lib/apppos` est
		// `main.tsx` (CLAUDE.md). Le code porté venait d'AppPos : un import
		// recopié par mégarde annulerait le découplage sans faire échouer le
		// build.
		for (const fichier of fichiersDuModule()) {
			// Ce fichier-ci porte les motifs interdits, forcément.
			if (fichier === __filename) continue
			// Les commentaires CITENT les anciennes adresses AppServe pour dire
			// ce qu'elles sont devenues : c'est du code qu'on interdit, pas de la
			// mémoire.
			const source = readFileSync(fichier, 'utf-8')
				.split(/\r?\n/)
				.filter((ligne) => !/^\s*(\/\/|\*|\/\*)/.test(ligne))
				.join('\n')
			expect(source).not.toMatch(/from ['"]@\/lib\/apppos/)
			expect(source).not.toMatch(/\/api\/products\/stock\/statistics/)
		}
	})
})
