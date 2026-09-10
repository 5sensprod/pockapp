// frontend/lib/queries/product-stock-history.ts
//
// L'HISTORIQUE DU STOCK D'UN PRODUIT — lu dans `product_events`, jamais recalculé.
//
// ── DEUX IDENTIFIANTS ─────────────────────────────────────────────────────
// Depuis le 19 août 2026, `applyStockMovements` journalise l'identifiant
// PocketBase (`record_id`). Les événements plus anciens, écrits du temps
// d'AppPos, portent l'identifiant NeDB — que le produit garde en `legacy_id`.
// On interroge donc les deux, sinon l'historique commencerait le 19 août.
//
// ── LA CLÉ DE CACHE ───────────────────────────────────────────────────────
// Sous `catalog-products` exprès : `invalidateCatalog` la périme, et le temps
// réel l'appelle à chaque changement d'un produit. Une vente sur un autre poste
// change le stock, donc rafraîchit l'historique ouvert ici, sans abonnement de
// plus.

import { useQuery } from '@tanstack/react-query'

import {
	PRODUCT_EVENTS_COLLECTION,
	type ProductEvent,
	type ProductEventType,
} from '@/lib/product-events/product-events-types'
import { usePocketBase } from '@/lib/use-pocketbase'

/** Les événements qui bougent le stock. Tout nouveau type s'ajoute ici ET dans
 *  `STOCK_EVENT_LABELS` — un test y veille. */
export const STOCK_EVENT_TYPES: ReadonlyArray<ProductEventType> = [
	'stock_updated',
	'stock_adjusted_inventory',
	'stock_sale',
	'stock_return',
	'stock_restock',
	'stock_correction',
	'stock_loss',
	'stock_to_stock_b',
	'stock_other',
]

export const STOCK_EVENT_LABELS: Record<string, string> = {
	stock_updated: 'Modification (AppPos)',
	stock_adjusted_inventory: 'Inventaire',
	stock_sale: 'Vente',
	stock_return: 'Retour client',
	stock_restock: 'Réassort',
	stock_correction: 'Correction d’inventaire',
	stock_loss: 'Casse ou perte',
	stock_to_stock_b: 'Passage en Stock B',
	stock_other: 'Autre',
}

const DESTINATIONS: Record<string, string> = {
	restock: 'remis en vente',
	sav: 'envoyé au SAV',
	stock_b: 'classé Stock B',
}

type FiltreurPocketBase = {
	filter: (expression: string, params?: Record<string, unknown>) => string
}

/** Paramètres liés : un identifiant ne s'interpole jamais dans le filtre. */
export function stockHistoryFilter(
	pb: FiltreurPocketBase,
	productId: string,
	legacyId?: string,
): string {
	const params: Record<string, string> = { id: productId }
	let cible = 'product_id = {:id}'
	if (legacyId && legacyId !== productId) {
		params.legacy = legacyId
		cible = '(product_id = {:id} || product_id = {:legacy})'
	}
	const types = STOCK_EVENT_TYPES.map((type, index) => {
		params[`t${index}`] = type
		return `event_type = {:t${index}}`
	}).join(' || ')
	return pb.filter(`${cible} && (${types})`, params)
}

export interface StockHistoryLine {
	id: string
	eventType: string
	/** ISO, lisible par `new Date`. */
	occurredAt: string
	label: string
	delta: number | null
	before: number | null
	after: number | null
	/** Le compteur B, quand l'événement le touche : `null` sinon. */
	deltaB: number | null
	beforeB: number | null
	afterB: number | null
	/** Commentaire, destination d'un retour, session d'inventaire. */
	detail: string | null
}

function nombre(valeur: unknown): number | null {
	return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null
}

function texte(valeur: unknown): string | null {
	return typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null
}

export function toStockHistoryLine(event: ProductEvent): StockHistoryLine {
	const before = nombre(event.before?.stock)
	const after = nombre(event.after?.stock)
	const delta =
		nombre(event.delta?.stock) ??
		(before !== null && after !== null ? after - before : null)
	// Les événements d'avant le Stock B n'ont pas de clé `stock_b` : `null`,
	// et non zéro, pour ne rien afficher plutôt qu'un « B 0 » inventé.
	const beforeB = nombre(event.before?.stock_b)
	const afterB = nombre(event.after?.stock_b)
	const deltaB =
		nombre(event.delta?.stock_b) ??
		(beforeB !== null && afterB !== null ? afterB - beforeB : null)
	const meta = (event.metadata ?? {}) as Record<string, unknown>

	// Avant le 10 septembre 2026, la fiche produit journalisait ses
	// modifications comme un inventaire. Les montrer comme tel ferait passer
	// une saisie au clavier pour un comptage.
	const depuisLaFiche =
		event.event_type === 'stock_adjusted_inventory' &&
		meta.origin === 'product_detail'
	const label = depuisLaFiche
		? 'Modification depuis la fiche (sans motif)'
		: (STOCK_EVENT_LABELS[event.event_type] ?? event.event_type)

	const details = [
		texte(meta.comment),
		event.event_type === 'stock_return' && typeof meta.destination === 'string'
			? (DESTINATIONS[meta.destination] ?? meta.destination)
			: null,
		texte(meta.session_label),
	].filter((part): part is string => Boolean(part))

	return {
		id: event.id,
		eventType: event.event_type,
		// PocketBase rend « 2026-09-10 14:00:00.000Z » : l'espace n'est pas
		// garanti par tous les moteurs de `Date`.
		occurredAt: (event.occurred_at || event.created).replace(' ', 'T'),
		label,
		delta,
		before,
		after,
		deltaB,
		beforeB,
		afterB,
		detail: details.length ? details.join(' · ') : null,
	}
}

export function useProductStockHistory(
	productId: string,
	legacyId: string | undefined,
	limit: number,
) {
	const pb = usePocketBase() as any

	return useQuery({
		queryKey: ['catalog-products', 'stock-history', productId, legacyId, limit],
		enabled: !!productId,
		staleTime: 30_000,
		// « Voir plus » garde la liste affichée pendant qu'il lit la suite.
		placeholderData: (precedent: unknown) => precedent as never,
		queryFn: async () => {
			const page = await pb
				.collection(PRODUCT_EVENTS_COLLECTION)
				.getList(1, limit, {
					filter: stockHistoryFilter(pb, productId, legacyId),
					sort: '-occurred_at,-created',
					requestKey: `stock-history-${productId}`,
				})
			return {
				lines: (page.items as ProductEvent[]).map(toStockHistoryLine),
				total: page.totalItems as number,
			}
		},
	})
}
