// frontend/lib/sync/stock-sync.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// LE STOCK QUI BOUGE HORS DE LA FICHE — cas vérifiés
// ═══════════════════════════════════════════════════════════════════════════
// `pnpm test`
//
// Ce qui est gardé ici, c'est la SÉLECTION : qui a une page à rafraîchir. Le
// reste — le toast qui attend en caisse, l'envoi sans question à l'inventaire —
// est de la présentation, et se règle à l'écran.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it, vi } from 'vitest'

import { fichesEnLigne } from './stock-sync-selection'

const fiche = (over: Record<string, unknown> = {}) => ({
	id: 'pb-1',
	legacy_id: 'nedb-1',
	name: 'Ukulélé',
	status: 'published',
	...over,
})

/** Un PocketBase de façade qui rend ce qu'on lui donne, et retient le filtre
 *  qu'on lui a passé — c'est lui qu'on veut vérifier. */
function faussePb(fiches: ReturnType<typeof fiche>[]) {
	// L'argument est typé : c'est le filtre qu'on inspecte plus bas.
	const getFullList = vi.fn(async (_options: object) => fiches)
	return {
		pb: { collection: () => ({ getFullList }) },
		getFullList,
	}
}

describe('fichesEnLigne', () => {
	it('retient une fiche publiée que le site connaît', async () => {
		const { pb } = faussePb([fiche()])
		const retenues = await fichesEnLigne(pb, { 'nedb-1': 'e1' }, [
			{ productId: 'pb-1' },
		])
		expect(retenues.map((f) => f.id)).toEqual(['pb-1'])
	})

	it('écarte une fiche que la base SQL du site ne connaît pas', async () => {
		// Jamais exportée : il n'y a aucune page à rafraîchir, et le serveur
		// refuserait le lot en 409 (mesuré le 20 août 2026 sur les catégories).
		const { pb } = faussePb([fiche()])
		expect(await fichesEnLigne(pb, {}, [{ productId: 'pb-1' }])).toEqual([])
	})

	it('écarte un brouillon', async () => {
		// `catalog.php` ne sert que `published` : renvoyer son stock n'affiche
		// rien de plus et occupe le mutualisé pour rien.
		const { pb } = faussePb([fiche({ status: 'draft' })])
		expect(
			await fichesEnLigne(pb, { 'nedb-1': 'e1' }, [{ productId: 'pb-1' }]),
		).toEqual([])
	})

	it('SE TAIT quand l’inventaire du site est indisponible', async () => {
		// ⚠️ Ne pas savoir n'est pas savoir que non. Sans cette règle, une clé
		// absente ou un site injoignable ferait proposer une synchronisation pour
		// des fiches dont on ignore tout — ou pire, prétendre l'avoir faite.
		const { pb, getFullList } = faussePb([fiche()])
		expect(await fichesEnLigne(pb, undefined, [{ productId: 'pb-1' }])).toEqual(
			[],
		)
		expect(getFullList).not.toHaveBeenCalled()
	})

	it('ne demande RIEN sans produit', async () => {
		// Une vente de lignes libres — sans fiche — ne doit pas déclencher un
		// appel au comptoir, au moment précis où le client paie.
		const { pb, getFullList } = faussePb([])
		expect(await fichesEnLigne(pb, { 'nedb-1': 'e1' }, [])).toEqual([])
		expect(getFullList).not.toHaveBeenCalled()
	})

	it('dédoublonne les identifiants du panier', async () => {
		// Le même produit scanné trois fois, c'est une ligne de stock et une
		// seule condition de filtre.
		const { pb, getFullList } = faussePb([fiche()])
		await fichesEnLigne(pb, { 'nedb-1': 'e1' }, [
			{ productId: 'pb-1' },
			{ productId: 'pb-1' },
			{ productId: 'pb-2' },
		])
		expect(getFullList.mock.calls[0][0]).toMatchObject({
			filter: 'id="pb-1" || id="pb-2"',
		})
	})
})
