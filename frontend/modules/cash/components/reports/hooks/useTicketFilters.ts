// frontend/modules/cash/components/reports/hooks/useTicketFilters.ts
import { useState, useMemo } from 'react'
import { toYMD } from '../utils'

interface UseTicketFiltersProps {
	tickets: any[]
}

export type ConversionFilter = 'all' | 'converted' | 'not_converted'

/**
 * Hook pour gérer le filtrage des tickets de caisse
 */
export function useTicketFilters({ tickets }: UseTicketFiltersProps) {
	const [searchTerm, setSearchTerm] = useState('')
	const [conversionFilter, setConversionFilter] =
		useState<ConversionFilter>('all')
	const [dateFilter, setDateFilter] = useState('')

	const filteredTickets = useMemo(() => {
		return tickets.filter((ticket: any) => {
			// Filtre recherche
			if (searchTerm) {
				const term = searchTerm.toLowerCase()
				const matchNumber = ticket.number?.toLowerCase().includes(term)
				const matchCustomer = ticket.expand?.customer?.name
					?.toLowerCase()
					.includes(term)
				if (!matchNumber && !matchCustomer) return false
			}

			// Filtre conversion
			if (conversionFilter === 'converted' && !ticket.converted_to_invoice) {
				return false
			}
			if (conversionFilter === 'not_converted' && ticket.converted_to_invoice) {
				return false
			}

			// Filtre date
			if (dateFilter) {
				const ticketDate = toYMD(ticket.date)
				if (ticketDate !== dateFilter) return false
			}

			return true
		})
	}, [tickets, searchTerm, conversionFilter, dateFilter])

	const resetFilters = () => {
		setSearchTerm('')
		setConversionFilter('all')
		setDateFilter('')
	}

	const hasActiveFilters =
		searchTerm !== '' || conversionFilter !== 'all' || dateFilter !== ''

	return {
		// Filtres
		searchTerm,
		setSearchTerm,
		conversionFilter,
		setConversionFilter,
		dateFilter,
		setDateFilter,

		// Résultats
		filteredTickets,

		// Utilitaires
		resetFilters,
		hasActiveFilters,
	}
}
