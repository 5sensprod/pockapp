// frontend/lib/apppos/stock-utils.ts
// Utilitaires de synchronisation stock AppPOS + journalisation product_events.
//
// Tous les points de déclenchement des ventes passent par ce fichier :
//   - decrementStockFromItems()  → factures B2B + conversion devis
//   - decrementStockFromCart()   → vente POS (CashTerminalPage) + paiement facture
//
// La journalisation est best-effort : une erreur PocketBase ne bloque
// jamais l'opération de vente principale.

import { createProductEvent } from '@/lib/product-events/product-events-pocketbase'
import type { InvoiceItem } from '@/lib/types/invoice.types'
import type PocketBase from 'pocketbase'
import { decrementAppPosProductsStock } from './apppos-api'

// ============================================================================
// TYPES
// ============================================================================

interface StockCartItem {
	productId: string
	productName: string
	productSku: string
	quantitySold: number
}

export interface SaleEventOptions {
	/** Instance PocketBase — si absent, pas de journalisation */
	pb?: PocketBase
	/** ID du ticket/facture source (source_id dans product_events) */
	sourceId?: string
	/** Nom de l'opérateur */
	operator?: string
}

// ============================================================================
// HELPER INTERNE — journalisation
// ============================================================================

async function journalizeSaleEvents(
	pb: PocketBase,
	soldItems: StockCartItem[],
	updatedProducts: Awaited<ReturnType<typeof decrementAppPosProductsStock>>,
	options: SaleEventOptions,
): Promise<void> {
	console.log(
		'🔍 journalize — soldItems:',
		soldItems.map((i) => i.productId),
	)
	console.log(
		'🔍 journalize — updatedProducts:',
		updatedProducts.map((p) => ({
			_id: p._id,
			id: (p as any).id,
			name: p.name,
		})),
	)
	const productMap = new Map(updatedProducts.map((p) => [p._id, p]))

	for (const item of soldItems) {
		const updated = productMap.get(item.productId)
		if (!updated) continue

		const stockAfter = typeof updated.stock === 'number' ? updated.stock : 0
		const stockBefore = stockAfter + item.quantitySold

		try {
			await createProductEvent(pb, {
				product_id: item.productId,
				product_name_snapshot: item.productName || updated.name || '',
				product_sku_snapshot: item.productSku || updated.sku || '',
				event_type: 'stock_sale',
				source: 'sale',
				source_id: options.sourceId ?? null,
				operator: options.operator ?? '',
				occurred_at: new Date().toISOString(),
				before: { stock: stockBefore },
				after: { stock: stockAfter },
				delta: { stock: -item.quantitySold },
				metadata: {
					ticket_id: options.sourceId ?? '',
					quantity_sold: item.quantitySold,
				},
			})
		} catch (err: any) {
			console.warn(
				`[product_events] Échec journalisation vente ${item.productId}:`,
				err?.message ?? err,
			)
		}
	}
}

// ============================================================================
// decrementStockFromItems — factures B2B + conversion devis
// ============================================================================

/**
 * Décrémente le stock AppPOS pour les items d'une facture/devis.
 * Ignore silencieusement les lignes libres (sans product_id).
 * Non-bloquant : une erreur AppPOS ne fait pas échouer la facture.
 *
 * Si `pb` est fourni dans les options, journalise chaque vente dans product_events.
 */
export async function decrementStockFromItems(
	items: InvoiceItem[],
	options: SaleEventOptions = {},
): Promise<void> {
	const stockItems: StockCartItem[] = items
		.filter(
			(item): item is InvoiceItem & { product_id: string } =>
				typeof item.product_id === 'string' && item.quantity > 0,
		)
		.map((item) => ({
			productId: item.product_id,
			productName: item.name ?? '',
			productSku: '',
			quantitySold: item.quantity,
		}))

	if (stockItems.length === 0) return

	try {
		const updatedProducts = await decrementAppPosProductsStock(
			stockItems.map(({ productId, quantitySold }) => ({
				productId,
				quantitySold,
			})),
		)

		if (options.pb && updatedProducts.length > 0) {
			await journalizeSaleEvents(
				options.pb,
				stockItems,
				updatedProducts,
				options,
			)
		}
	} catch (error) {
		console.error('❌ [Stock] Erreur décrément AppPOS:', error)
	}
}

// ============================================================================
// decrementStockFromCart — POS + paiement facture
// ============================================================================

/**
 * Décrémente le stock AppPOS depuis le panier POS ou une liste d'items de facture.
 * Accepte indifféremment `quantitySold` ou `quantity` pour une compatibilité maximale
 * avec les appelants existants (stockItems buildés avec quantitySold dans les composants).
 *
 * Non-bloquant : une erreur AppPOS ne fait pas échouer le ticket.
 * Si `pb` est fourni dans les options, journalise chaque vente dans product_events.
 */
export async function decrementStockFromCart(
	cartItems: Array<{
		productId: string
		productName?: string
		productSku?: string
		quantitySold?: number // format InvoicesPage / useInvoiceActions
		quantity?: number // format CashTerminalPage
	}>,
	options: SaleEventOptions = {},
): Promise<void> {
	const stockItems: StockCartItem[] = cartItems
		.map((item) => ({
			productId: item.productId,
			productName: item.productName ?? '',
			productSku: item.productSku ?? '',
			quantitySold: item.quantitySold ?? item.quantity ?? 0,
		}))
		.filter((item) => item.quantitySold > 0)

	if (stockItems.length === 0) return

	try {
		const updatedProducts = await decrementAppPosProductsStock(
			stockItems.map(({ productId, quantitySold }) => ({
				productId,
				quantitySold,
			})),
		)

		if (options.pb && updatedProducts.length > 0) {
			await journalizeSaleEvents(
				options.pb,
				stockItems,
				updatedProducts,
				options,
			)
		}
	} catch (error) {
		console.error('❌ [Stock] Erreur décrément AppPOS (POS):', error)
	}
}
