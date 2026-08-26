// frontend/modules/site/hooks/use-catalog-sync.ts
// ═══════════════════════════════════════════════════════════════════════════
// EXPORT DU CATALOGUE — inventaire et envoi
// ═══════════════════════════════════════════════════════════════════════════
// Parle à la couche Go (backend/routes/site_catalog_routes.go), qui ajoute la
// clé X-API-Key et relaie vers server/api/products-sync.php.
//
// **La clé ne passe pas par ici**, comme pour la publication du menu : ce hook
// ne la lit pas et aucune route ne la rend lisible.
// ═══════════════════════════════════════════════════════════════════════════

import type {
	CatalogBrand,
	CatalogCategory,
	CatalogProduct,
} from '@/lib/queries/site-catalog'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import {
	type ChecksumIndex,
	type ExportBrand,
	type ExportCategory,
	type ExportProduct,
	buildExportBatches,
	sealed,
	toExportBrand,
	toExportCategory,
	toExportProduct,
} from '../lib/catalog-export'

// ---------------------------------------------------------------------------
// INVENTAIRE  (§3 du contrat)
// ---------------------------------------------------------------------------

export type CatalogInventory = {
	ok: true
	contractVersion: number
	counts: { products: number; categories: number; brands: number }
	products: ChecksumIndex
	categories: ChecksumIndex
	brands: ChecksumIndex
	readAt: string
}

async function callRelay<T>(
	token: string,
	path: string,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(path, {
		...init,
		// Le relais Go recrée la réponse et ne retransmet pas le `no-store` du
		// PHP. L'inventaire doit toujours refléter le dernier lot écrit.
		cache: 'no-store',
		headers: {
			'Content-Type': 'application/json',
			Authorization: token,
			...(init?.headers ?? {}),
		},
	})

	const raw = await response.text()
	let payload: unknown
	try {
		payload = JSON.parse(raw)
	} catch {
		throw new Error(raw?.slice(0, 300) || `Erreur ${response.status}`)
	}

	if (!response.ok) {
		// La couche Go joint `status` et `body` quand le serveur distant répond
		// autre chose que du JSON — page de la couche anti-bot, erreur Apache.
		// C'est le cas indiagnosticable sans voir le corps, donc on le montre.
		const detail = payload as { error?: string; status?: number; body?: string }
		const suffix = detail?.body
			? ` — le serveur a répondu ${detail.status ?? '?'} : ${detail.body.slice(0, 200)}`
			: ''
		throw new Error((detail?.error ?? `Erreur ${response.status}`) + suffix)
	}

	return payload as T
}

/**
 * Ce que la base SQL contient déjà. **Ne s'exécute pas tout seul** : tant que
 * l'URL et la clé ne sont pas réglées, la route répond 412, et interroger le
 * serveur à chaque ouverture de l'écran pour rien n'a pas de sens. D'où
 * `enabled`, piloté par l'appelant.
 */
export function useCatalogInventory(enabled: boolean) {
	const pb = usePocketBase() as { authStore: { token: string } }

	return useQuery<CatalogInventory>({
		queryKey: ['site-catalog', 'inventory'],
		enabled,
		retry: false,
		staleTime: 30_000,
		queryFn: async () => {
			const token = pb.authStore.token
			if (!token) throw new Error('Non authentifié')
			return await callRelay<CatalogInventory>(
				token,
				'/api/site/catalog/inventory',
			)
		},
	})
}

// ---------------------------------------------------------------------------
// EXPORT  (§4 et §5 du contrat)
// ---------------------------------------------------------------------------

export type ExportRejection = {
	kind: string
	legacy_id: string
	reason: string
}

export type ExportOutcome = {
	batches: number
	written: { products: number; categories: number; brands: number }
	rejected: ExportRejection[]
}

type BatchResponse = {
	ok: boolean
	written: { products: number; categories: number; brands: number }
	rejected?: ExportRejection[]
}

export type ExportInput = {
	products: CatalogProduct[]
	categories: CatalogCategory[]
	brands: CatalogBrand[]
}

/**
 * Compose, scelle et envoie. Les lots partent **en série** : le mutualisé n'a
 * aucune raison d'encaisser quinze requêtes concurrentes, et une exécution
 * séquentielle rend la progression lisible et l'échec localisable.
 *
 * Un lot qui échoue interrompt la suite et laisse les précédents écrits —
 * assumé au contrat (§6) : l'opération est idempotente, on rejoue.
 */
