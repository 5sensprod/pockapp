// frontend/modules/site/hooks/use-menu-destinations.ts
// ═══════════════════════════════════════════════════════════════════════════
// DESTINATIONS PROPOSÉES PAR L'ÉDITEUR DE MENU
// ═══════════════════════════════════════════════════════════════════════════
// Les catégories, marques et produits proposés viennent du **catalogue
// PocketBase**, et `ref_id` stocke le `legacy_id` de la cible.
//
// ─── Ce qui a changé le 11 août 2026, et pourquoi ──────────────────────────
// Jusqu'ici cette liste venait d'AppPos et `ref_id` portait un identifiant
// **WooCommerce**. Deux raisons d'en sortir :
//
//   1. **Les slugs manquaient.** L'URL se lisait dans AppPos, où 433 catégories
//      sur 463 n'ont pas de slug : elles étaient listées mais NON
//      SÉLECTIONNABLES, et une entrée déjà posée refusait de se publier avec
//      « aucune URL connue ». C'est le blocage constaté à l'usage.
//   2. **WooCommerce disparaît.** Un `ref_id` qui est un identifiant Woo
//      désigne une cible dans un système qu'on est en train de retirer.
//
// Le catalogue PocketBase, lui, porte un slug pour chaque entité — la
// normalisation en produit un, quitte à le désambiguïser — et ces slugs sont
// ceux que le site sert désormais (`/categorie-produit/<slug>`).
//
// ─── Conséquence sur les entrées de menu DÉJÀ ENREGISTRÉES ────────────────
// Leur `ref_id` est un identifiant WooCommerce ; il ne correspond à aucun
// `legacy_id`. Elles deviennent donc non résolues, et la publication les
// signale nommément au lieu de les publier de travers. `looksLikeWooId`
// ci-dessous permet de le dire dans ces termes plutôt que de laisser croire à
// une cible supprimée.
//
// ─── Ce que ce fichier n'appelle plus ──────────────────────────────────────
// **AppPos.** L'édition du menu ne dépend plus d'une session AppPos ouverte.
// Le paramètre `ready` est conservé pour ne pas casser les appelants, mais il
// n'est plus consulté.
// ═══════════════════════════════════════════════════════════════════════════

import {
	useCatalogBrands,
	useCatalogCategories,
	usePublishedProducts,
} from '@/lib/queries/site-catalog'
import type { SiteMenuRefType } from '@/lib/queries/site-menu'
// Réexporté depuis la couche pure : voir la note à sa définition.
export { looksLikeWooId } from '../lib/publish-menu'
import { useMemo } from 'react'

/**
 * Une destination proposable, indépendante du type.
 *
 * `refId` est le `legacy_id` de la cible — c'est lui qui part dans `ref_id`, et
 * que la publication résout en URL. Il ne vaut `null` que si l'entité n'en
 * porte pas, ce qui ne devrait pas arriver : le chargeur l'écrit pour tout le
 * monde.
 */
export interface MenuDestination {
	/** Identifiant PocketBase, sert de clé de liste et de rien d'autre.
	 *  **Jamais stocké** : il est régénéré à chaque rechargement par purge. */
	sourceId: string
	label: string
	refId: string | null
	/** Slug de la cible, pour distinguer deux homonymes. */
	hint?: string
	/**
	 * URL du site pour cette cible, ou `null` si elle n'est pas adressable.
	 *
	 * Une destination sans URL est listée mais non sélectionnable : stocker une
	 * destination que la publication ne saurait pas écrire ne ferait que
	 * déplacer l'échec.
	 */
	url: string | null
}

// ---------------------------------------------------------------------------
// FABRIQUES D'URL
// ---------------------------------------------------------------------------
// Un slug se lit, il ne se fabrique jamais à partir du nom : une URL approchée
// mène silencieusement à une AUTRE cible, et le site compte deux catégories
// homonymes pour s'en convaincre.

const categoryUrl = (slug?: string | null): string | null =>
	slug ? `/categorie-produit/${slug}` : null

const productUrl = (slug?: string | null): string | null =>
	slug ? `/produit/${slug}` : null

/**
 * **Les marques n'ont pas de page sur le site.**
 *
 * `App.jsx` du site déclare `/categorie-produit/*` et `/produit/:slug`, et
 * rien pour les marques : une URL `/marque/<slug>` tomberait sur la route
 * attrape-tout, c'est-à-dire sur la page 404.
 *
 * On rend donc `null` — la marque est listée, non sélectionnable — plutôt que
 * de produire une adresse qui a l'air juste et mène nulle part. Le jour où la
 * page existe, cette fonction est la seule chose à changer.
 */
const brandUrl = (_slug?: string | null): string | null => null

// ---------------------------------------------------------------------------
// LISTES
// ---------------------------------------------------------------------------

