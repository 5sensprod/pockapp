// frontend/modules/menu-links.test.ts
//
// Aucun lien de menu ne doit pointer vers une route qui n'existe pas.
//
// Cette règle n'avait aucun gardien, et elle a cassé le 18 août 2026 : la route
// `/stock-apppos` a été supprimée, mais `modules/home/index.ts` la citait
// toujours dans la barre latérale principale. Le lien était mort et, avec lui,
// le seul accès à AppStock depuis l'accueil. Ni le compilateur ni les tests ne
// l'ont vu : un `to:` est une chaîne.
//
// Le test lit les manifestes et l'arbre de routes GÉNÉRÉ (`routeTree.gen.ts`),
// donc il suit `pnpm router:generate` sans qu'on ait à le tenir à jour.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const modulesDir = __dirname
const routeTree = readFileSync(
	join(modulesDir, '..', 'routeTree.gen.ts'),
	'utf-8',
)

/** Une route sans sa barre finale : `/cash/terminal/` et `/cash/terminal` sont
 *  le même écran, et les menus écrivent l'un ou l'autre. */
const normaliser = (chemin: string) => chemin.replace(/\/+$/, '') || '/'

const routesConnues = new Set(
	[...routeTree.matchAll(/path: '([^']+)'/g)].map((m) => normaliser(m[1])),
)

const manifestes = readdirSync(modulesDir, { withFileTypes: true })
	.filter((e) => e.isDirectory())
	.map((e) => join(modulesDir, e.name, 'index.ts'))
	.filter((chemin) => {
		try {
			readFileSync(chemin)
			return true
		} catch {
			return false
		}
	})

/** Les `to:` des menus, la `route:` principale et les `aliases:`. */
function liensDe(source: string): string[] {
	const liens = [...source.matchAll(/\bto: '([^']+)'/g)].map((m) => m[1])
	liens.push(...[...source.matchAll(/\broute: '([^']+)'/g)].map((m) => m[1]))
	const aliases = source.match(/aliases: \[([^\]]*)\]/)
	if (aliases) {
		liens.push(...[...aliases[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
	}
	return liens.filter((lien) => lien.startsWith('/'))
}

// Deux liens morts ANTÉRIEURS, trouvés par ce test le 18 août 2026 et laissés
// tels quels : ils appartiennent à PocketStick, pas à la migration du
// catalogue, et les corriger « en passant » reviendrait à décider à la place du
// propriétaire si ces écrans doivent exister ou disparaître du menu.
// La liste est vérifiée : dès qu'une de ces routes existe, le test exige qu'on
// retire la ligne — une exception ne survit pas à sa raison d'être.
const EXCEPTIONS_CONNUES = ['/stick/templates', '/stick/generation']

describe('les menus ne pointent que vers des routes existantes', () => {
	it('les exceptions connues sont encore des exceptions', () => {
		for (const lien of EXCEPTIONS_CONNUES) {
			expect(routesConnues.has(normaliser(lien)), lien).toBe(false)
		}
	})

	it('trouve bien les manifestes et les routes', () => {
		// Sans cette garde, un chemin cassé rendrait le test vert par vacuité.
		expect(manifestes.length).toBeGreaterThan(5)
		expect(routesConnues.size).toBeGreaterThan(10)
	})

	for (const chemin of manifestes) {
		const nom = chemin.split(/[\\/]/).slice(-2).join('/')
		it(`${nom} — tous ses liens résolvent`, () => {
			const morts = liensDe(readFileSync(chemin, 'utf-8'))
				.filter((lien) => !routesConnues.has(normaliser(lien)))
				.filter((lien) => !EXCEPTIONS_CONNUES.includes(normaliser(lien)))
			expect(morts).toEqual([])
		})
	}
})