export function useExportCatalog() {
	const pb = usePocketBase() as { authStore: { token: string } }
	const queryClient = useQueryClient()
	const [progress, setProgress] = useState<{ done: number; total: number }>({
		done: 0,
		total: 0,
	})

	const mutation = useMutation<ExportOutcome, Error, ExportInput>({
		mutationFn: async ({ products, categories, brands }) => {
			const token = pb.authStore.token
			if (!token) throw new Error('Non authentifié')

			// Les relations partent en `legacy_id`, jamais en identifiant
			// PocketBase : c'est toute la raison d'être de ces deux index.
			const categoryLegacyById = new Map(
				categories.map((c) => [c.id, c.legacy_id]),
			)
			const brandLegacyById = new Map(brands.map((b) => [b.id, b.legacy_id]))

			const exportProducts: ExportProduct[] = await Promise.all(
				products.map((p) =>
					sealed(
						toExportProduct(
							p,
							(p.categories ?? [])
								.map((id) => categoryLegacyById.get(id))
								.filter((id): id is string => Boolean(id)),
							(p.brand && brandLegacyById.get(p.brand)) || null,
						),
					),
				),
			)

			const exportCategories: ExportCategory[] = await Promise.all(
				categories.map((c) =>
					sealed(
						toExportCategory(
							c,
							(c.parent && categoryLegacyById.get(c.parent)) || null,
						),
					),
				),
			)

			const exportBrands: ExportBrand[] = await Promise.all(
				brands.map((b) => sealed(toExportBrand(b))),
			)

			const batches = buildExportBatches(
				exportProducts,
				exportCategories,
				exportBrands,
				new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
			)

			setProgress({ done: 0, total: batches.length })

			const outcome: ExportOutcome = {
				batches: batches.length,
				written: { products: 0, categories: 0, brands: 0 },
				rejected: [],
			}

			for (const [index, batch] of batches.entries()) {
				const result = await callRelay<BatchResponse>(
					token,
					'/api/site/catalog/export',
					{ method: 'POST', body: JSON.stringify(batch) },
				)

				outcome.written.products += result.written?.products ?? 0
				outcome.written.categories += result.written?.categories ?? 0
				outcome.written.brands += result.written?.brands ?? 0
				if (result.rejected?.length) {
					outcome.rejected.push(...result.rejected)
				}

				setProgress({ done: index + 1, total: batches.length })
			}

			return outcome
		},
		onSuccess: () => {
			// L'inventaire vient de changer : les pastilles doivent suivre.
			queryClient.invalidateQueries({
				queryKey: ['site-catalog', 'inventory'],
			})
		},
	})

	return { ...mutation, progress }
}

// ---------------------------------------------------------------------------
// EMPREINTES LOCALES
// ---------------------------------------------------------------------------

/**
 * Calcule l'empreinte de chaque produit affiché, pour la comparer à
 * l'inventaire. Asynchrone — `crypto.subtle` l'est —, d'où le passage par un
 * état plutôt que par un `useMemo`.
 *
 * Le drapeau d'annulation évite qu'un calcul lancé sur une liste devenue
 * obsolète n'écrase le résultat du suivant.
 */