function useCategoryDestinations(): MenuDestination[] | undefined {
	const { data } = useCatalogCategories()

	return useMemo(
		() =>
			data
				?.map((category) => ({
					sourceId: category.id,
					label: category.name,
					refId: category.legacy_id || null,
					hint: category.slug,
					url: categoryUrl(category.slug),
				}))
				.sort((a, b) => a.label.localeCompare(b.label, 'fr')),
		[data],
	)
}

function useBrandDestinations(): MenuDestination[] | undefined {
	const { data } = useCatalogBrands()

	return useMemo(
		() =>
			data
				?.map((brand) => ({
					sourceId: brand.id,
					label: brand.name,
					refId: brand.legacy_id || null,
					hint: brand.slug,
					url: brandUrl(brand.slug),
				}))
				.sort((a, b) => a.label.localeCompare(b.label, 'fr')),
		[data],
	)
}

/**
 * Seuls les produits **publiés** sont proposables : un brouillon n'existe pas
 * sur le site, et le mettre au menu produirait une rubrique menant à une page
 * absente.
 */
function useProductDestinations(): MenuDestination[] | undefined {
	const { data } = usePublishedProducts()

	return useMemo(
		() =>
			data
				?.map((product) => ({
					sourceId: product.id,
					label: product.name,
					refId: product.legacy_id || null,
					hint: product.sku,
					url: productUrl(product.slug),
				}))
				.sort((a, b) => a.label.localeCompare(b.label, 'fr')),
		[data],
	)
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
	/** Conservé pour les appelants. Plus consulté : l'édition du menu ne
	 *  dépend plus d'AppPos. */
	_ready = true,
) {
	const categories = useCatalogCategories()
	const brands = useCatalogBrands()
	const products = usePublishedProducts()

	const categoryList = useCategoryDestinations()
	const brandList = useBrandDestinations()
	const productList = useProductDestinations()

	switch (linkType) {
		case 'category':
			return {
				data: categoryList,
				isLoading: categories.isLoading,
				isError: categories.isError,
				error: categories.error,
				supported: true as const,
			}
		case 'brand':
			return {
				data: brandList,
				isLoading: brands.isLoading,
				isError: brands.isError,
				error: brands.error,
				supported: true as const,
			}
		case 'product':
			return {
				data: productList,
				isLoading: products.isLoading,
				isError: products.isError,
				error: products.error,
				supported: true as const,
			}
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
 * Résout `ref_id` → nom et URL de la cible.
 *
 * Le nom n'est **pas** stocké dans `site_menu` : ce serait une copie qui se
 * périmerait au premier renommage, et une seconde source de vérité sur la même
 * chose.
 *
 * `usedTypes` est conservé dans la signature mais ne pilote plus de chargement
 * conditionnel : les trois collections sont déjà lues par l'écran « Catalogue
 * en ligne » et partagent leur cache TanStack Query. Les redemander ici ne
 * coûte rien.
 */
export function useDestinationIndex(
	usedTypes: Set<SiteMenuRefType>,
	/** Conservé pour les appelants. Voir `useMenuDestinations`. */
	_ready = true,
) {
	const categories = useCatalogCategories()
	const brands = useCatalogBrands()
	const products = usePublishedProducts()

	const categoryList = useCategoryDestinations()
	const brandList = useBrandDestinations()
	const productList = useProductDestinations()

	const byType: Record<SiteMenuRefType, MenuDestination[] | undefined> = {
		category: categoryList,
		brand: brandList,
		product: productList,
		// Les pages ne sont lues nulle part : PocketApp n'interroge pas
		// WordPress. Leur `ref_id` s'affiche tel quel, tel qu'il a été saisi.
		page: undefined,
	}

	const find = (type: SiteMenuRefType, refId: string) =>
		byType[type]?.find((d) => d.refId === refId)

	const labelFor = (type: SiteMenuRefType, refId: string): string | null =>
		find(type, refId)?.label ?? null

	/**
	 * URL de la cible, ou `null` — ce que la publication écrit dans le document.
	 *
	 * `null` recouvre trois situations que l'appelant distingue par `loaded`,
	 * faute de quoi il publierait un menu amputé sans le savoir : catalogue pas
	 * encore lu, lecture en échec, ou cible réellement sans URL. Seule la
	 * troisième est un refus légitime.
	 */
	const urlFor = (type: SiteMenuRefType, refId: string): string | null =>
		find(type, refId)?.url ?? null

	/** Vrai quand toutes les listes nécessaires sont effectivement chargées.
	 *  `page` n'a pas de source : elle ne conditionne rien. */
	const loaded = (['category', 'brand', 'product'] as const).every(
		(type) => !usedTypes.has(type) || byType[type] !== undefined,
	)

	return {
		labelFor,
		urlFor,
		loaded,
		isLoading: categories.isLoading || brands.isLoading || products.isLoading,
		isError: categories.isError || brands.isError || products.isError,
	}
}
