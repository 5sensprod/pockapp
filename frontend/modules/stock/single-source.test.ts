// frontend/modules/stock/single-source.test.ts
//
// Gardien de l'étape 3 : « une seule provenance par fichier ».
// Cette règle n'a pas d'autre gardien — elle ne se voit ni au compilateur, qui
// accepte parfaitement deux bases dans un même composant, ni à l'écran, où un
// filtre PocketBase posé sur des produits AppPos rend zéro ligne SANS erreur.
// D'où un test qui lit les fichiers eux-mêmes.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const racine = join(__dirname, '..', '..')
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf-8')

describe("l'écran catalogue AppPos ne mêle plus les deux bases", () => {
	it("ProductTable n'importe aucune requête PocketBase", () => {
		const source = lire('modules/stock/components/ProductTable.tsx')
		expect(source).not.toMatch(/from '@\/lib\/queries\//)
	})

	it("ProductTable n'écrit pas — ni édition, ni suppression", () => {
		const source = lire('modules/stock/components/ProductTable.tsx')
		// L'édition d'un produit passe par `/stock/produits` et PocketBase.
		// On regarde les IMPORTS : les commentaires du fichier, eux, ont le droit
		// de nommer ce qui en a été retiré et pourquoi.
		const imports = (source.match(/^import .*$/gm) ?? []).join(' ')
		expect(imports).not.toMatch(/useDeleteProduct|from '\.\/ProductDialog'/)
	})

	it('useStockModule ne lit le catalogue que depuis AppPos', () => {
		const source = lire('modules/stock/useStockModule.ts')
		expect(source).not.toMatch(/from '@\/lib\/queries\//)
		// `pocketbase-types.ts` a servi à typer des données AppPos : c'est ce
		// mensonge de type qui a laissé les deux bases se confondre.
		expect(source).not.toMatch(/from '@\/lib\/pocketbase-types'/)
	})
})

describe("il n'y a plus de routeur de base non typé", () => {
	it('useUpdateProductUniversal a disparu du dépôt', () => {
		const source = lire('lib/queries/products.ts')
		expect(source).not.toMatch(/export function useUpdateProductUniversal/)
	})

	it("products.ts n'écrit plus nulle part", () => {
		const source = lire('lib/queries/products.ts')
		expect(source).not.toMatch(/\.create<|\.update<|\.delete\(/)
	})

	it("aucun fichier ne choisit sa base sur la chaîne 'apppos_products'", () => {
		// Seul le transformer a le droit de POSER ce marqueur ; personne ne doit
		// s'en servir pour décider où écrire.
		const source = lire('lib/apppos/apppos-transformers.ts')
		expect(source).toContain("collectionId: 'apppos_products'")
	})
})