export function useProductChecksums(
	products: CatalogProduct[],
	categories: CatalogCategory[],
	brands: CatalogBrand[],
	/**
	 * Sans inventaire distant, l'empreinte ne répond à aucune question : rien
	 * n'existe côté site à quoi la comparer. Calculer 2562 SHA-1 pour les jeter
	 * coûte une seconde d'affichage à chaque ouverture de l'écran — d'où ce
	 * drapeau, piloté par la présence de l'inventaire.
	 */
	enabled = true,
): Map<string, string> {
	const [index, setIndex] = useState<Map<string, string>>(new Map())

	const compute = useCallback(async () => {
		if (!enabled) return new Map<string, string>()

		const categoryLegacyById = new Map(
			categories.map((c) => [c.id, c.legacy_id]),
		)
		const brandLegacyById = new Map(brands.map((b) => [b.id, b.legacy_id]))

		const pairs = await Promise.all(
			products.map(async (p) => {
				const sealedProduct = await sealed(
					toExportProduct(
						p,
						(p.categories ?? [])
							.map((id) => categoryLegacyById.get(id))
							.filter((id): id is string => Boolean(id)),
						(p.brand && brandLegacyById.get(p.brand)) || null,
					),
				)
				return [p.legacy_id, sealedProduct.checksum] as const
			}),
		)

		return new Map(pairs)
	}, [products, categories, brands, enabled])

	useEffect(() => {
		let cancelled = false
		compute()
			.catch((cause) => {
				// `crypto.subtle` n'existe pas hors origine sûre. Le cas ne devrait
				// pas se produire sous Wails ni sur localhost, mais un échec ici ne
				// doit jamais empêcher la page de s'afficher : sans empreintes, on
				// perd la distinction « modifié », pas la vue.
				console.warn('[catalogue] empreintes non calculées :', cause)
				return new Map<string, string>()
			})
			.then((result) => {
				if (cancelled) return
				// Ne remplacer l'état que si le contenu a VRAIMENT changé. Sans cette
				// garde, un appelant qui passe `data ?? []` recrée un tableau à chaque
				// rendu, le calcul se relance, `setIndex` provoque un rendu, et la page
				// boucle sans jamais s'afficher. La garde côté appelant reste la bonne
				// (des tableaux stables), celle-ci empêche la boucle de se reformer.
				setIndex((previous) =>
					sameIndex(previous, result) ? previous : result,
				)
			})
		return () => {
			cancelled = true
		}
	}, [compute])

	return index
}

function sameIndex(a: Map<string, string>, b: Map<string, string>): boolean {
	if (a.size !== b.size) return false
	for (const [key, value] of a) {
		if (b.get(key) !== value) return false
	}
	return true
}

/**
 * Les empreintes des CATÉGORIES et des MARQUES, pour qu'elles montrent leur
 * état comme les produits.
 *
 * Sans cela, modifier la description d'une catégorie ne se voyait nulle part :
 * l'écran affichait « à jour » — c'est-à-dire rien — alors que le site ne
 * l'avait pas reçue. L'inventaire renvoyait pourtant déjà leurs empreintes
 * (§3 du contrat) ; la matière était là, l'écran ne la regardait pas.
 * Décision du 13 août 2026 : l'export reste explicite, mais l'état doit se voir
 * pour les trois entités.
 *
 * Une seule passe pour les deux : elles se calculent avec les mêmes index, et
 * deux hooks jumeaux auraient doublé les occasions de diverger.
 */
export function useRelationChecksums(
	categories: CatalogCategory[],
	brands: CatalogBrand[],
	enabled = true,
): { categories: Map<string, string>; brands: Map<string, string> } {
	const [index, setIndex] = useState<{
		categories: Map<string, string>
		brands: Map<string, string>
	}>({ categories: new Map(), brands: new Map() })

	const compute = useCallback(async () => {
		if (!enabled) {
			return {
				categories: new Map<string, string>(),
				brands: new Map<string, string>(),
			}
		}

		const legacyById = new Map(categories.map((c) => [c.id, c.legacy_id]))

		const categoryPairs = await Promise.all(
			categories.map(async (category) => {
				const sealedCategory = await sealed(
					toExportCategory(
						category,
						(category.parent && legacyById.get(category.parent)) || null,
					),
				)
				return [category.legacy_id, sealedCategory.checksum] as const
			}),
		)

		const brandPairs = await Promise.all(
			brands.map(async (brand) => {
				const sealedBrand = await sealed(toExportBrand(brand))
				return [brand.legacy_id, sealedBrand.checksum] as const
			}),
		)

		return {
			categories: new Map(categoryPairs),
			brands: new Map(brandPairs),
		}
	}, [categories, brands, enabled])

	useEffect(() => {
		let cancelled = false
		compute()
			.catch((cause) => {
				console.warn('[catalogue] empreintes relations non calculées :', cause)
				return {
					categories: new Map<string, string>(),
					brands: new Map<string, string>(),
				}
			})
			.then((result) => {
				if (cancelled) return
				// Même garde que pour les produits : ne remplacer l'état que si le
				// contenu a vraiment changé, sinon la page reboucle sans s'afficher.
				setIndex((previous) =>
					sameIndex(previous.categories, result.categories) &&
					sameIndex(previous.brands, result.brands)
						? previous
						: result,
				)
			})
		return () => {
			cancelled = true
		}
	}, [compute])

	return index
}
