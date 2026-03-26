import {
	getTicketsListState,
	setTicketsListState,
} from '@/lib/stores/appCashStore'
// frontend/modules/cash/components/reports/hooks/useTicketFilters.ts
import { useCallback, useMemo, useState } from 'react'
import { toYMD } from '../utils'

interface UseTicketFiltersProps {
	tickets: any[]
}

export type ConversionFilter = 'all' | 'converted' | 'not_converted'

/**
 * Hook pour gérer le filtrage des tickets de caisse.
 * L'état est persisté dans appCashStore pour survivre aux navigations inter-modules.
 */
export function useTicketFilters({ tickets }: UseTicketFiltersProps) {
	// ✅ Initialisation depuis le store
	const [searchTerm, setSearchTerm_] = useState<string>(
		() => getTicketsListState().searchTerm,
	)
	const [conversionFilter, setConversionFilter_] = useState<ConversionFilter>(
		() => getTicketsListState().conversionFilter,
	)
	const [dateFilter, setDateFilter_] = useState<string>(
		() => getTicketsListState().dateFilter,
	)

	// ✅ Wrappers qui synchent vers le store immédiatement
	const setSearchTerm = useCallback((v: string) => {
		setSearchTerm_(v)
		setTicketsListState({ searchTerm: v })
	}, [])

	const setConversionFilter = useCallback((v: ConversionFilter) => {
		setConversionFilter_(v)
		setTicketsListState({ conversionFilter: v })
	}, [])

	const setDateFilter = useCallback((v: string) => {
		setDateFilter_(v)
		setTicketsListState({ dateFilter: v })
	}, [])

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

	const resetFilters = useCallback(() => {
		setSearchTerm('')
		setConversionFilter('all')
		setDateFilter('')
	}, [setSearchTerm, setConversionFilter, setDateFilter])

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
