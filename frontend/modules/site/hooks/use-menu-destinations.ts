// frontend/modules/site/hooks/use-menu-destinations.ts
// ═══════════════════════════════════════════════════════════════════════════
// DESTINATIONS PROPOSÉES PAR L'ÉDITEUR  (ticket 4)
// ═══════════════════════════════════════════════════════════════════════════
// Les catégories, marques et produits proposés dans l'éditeur viennent
// d'AppPos, en lecture seule, et `ref_id` stocke l'identifiant **WooCommerce**
// de la cible. Arbitrage et raisons : docs/DECISIONS.md, bloc « Origine des
// destinations du menu ».
//
// Aucun nouveau point d'entrée réseau : AppPos est le point 2 de CLAUDE.md et
// le client existe déjà (frontend/lib/apppos/).
//
// ─── Pourquoi ne pas réutiliser useAppPosCategories / useAppPosBrands ───────
// Parce qu'ils passent par `appPosTransformers`, qui moule les objets AppPos
// dans la forme PocketBase — laquelle n'a pas de champ `woo_id`. Le champ est
// donc perdu : transformAppPosCategory (apppos-transformers.ts:138) et
// transformAppPosBrand (:167) ne le recopient pas. Or c'est précisément la
// donnée dont ce ticket a besoin.
//
// On lit donc `appPosApi` directement, qui rend les objets AppPos bruts. On ne
// touche pas aux transformers : le module `stock` en dépend, et leur ajouter
// un champ hors forme PocketBase créerait une ambiguïté ailleurs pour un
// besoin qui n'existe qu'ici.
// ═══════════════════════════════════════════════════════════════════════════

import { appPosApi } from '@/lib/apppos'
import type { SiteMenuRefType } from '@/lib/queries/site-menu'
import { useQuery } from '@tanstack/react-query'

/**
 * Une destination proposable, indépendante du type.
 *
 * `refId` est l'identifiant WooCommerce en chaîne — c'est lui qui part dans
 * `ref_id`, et que le ticket 6 résoudra en URL. Il vaut `null` quand la cible
 * n'a pas encore été synchronisée vers WooCommerce : elle est alors listée
 * mais non sélectionnable, faute de quoi on stockerait une destination que la
 * publication ne saurait pas résoudre.
 */
export interface MenuDestination {
	/** Identifiant AppPos, sert de clé de liste et de rien d'autre. */
	sourceId: string
	label: string
	refId: string | null
	/** Chemin de la catégorie, pour distinguer deux homonymes. */
	hint?: string
}

const CACHE = {
	staleTime: 60 * 60 * 1000, // 1h — un catalogue ne bouge pas pendant qu'on édite un menu
	gcTime: 6 * 60 * 60 * 1000,
	// Une lecture réussie n'est pas refaite pendant une heure. Une lecture
	// **échouée**, si : sans ça, un AppPos éteint au premier affichage laissait
	// des identifiants bruts jusqu'au redémarrage complet de l'application,
	// puisque revenir sur la page ne relançait rien.
	refetchOnMount: (query: { state: { status: string } }) =>
		query.state.status === 'error',
	refetchOnWindowFocus: false,
	refetchOnReconnect: false,
	retry: 1,
} as const

const toRefId = (wooId?: number | null): string | null =>
	wooId === null || wooId === undefined ? null : String(wooId)

function useCategoryDestinations(enabled: boolean) {
	return useQuery({
		queryKey: ['site', 'destinations', 'category'],
		queryFn: async (): Promise<MenuDestination[]> => {
			const categories = await appPosApi.getCategories()
			return categories
				.map((category) => ({
					sourceId: category._id,
					label: category.name,
					refId: toRefId(category.woo_id),
					hint: category.slug,
				}))
				.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
		},
		enabled,
		...CACHE,
	})
}

function useBrandDestinations(enabled: boolean) {
	return useQuery({
		queryKey: ['site', 'destinations', 'brand'],
		queryFn: async (): Promise<MenuDestination[]> => {
			const brands = await appPosApi.getBrands()
			return brands
				.map((brand) => ({
					sourceId: brand._id,
					label: brand.name,
					refId: toRefId(brand.woo_id),
					hint: brand.slug,
				}))
				.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
		},
		enabled,
		...CACHE,
	})
}

