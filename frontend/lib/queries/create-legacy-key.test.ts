// frontend/lib/queries/create-legacy-key.test.ts
//
// `pnpm test`
//
// GARDIEN DU RISQUE 4 de `16-conception-images.md` : **les trois `create`
// posent une clé stable**.
//
// `legacy-key.test.ts` couvre le générateur, pas ses appelants. Or c'est
// l'appelant qui compte : l'arborescence distante des images est nommée
// `<entité>/<legacy_id>/<rang>.<ext>` (§4.1). Une régression qui laisserait
// tomber `legacy_id` ne lèverait aucune erreur — PocketBase accepte la chaîne
// vide — et produirait des dossiers distants nommés par du vide, plus une
// entité invisible à l'export et absente des relations des autres.
//
// Le test appelle les hooks de production. `useMutation`, `useQueryClient` et
// `usePocketBase` sont remplacés par des fonctions simples : les hooks n'en
// sont plus, et `mutationFn` s'exécute hors React. C'est bien le code livré qui
// est mesuré, pas une copie.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const creations: Array<{ collection: string; data: any }> = []

vi.mock('@tanstack/react-query', () => ({
	useMutation: (options: any) => options,
	useQuery: () => ({ data: undefined }),
	useQueryClient: () => ({ invalidateQueries: () => {} }),
}))

vi.mock('@/lib/use-pocketbase', () => ({
	usePocketBase: () => ({
		collection: (collection: string) => ({
			create: async (data: any) => {
				creations.push({ collection, data })
				return { id: 'rec_1', ...lire(data) }
			},
		}),
	}),
}))

/** Relit un payload, qu'il soit objet simple ou `FormData` (image choisie). */
function lire(data: any): Record<string, unknown> {
	if (typeof FormData !== 'undefined' && data instanceof FormData) {
		return Object.fromEntries(data.entries())
	}
	return data
}

import { useCreateBrand } from './brands'
import { useCreateCatalogProduct } from './catalog-products'
import { useCreateCategory } from './categories'
import { POCKETAPP_KEY_PREFIX } from './legacy-key'

const fichier = () =>
	new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })

const cas = [
	{ nom: 'une marque', collection: 'brands', hook: useCreateBrand },
	{ nom: 'une catégorie', collection: 'categories', hook: useCreateCategory },
	{
		nom: 'un produit',
		collection: 'products',
		hook: useCreateCatalogProduct,
	},
]

beforeEach(() => {
	creations.length = 0
})

describe.each(cas)('créer $nom', ({ collection, hook }) => {
	it('pose une clé stable, sans que l’écran ait à la fournir', async () => {
		await (hook() as any).mutationFn({ name: 'Fender' })

		expect(creations).toHaveLength(1)
		expect(creations[0].collection).toBe(collection)
		const cle = String(lire(creations[0].data).legacy_id ?? '')
		expect(cle).toMatch(/^pa_[a-z0-9]{16}$/)
		expect(cle.startsWith(POCKETAPP_KEY_PREFIX)).toBe(true)
	})

	it('pose aussi la clé quand le corps part en FormData', async () => {
		// Une fiche créée avec son image part en `FormData` : un `legacy_id`
		// ajouté après coup à un objet déjà converti serait perdu en silence.
		await (hook() as any).mutationFn({ name: 'Fender', image: fichier() })

		const payload = creations[0].data
		expect(payload).toBeInstanceOf(FormData)
		expect(String(lire(payload).legacy_id)).toMatch(/^pa_[a-z0-9]{16}$/)
	})

	it('ne laisse pas l’écran imposer une clé vide', async () => {
		// `{ legacy_id: newLegacyKey(), ...data }` : une clé vide venue du
		// formulaire écraserait celle de la couche. Le cas est le seul par lequel
		// un dossier distant pourrait être nommé par du vide.
		await (hook() as any).mutationFn({ name: 'Fender', legacy_id: '' })

		expect(String(lire(creations[0].data).legacy_id ?? '')).not.toBe('')
	})

	it('donne une clé différente à chaque entité', async () => {
		await (hook() as any).mutationFn({ name: 'Fender' })
		await (hook() as any).mutationFn({ name: 'Gibson' })

		const cles = creations.map((c) => lire(c.data).legacy_id)
		expect(new Set(cles).size).toBe(2)
	})
})
