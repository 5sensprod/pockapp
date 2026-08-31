import {
	DEFAULT_DOCUMENT_SEARCH_FIELDS,
	type DocumentSearchTextField,
	buildDocumentSearchFilter,
} from '@/lib/document-search'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

interface UseDocumentSearchFilterOptions {
	term: string
	companyId?: string
	searchCustomers?: boolean
	textFields?: readonly DocumentSearchTextField[]
}

/**
 * Recherche documentaire commune. `items ?~` couvre au moins une des lignes
 * JSON sans dupliquer son libellé/sa description dans un nouveau champ.
 */
export function useDocumentSearchFilter({
	term,
	companyId,
	searchCustomers = false,
	textFields = DEFAULT_DOCUMENT_SEARCH_FIELDS,
}: UseDocumentSearchFilterOptions): string | undefined {
	const pb = usePocketBase()
	const normalizedTerm = term.trim()

	const { data: matchingCustomerIds = [] } = useQuery({
		queryKey: ['document-search-customer-ids', companyId, normalizedTerm],
		queryFn: async () => {
			if (!companyId || !normalizedTerm) return []
			const result = await pb.collection('customers').getFullList({
				filter: pb.filter(
					'owner_company = {:company} && (name ~ {:term} || company ~ {:term} || email ~ {:term} || phone ~ {:term})',
					{ company: companyId, term: normalizedTerm },
				),
				fields: 'id',
			})
			return result.map((customer) => customer.id)
		},
		enabled: searchCustomers && !!companyId && !!normalizedTerm,
		staleTime: 10_000,
	})

	return useMemo(
		() =>
			buildDocumentSearchFilter({
				term: normalizedTerm,
				textFields,
				customerIds: searchCustomers ? matchingCustomerIds : [],
				formatFilter: (expression, params) => pb.filter(expression, params),
			}),
		[matchingCustomerIds, normalizedTerm, pb, searchCustomers, textFields],
	)
}
