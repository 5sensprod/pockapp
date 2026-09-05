// frontend/lib/queries/catalog-gap-filters.test.ts
//
// LE COMPTEUR ET LA LISTE DOIVENT DIRE LE MÊME NOMBRE.
//
// Le panneau de filtres annonce « Sans image · 437 ». Ce 437 est compté par le
// Go (`/api/catalog/counts`) ; les 437 lignes, elles, sont ramenées par le
// filtre que le client envoie à PocketBase. Deux chemins, deux fichiers, deux
// langages — et la même règle écrite des deux côtés.
//
// Le jour où l'une bouge sans l'autre, rien ne casse : le compteur affiche
// simplement un nombre qui n'est pas celui de la liste, et personne ne le
// remarque avant d'avoir compté à la main. D'où ce test, qui lit les deux
// sources.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Les fichiers sont LUS, pas importés : `catalog-products.ts` ouvre un client
// PocketBase au chargement du module, qui exige un `window`.
const racine = join(__dirname, '..', '..', '..')
const lire = (...chemin: string[]) =>
	readFileSync(join(racine, ...chemin), 'utf-8')

const sourceGo = lire('backend', 'routes', 'catalog_counts_routes.go')
const sourceTs = lire('frontend', 'lib', 'queries', 'catalog-products.ts')

/** Les clauses déclarées dans `CLAUSES_MANQUE`, relues depuis le source. */
function clausesDuClient(): [string, string][] {
	const bloc = /export const CLAUSES_MANQUE = \{([\s\S]*?)\} as const/.exec(
		sourceTs,
	)?.[1]
	if (!bloc) throw new Error('CLAUSES_MANQUE introuvable')

	const entrees: [string, string][] = []
	for (const ligne of bloc.split(/\r?\n/)) {
		const trouve = /^\s*(\w+):\s*(['"])(.*?)\2,\s*$/.exec(ligne)
		if (trouve) entrees.push([trouve[1], trouve[3]])
	}
	return entrees
}

describe('les manques sont écrits une seule fois', () => {
	it('les quatre clauses sont bien déclarées', () => {
		const noms = clausesDuClient()
			.map(([nom]) => nom)
			.sort()
		expect(noms).toEqual(['description', 'image', 'prixAchat', 'stock'])
	})

	it.each(clausesDuClient())(
		'le serveur compte « %s » avec la clause du client',
		(_nom, clause) => {
			// La clause apparaît telle quelle dans une constante Go. Seuls les
			// guillemets qui l'entourent diffèrent d'un langage à l'autre.
			const echappee = clause.replace(/"/g, '\\"')
			const presente =
				sourceGo.includes(`"${echappee}"`) || sourceGo.includes(`\`${clause}\``)
			expect(presente, `clause absente du Go : ${clause}`).toBe(true)
		},
	)

	it('aucun COUNT SQL écrit à la main sur ces colonnes', () => {
		// C'est par là que la divergence reviendrait : un `COUNT(*) FROM products
		// WHERE image = ''` est plus court à écrire, et faux dès le premier
		// `:length` — sans erreur, avec un compteur simplement mensonger.
		expect(sourceGo).not.toMatch(/COUNT\([^)]*\)\s*FROM\s+products\s+WHERE/i)
	})
})
