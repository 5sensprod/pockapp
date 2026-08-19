// frontend/lib/realtime/catalog-realtime.test.ts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { COLLECTIONS_SURVEILLEES, creerRegroupeur } from './catalog-realtime'

describe('le regroupement des événements', () => {
	it("n'invalide qu'une fois pour une salve", async () => {
		// Un ticket de trente lignes produit trente événements. Trente
		// invalidations coûteraient plus cher que le rechargement évité.
		const invalider = vi.fn()
		const r = creerRegroupeur(invalider, 10)

		for (let i = 0; i < 30; i++) r.signaler()

		expect(invalider).not.toHaveBeenCalled()
		await new Promise((r) => setTimeout(r, 30))
		expect(invalider).toHaveBeenCalledTimes(1)
	})

	it('ne repousse pas le délai à chaque événement', async () => {
		// Repousser ferait attendre indéfiniment pendant une salve longue — un
		// inventaire qui se déverse. L'écran ne se mettrait jamais à jour.
		const invalider = vi.fn()
		const r = creerRegroupeur(invalider, 20)

		r.signaler()
		await new Promise((r) => setTimeout(r, 15))
		r.signaler()
		await new Promise((r) => setTimeout(r, 15))

		expect(invalider).toHaveBeenCalledTimes(1)
	})

	it('repart pour la salve suivante', async () => {
		const invalider = vi.fn()
		const r = creerRegroupeur(invalider, 10)

		r.signaler()
		await new Promise((r) => setTimeout(r, 25))
		r.signaler()
		await new Promise((r) => setTimeout(r, 25))

		expect(invalider).toHaveBeenCalledTimes(2)
	})

	it("n'invalide plus après démontage", async () => {
		// Sinon un écran quitté continue de faire repartir des requêtes.
		const invalider = vi.fn()
		const r = creerRegroupeur(invalider, 10)

		r.signaler()
		r.arreter()
		await new Promise((r) => setTimeout(r, 25))

		expect(invalider).not.toHaveBeenCalled()
	})
})

describe("ce que l'invalidation recharge vraiment", () => {
	it("ne fait repartir que les requêtes montées à l'écran", async () => {
		// Le piège annoncé : invalider `catalog-products` doit recharger LA page
		// affichée, pas toutes les pages jamais visitées. C'est le comportement
		// par défaut de TanStack Query (`refetchType: 'active'`) — vérifié ici
		// plutôt que supposé, parce que tout le dimensionnement en dépend.
		const client = new QueryClient()

		const pageAffichee = vi.fn(async () => 'page 1')
		const pageQuittee = vi.fn(async () => 'page 2')

		// Montée : un observateur réel est abonné, comme le ferait un `useQuery`.
		const observer = new QueryObserver(client, {
			queryKey: ['catalog-products', 1],
			queryFn: pageAffichee,
		})
		const desabonner = observer.subscribe(() => {})
		await vi.waitFor(() => expect(pageAffichee).toHaveBeenCalledTimes(1))

		// Visitée puis quittée : en cache, sans observateur.
		await client.fetchQuery({
			queryKey: ['catalog-products', 2],
			queryFn: pageQuittee,
		})
		expect(pageQuittee).toHaveBeenCalledTimes(1)

		await client.invalidateQueries({ queryKey: ['catalog-products'] })

		// La page affichée repart...
		await vi.waitFor(() => expect(pageAffichee).toHaveBeenCalledTimes(2))
		// ...la page quittée non : elle est seulement marquée périmée.
		expect(pageQuittee).toHaveBeenCalledTimes(1)

		desabonner()
	})
})

describe('les collections surveillées', () => {
	it('couvre les quatre entités du catalogue', () => {
		// Les quatre que l'ancien canal AppPos portait : les produits pour le
		// prix et le stock, les trois autres pour les arbres.
		expect(Object.keys(COLLECTIONS_SURVEILLEES).sort()).toEqual([
			'brands',
			'categories',
			'products',
			'suppliers',
		])
	})

	it('périme exactement ce que périme une modification locale', () => {
		// La dérive redoutée : quelqu'un ajoute une clé à `invalidateCatalog`
		// pour les mutations locales et oublie le temps réel. L'écran se tient
		// alors à jour quand ON modifie, et pas quand un autre poste modifie —
		// le pire des deux mondes, parce que ça marche à l'essai.
		//
		// On lit le fichier plutôt que de l'importer : `catalog-products.ts`
		// construit un client PocketBase au chargement du module.
		const source = readFileSync(
			join(__dirname, '..', 'queries', 'catalog-products.ts'),
			'utf-8',
		)
		const corps = source.slice(
			source.indexOf('export function invalidateCatalog'),
		)
		const cles = [...corps.matchAll(/queryKey: \['([a-z-]+)'\]/g)].map(
			(m) => m[1],
		)

		expect(cles.length).toBeGreaterThan(0)
		expect(COLLECTIONS_SURVEILLEES.products.map(([c]) => c).sort()).toEqual(
			[...new Set(cles)].sort(),
		)
	})
})
