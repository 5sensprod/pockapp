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
}

/**
 * Hook pour calculer les statistiques des tickets de caisse
 */
export function useTicketStats({ tickets }: UseTicketStatsProps): TicketStats {
	return useMemo(() => {
		const total = tickets.length
		const converted = tickets.filter((t: any) => t.converted_to_invoice).length
		const totalAmount = tickets.reduce(
			(sum: number, t: any) => sum + (t.total_ttc || 0),
			0,
		)

		return {
			total,
			converted,
			notConverted: total - converted,
			totalAmount,
		}
	}, [tickets])
}
