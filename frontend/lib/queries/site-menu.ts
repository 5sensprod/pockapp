// frontend/lib/queries/site-menu.ts
// ═══════════════════════════════════════════════════════════════════════════
// ACCÈS DONNÉES — COLLECTION site_menu  (ticket 4)
// ═══════════════════════════════════════════════════════════════════════════
// Lecture et écriture des entrées du menu de navigation d'axemusique.shop.
//
// Ce que ce fichier manipule est la forme *d'édition*, pas la forme publiée.
// La correspondance entre les deux est écrite en tête de
// backend/migrations/site_menu.go ; le document publié est décrit par
// frontend/modules/site/PocketSite-docs/05-contrat-menu.md.
//
// En particulier : il n'y a pas de champ `url` ici, et il ne doit pas y en
// avoir. L'URL publiée est le *résultat* de la résolution de link_type +
// ref_id, calculée à la publication au ticket 6. `link_url` est autre chose :
// c'est la saisie de l'opérateur quand link_type vaut `manual`.
//
// Ce fichier ne publie rien et n'appelle aucun réseau distant.
// ═══════════════════════════════════════════════════════════════════════════

import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
// ⚠️ Déclarés ici et non dans `frontend/lib/pocketbase-types.ts`, et ce n'est
// plus pour la raison qui était écrite ici. `pnpm typegen` **fonctionne** de
// nouveau (identifiants sortis vers `.env`, cf. docs/DECISIONS.md « Secrets
// hors des fichiers versionnés »). Ce qui bloque est ailleurs :
//
// Le `pocketbase-types.ts` commité n'est pas une sortie de générateur — il a
// été retouché à la main, et ces retouches portent une information que
// PocketBase ne donne pas (`items: InvoiceItem[]` là où le schéma dit `json`,
// `images?: string` là où il dit `string[]`). Le régénérer les efface et sort
// 5 erreurs dans la chaîne produits/caisse — vérifié le 2026-08-07 :
// apppos-transformers.ts:104, ProductTable.tsx:220, CashTerminalPage.tsx:129,
// ConvertTicketToInvoicePage.tsx:608 et :623. Aucune dans le module site.
//
// Adopter la sortie du générateur demande donc de traiter cette chaîne, qui
// est le maillon le moins négociable (CLAUDE.md). C'est une session à part.
// Les types ci-dessous ont exactement la forme de ceux que le générateur
// produit pour `site_menu` — vérifié sur sa sortie réelle —, à ceci près qu'il
// fait de `link_type` un enum ; l'union de littéraux ci-dessous est ce que le
// module consomme.

/** Origines possibles d'une destination. Miroir de `LinkTypeValues`,
 *  backend/migrations/site_menu.go:58. */
export const SITE_MENU_LINK_TYPES = [
	'none',
	'manual',
	'category',
	'brand',
	'product',
	'page',
] as const

export type SiteMenuLinkType = (typeof SITE_MENU_LINK_TYPES)[number]

/** Les quatre types qui portent une référence au catalogue, donc un `ref_id`.
 *  `none` et `manual` produisent `ref: null` dans le document publié (§3). */
export type SiteMenuRefType = Extract<
	SiteMenuLinkType,
	'category' | 'brand' | 'product' | 'page'
>

export type SiteMenuRecord = {
	title: string
	/** Rang entre frères. Ne survit pas à la publication. */
	position?: number
	visible?: boolean
	link_type: SiteMenuLinkType
	/** Renseigné quand link_type = manual. */
	link_url?: string
	/** Identifiant WooCommerce de la cible, chaîne opaque.
	 *  Renseigné quand link_type vaut category, brand, product ou page.
	 *  Origine tranchée dans docs/DECISIONS.md, « Origine des destinations
	 *  du menu ». */
	ref_id?: string
	/** Relation vers une autre entrée. Chaîne vide à la racine. */
	parent?: string
}

export type SiteMenuResponse = Required<SiteMenuRecord> & {
	id: string
	created: string
	updated: string
	collectionId: string
	collectionName: string
}

const COLLECTION = 'site_menu'
const QUERY_KEY = ['site_menu'] as const

// ---------------------------------------------------------------------------
// LECTURE
// ---------------------------------------------------------------------------

/**
 * Toutes les entrées du menu, à plat, triées par position puis date de
 * création. Le tri secondaire garantit un ordre stable pour deux entrées de
 * même position — cas transitoire, mais qui produirait sinon un arbre qui
 * saute d'un rendu à l'autre.
 *
 * L'arbre se construit côté module avec `buildMenuTree`.
 */
export function useSiteMenuEntries() {
	const pb = usePocketBase()

	return useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () =>
			await pb.collection(COLLECTION).getFullList<SiteMenuResponse>({
				sort: 'position,created',
			}),
		staleTime: 0,
	})
}

// ---------------------------------------------------------------------------
// ÉCRITURE
// ---------------------------------------------------------------------------

export function useCreateSiteMenuEntry() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: SiteMenuRecord) =>
			await pb.collection(COLLECTION).create<SiteMenuResponse>(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEY })
		},
	})
}

export function useUpdateSiteMenuEntry() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: { id: string; data: Partial<SiteMenuRecord> }) =>
			await pb.collection(COLLECTION).update<SiteMenuResponse>(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEY })
		},
	})
}

/**
 * Supprime une entrée. **Sa descendance part avec elle** : la relation
 * `parent` est déclarée `CascadeDelete: true`
 * (backend/migrations/site_menu.go:152), précisément pour qu'aucune entrée
 * orpheline ne subsiste — le contrat les interdit dans le document publié
 * (§4). L'appelant doit donc prévenir avant d'appeler.
 */
export function useDeleteSiteMenuEntry() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (id: string) =>
			await pb.collection(COLLECTION).delete(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEY })
		},
	})
}

/**
 * Applique plusieurs changements de `position` et/ou `parent` en une fois.
 *
 * Réordonner ou indenter renumérote toute une fratrie : le faire entrée par
 * entrée ferait clignoter l'arbre à chaque invalidation, et laisserait des
 * positions incohérentes si un appel échouait en cours de route. On envoie
 * donc la série complète, et on n'invalide qu'une fois.
 *
 * PocketBase n'a pas de transaction côté client : si un `update` échoue, les
 * précédents restent. C'est accepté — une position incohérente se corrige
 * d'un clic, et le tri secondaire sur `created` garde un ordre défini.
 */
export function useReorderSiteMenu() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (
			changes: Array<{ id: string; position?: number; parent?: string }>,
		) => {
			for (const { id, ...data } of changes) {
				await pb.collection(COLLECTION).update(id, data)
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEY })
		},
	})
}
