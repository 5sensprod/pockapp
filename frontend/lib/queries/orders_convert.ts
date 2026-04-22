// frontend/lib/queries/orders_convert.ts
//
// Hook useConvertOrderToInvoice
// A coller dans queries/orders.ts ou importer depuis ce fichier.
// Calque sur useConvertQuoteToInvoice dans queries/quotes.ts.

import { orderKeys } from '@/lib/queries/orders'
import type { OrderResponse } from '@/lib/queries/orders'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useConvertOrderToInvoice() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (orderId: string) => {
			// 1. Recuperer le bon de commande
			const order = (await pb
				.collection('orders')
				.getOne(orderId)) as OrderResponse

			// Gardes metier
			if (order.status === 'cancelled') {
				throw new Error(
					'Un bon de commande annule ne peut pas etre converti en facture.',
				)
			}
			if (order.status === 'draft') {
				throw new Error(
					"Veuillez d'abord valider le bon de commande avant de le convertir.",
				)
			}
			if (order.status === 'billed' || order.invoice_id) {
				throw new Error('Ce bon de commande a deja ete converti en facture.')
			}

			// 2. Creer la facture
			// Les items de l'order ont exactement la meme structure que les items facture
			// (description, quantity, unit_price_ht, vat_rate, total_ht, total_ttc)
			const invoiceData = {
				invoice_type: 'invoice' as const,
				date: new Date().toISOString(),
				customer: order.customer,
				owner_company: order.owner_company,
				issued_by: order.issued_by ?? undefined,
				status: 'validated' as const,
				is_paid: false,
				// PocketBase attend les items serialises en JSON string (cf useCreateOrder)
				items: JSON.stringify(order.items ?? []),
				total_ht: order.total_ht,
				total_tva: order.total_tva,
				total_ttc: order.total_ttc,
				currency: 'EUR',
				notes: order.notes
					? `${order.notes}\n\nConverti depuis le bon de commande ${order.number}`
					: `Converti depuis le bon de commande ${order.number}`,
			}

			const invoice = await pb.collection('invoices').create(invoiceData)

			// 3. Marquer l'order comme facture et stocker l'id de la facture
			await pb.collection('orders').update(orderId, {
				status: 'billed',
				invoice_id: invoice.id,
				billed_at: new Date().toISOString(),
			})

			return invoice
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orderKeys.all })
			queryClient.invalidateQueries({ queryKey: ['invoices'] })
		},
	})
}