/**
 * `AppPosProduct` ne **déclare** pas `woo_id` (apppos-types.ts:56-118), là où
 * `AppPosCategory` et `AppPosBrand` le font (:128 et :155). Le type est
 * incomplet, pas la donnée : côté AppPos, `wooSyncController.js` écrit
 * `woo_id` sur le produit à chaque synchronisation (lignes 357 et 513) et
 * filtre sur son absence (ligne 182). Un produit publié en a donc un.
 *
 * On lit le champ défensivement plutôt que d'élargir le type d'AppPos, qu'on
 * ne modifie pas. Un produit sans `woo_id` — jamais synchronisé — est listé
 * mais non sélectionnable. Pas de repli sur `_id` : ce serait un identifiant
 * AppPos rangé dans un champ qui doit contenir un identifiant WooCommerce, et
 * la publication produirait une URL fausse sans rien signaler.
 */
function useProductDestinations(enabled: boolean) {
	return useQuery({
		queryKey: ['site', 'destinations', 'product'],
		queryFn: async (): Promise<MenuDestination[]> => {
			const products = await appPosApi.getProducts()
			return products
				.map((product) => {
					const wooId = (product as { woo_id?: number | null }).woo_id
					return {
						sourceId: product._id,
						label: product.name,
						refId: toRefId(wooId),
						hint: product.sku,
					}
				})
				.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
		},
		enabled,
		...CACHE,
	})
}

/**
 * Destinations proposables pour un type de lien donné.
 *
 * `page` n'a aucune source : les pages du site vivent dans WordPress, que
 * PocketApp n'interroge pas. L'identifiant se saisit à la main, comme
 * l'autorise le contrat (« identifiant ou slug », §3).
 */
export function useMenuDestinations(
	linkType: SiteMenuRefType | null,
	/** Session AppPos ouverte. Interroger AppPos sans jeton ne rend qu'un 401,
	 *  et c'est cet échec-là qui se mettait en cache. */
	ready = true,
) {
	const categories = useCategoryDestinations(ready && linkType === 'category')
	const brands = useBrandDestinations(ready && linkType === 'brand')
	const products = useProductDestinations(ready && linkType === 'product')

	switch (linkType) {
		case 'category':
			return { ...categories, supported: true as const }
		case 'brand':
			return { ...brands, supported: true as const }
		case 'product':
			return { ...products, supported: true as const }
		default:
			// `page`, `none`, `manual` : rien à proposer.
			return {
				data: undefined,
				isLoading: false,
				isError: false,
				error: null,
				supported: false as const,
			}
	}
}

/**
 * Résout `ref_id` → nom de la cible, pour l'affichage de la liste.
 *
 * Une entrée stocke un identifiant WooCommerce ; l'opérateur, lui, a besoin de
 * lire « Guitares » et non « 1598 ». Le nom n'est **pas** stocké dans
 * `site_menu` : ce serait une copie qui se périmerait au premier renommage
 * côté AppPos, et une seconde source de vérité sur la même chose.
 *
 * `usedTypes` limite les lectures aux types réellement présents dans le menu.
 * Sans ça, ouvrir la page chargerait le catalogue produits entier — quelques
 * milliers de lignes — pour peut-être zéro entrée de ce type.
 *
 * En cours de chargement ou en cas d'échec d'AppPos, `labelFor` rend `null` :
 * l'appelant retombe alors sur l'identifiant, qui reste juste et lisible.
 */
export function useDestinationIndex(
	usedTypes: Set<SiteMenuRefType>,
	/** Session AppPos ouverte. Voir `useMenuDestinations`. */
	ready = true,
) {
	const categories = useCategoryDestinations(ready && usedTypes.has('category'))
	const brands = useBrandDestinations(ready && usedTypes.has('brand'))
	const products = useProductDestinations(ready && usedTypes.has('product'))

	const byType: Record<SiteMenuRefType, MenuDestination[] | undefined> = {
		category: categories.data,
		brand: brands.data,
		product: products.data,
		// Les pages ne sont lues nulle part : PocketApp n'interroge pas
		// WordPress. Leur `ref_id` s'affiche tel quel, tel qu'il a été saisi.
		page: undefined,
	}

	const labelFor = (type: SiteMenuRefType, refId: string): string | null =>
		byType[type]?.find((d) => d.refId === refId)?.label ?? null

	return {
		labelFor,
		isLoading: categories.isLoading || brands.isLoading || products.isLoading,
		isError: categories.isError || brands.isError || products.isError,
	}
}
