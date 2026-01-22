// frontend/modules/cash/components/reports/hooks/useTicketStats.ts
import { useMemo } from 'react'

interface UseTicketStatsProps {
	tickets: any[]
}

export interface TicketStats {
	total: number
	converted: number
	notConverted: number
	totalAmount: number
	// 🆕 Ajouts pour la répartition
	byMethod: Record<string, number>
	byMethodLabels: Record<string, string>
}

/**
 * Hook pour calculer les statistiques des tickets de caisse
 */
export function useTicketStats({ tickets }: UseTicketStatsProps): TicketStats {
	return useMemo(() => {
		// Initialisation des accumulateurs
		let totalAmount = 0
		let converted = 0
		const byMethod: Record<string, number> = {}
		const byMethodLabels: Record<string, string> = {}

		// On itère une seule fois sur les tickets pour tout calculer
		for (const ticket of tickets) {
			// 1. Calcul des montants globaux
			totalAmount += ticket.total_ttc || 0
			if (ticket.converted_to_invoice) {
				converted++
			}

			// 2. Agrégation par mode de paiement
			const methodKey = ticket.payment_method
			if (methodKey) {
				byMethod[methodKey] =
					(byMethod[methodKey] || 0) + (ticket.total_ttc || 0)

				// Stocker le label ou utiliser un fallback
				if (!byMethodLabels[methodKey]) {
					if (ticket.payment_method_label) {
						// Custom : utiliser le label
						byMethodLabels[methodKey] = ticket.payment_method_label
					} else {
						// Défaut : mapper le code
						const fallback: Record<string, string> = {
							cb: 'Carte bancaire',
							especes: 'Espèces',
							cheque: 'Chèque',
							virement: 'Virement',
						}
						byMethodLabels[methodKey] = fallback[methodKey] || methodKey
					}
				}
			}
		}

		const total = tickets.length

		return {
			total,
			converted,
			notConverted: total - converted,
			totalAmount,
			byMethod, // 🆕 Données pour SalesCard
			byMethodLabels, // 🆕 Labels pour SalesCard
		}
	}, [tickets])
}
