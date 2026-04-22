// frontend/lib/queries/orders_convert.ts

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
					'Un bon de commande annulé ne peut pas être converti en facture.',
				)
			}
			if (order.status === 'draft') {
				throw new Error(
					"Veuillez d'abord valider le bon de commande avant de le convertir.",
				)
			}
			if (order.invoice_id) {
				throw new Error('Ce bon de commande a déjà été converti en facture.')
			}

			// 2. Creer la facture
			// items : invoices.items est FieldTypeJson → PocketBase accepte l'objet directement
			// currency : champ requis sur invoices
			// source_order_id : lien structuré vers l'order (champ ajouté via migration)
			const invoiceData = {
				invoice_type: 'invoice' as const,
				date: new Date().toISOString(),
				customer: order.customer,
				owner_company: order.owner_company,
				issued_by: order.issued_by ?? undefined,
				status: 'validated' as const,
				is_paid: false,
				items: order.items ?? [],
				total_ht: order.total_ht,
				total_tva: order.total_tva,
				total_ttc: order.total_ttc,
				currency: 'EUR',
				source_order_id: orderId,
				notes: order.notes
					? `${order.notes}\n\nConverti depuis le bon de commande ${order.number}`
					: `Converti depuis le bon de commande ${order.number}`,
			}

			const invoice = await pb.collection('invoices').create(invoiceData)

			// 3. Lier la facture à l'order — ne pas toucher au statut commande.
			// L'état commande (confirmed / in_progress / delivered) est géré
			// manuellement par l'utilisateur et est indépendant de la facturation.
			await pb.collection('orders').update(orderId, {
				invoice_id: invoice.id,
			})

			return invoice
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orderKeys.all })
			queryClient.invalidateQueries({ queryKey: ['invoices'] })
		},
	})
}
