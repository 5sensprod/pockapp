import type { InvoiceItem } from '@/lib/types/invoice.types'
import { decrementAppPosProductsStock } from './apppos-api'

/**
 * Décrémente le stock AppPOS pour les items d'une facture/devis.
 * Ignore silencieusement les lignes libres (sans product_id).
 * Non-bloquant : une erreur AppPOS ne fait pas échouer la facture.
 */
export async function decrementStockFromItems(
	items: InvoiceItem[],
): Promise<void> {
	const stockItems = items
		.filter(
			(item): item is InvoiceItem & { product_id: string } =>
				typeof item.product_id === 'string' && item.quantity > 0,
		)
		.map((item) => ({
			productId: item.product_id,
			quantitySold: item.quantity,
		}))

	if (stockItems.length === 0) return

	try {
		await decrementAppPosProductsStock(stockItems)
	} catch (error) {
		console.error('❌ [Stock] Erreur décrément AppPOS:', error)
	}
}
