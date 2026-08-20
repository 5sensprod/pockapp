// frontend/modules/site/lib/image-checksum-store.test.ts
//
// `pnpm test`
//
// Ce qui est gardé ici : le pari sur lequel repose tout le cache — **la liste
// ordonnée des noms locaux suffit à savoir si les octets ont changé**. Il
// tient parce que PocketBase suffixe le nom d'un jeton qui change avec le
// fichier. Si ce pari cassait, l'écran dirait « à jour » pour des images qui ne
// le sont pas, sans jamais lever : exactement la panne que le miroir existe
// pour éviter.
//
// Le stockage est injecté — aucun jsdom, aucun `localStorage` réel.

import { describe, expect, it } from 'vitest'
import {
	CLE_STOCKAGE,
	type CacheEmpreintes,
	type CleValeur,
	ecrireCache,
	empreinteConnue,
	lireCache,
	retenir,
} from './image-checksum-store'

/** Un `localStorage` de poche. `defaillant` simule le quota dépassé et le mode
 *  privé, les deux cas où un vrai navigateur lève à l'écriture. */
function stockageFactice(
	initial: Record<string, string> = {},
	defaillant = false,
): CleValeur & { contenu: Record<string, string> } {
	const contenu = { ...initial }
	return {
		contenu,
		getItem: (cle) => {
			if (defaillant) throw new Error('accès refusé')
			return cle in contenu ? contenu[cle] : null
		},
		setItem: (cle, valeur) => {
			if (defaillant) throw new Error('quota dépassé')
			contenu[cle] = valeur
		},
	}
}

describe('empreinteConnue — le pari du cache', () => {
	const cache: CacheEmpreintes = retenir(
		new Map(),
		'zXcMvjNmvWAoQJqN',
		'a_PiDxAYvQfC.jpg\nb_7RFjfnokJJ.png',
		'empreinte-1',
	)

	it('rend l’empreinte quand la liste de noms est la même', () => {
		expect(
			empreinteConnue(
				cache,
				'zXcMvjNmvWAoQJqN',
				'a_PiDxAYvQfC.jpg\nb_7RFjfnokJJ.png',
			),
		).toBe('empreinte-1')
	})

	it('rate quand une image est REMPLACÉE — le jeton du nom change', () => {
		// C'est la propriété PocketBase sur laquelle tout repose : réimporter
		// une photo donne `…_AutreJeton.jpg`. Sans elle, le cache mentirait.
		expect(
			empreinteConnue(
				cache,
				'zXcMvjNmvWAoQJqN',
				'a_AutreJeton00.jpg\nb_7RFjfnokJJ.png',
			),
		).toBeUndefined()
	})

	it('rate quand on RÉORDONNE, à noms identiques', () => {
		// Les mêmes octets dans un autre rang : le risque 2 de la conception.
		// La clé est ORDONNÉE, donc elle le voit.
		expect(
			empreinteConnue(
				cache,
				'zXcMvjNmvWAoQJqN',
				'b_7RFjfnokJJ.png\na_PiDxAYvQfC.jpg',
			),
		).toBeUndefined()
	})

	it('rate quand on RETIRE une image', () => {
		expect(
			empreinteConnue(cache, 'zXcMvjNmvWAoQJqN', 'a_PiDxAYvQfC.jpg'),
		).toBeUndefined()
	})

	it('rate pour une entité jamais mesurée', () => {
		expect(empreinteConnue(cache, 'inconnue', 'a.jpg')).toBeUndefined()
	})
})

describe('lireCache / ecrireCache', () => {
	it('fait l’aller-retour', () => {
		const stockage = stockageFactice()
		ecrireCache(stockage, retenir(new Map(), 'ABC', 'a.jpg', 'e1'))

		const relu = lireCache(stockage)
		expect(empreinteConnue(relu, 'ABC', 'a.jpg')).toBe('e1')
	})

	it('rend un cache VIDE plutôt que de lever, quoi qu’il trouve', () => {
		// Un cache illisible n'est pas une erreur : c'est un cache vide. Lever
		// ici empêcherait l'écran de s'ouvrir pour cause de recalcul à faire.
		expect(
			lireCache(stockageFactice({ [CLE_STOCKAGE]: 'pas du json' })).size,
		).toBe(0)
		expect(lireCache(stockageFactice({ [CLE_STOCKAGE]: '[1,2,3]' })).size).toBe(
			0,
		)
		expect(lireCache(stockageFactice({ [CLE_STOCKAGE]: 'null' })).size).toBe(0)
		expect(lireCache(stockageFactice({}, true)).size).toBe(0)
		expect(lireCache(null).size).toBe(0)
	})

	it('écarte les entrées incomplètes plutôt que d’en faire des empreintes vides', () => {
		// Une empreinte sans sa clé ne peut pas être invalidée : elle vaudrait
		// « à jour » pour toujours.
		const stockage = stockageFactice({
			[CLE_STOCKAGE]: JSON.stringify({
				A: { cle: 'a.jpg' },
				B: { empreinte: 'e' },
				C: { cle: 'c.jpg', empreinte: '' },
				D: { cle: 'd.jpg', empreinte: 'ok' },
			}),
		})
		const cache = lireCache(stockage)
		expect([...cache.keys()]).toEqual(['D'])
	})

	it('ne lève pas quand l’écriture échoue — perdre le cache coûte un recalcul', () => {
		// Le quota dépassé ne doit pas faire échouer un envoi qui, lui, a
		// abouti.
		expect(() =>
			ecrireCache(stockageFactice({}, true), retenir(new Map(), 'A', 'a', 'e')),
		).not.toThrow()
		expect(() => ecrireCache(null, new Map())).not.toThrow()
	})
})
