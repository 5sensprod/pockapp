// frontend/modules/connect/useConnectModule.ts

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useCustomers } from '@/lib/queries/customers'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import type { Customer } from './features/customers/CustomerDialog'

const PER_PAGE = 20

export function useConnectModule() {
	const { activeCompanyId } = useActiveCompany()
	const navigate = useNavigate()

	const [searchTerm, setSearchTerm] = useState('')
	const [page, setPage] = useState(1)

	const debouncedSearch = useDebounce(searchTerm, 400)

	const {
		data: customersData,
		isLoading,
		refetch,
	} = useCustomers({
		companyId: activeCompanyId ?? undefined,
		filter: debouncedSearch
			? `name ~ "${debouncedSearch}" || email ~ "${debouncedSearch}" || phone ~ "${debouncedSearch}" || company ~ "${debouncedSearch}"`
			: '',
		page,
		perPage: PER_PAGE,
	})

	useEffect(() => {
		if (activeCompanyId) refetch()
	}, [activeCompanyId, refetch])

	const customers: Customer[] = useMemo(
		() =>
			customersData?.items.map((c: any) => ({
				id: c.id,
				name: c.name,
				email: c.email,
				phone: c.phone,
				company: c.company,
				address: c.address,
				notes: c.notes,
				customer_type: c.customer_type || 'individual',
				payment_terms: c.payment_terms,
				tags: Array.isArray(c.tags)
					? (c.tags as string[])
					: c.tags
						? [String(c.tags)]
						: [],
			})) ?? [],
		[customersData],
	)

	return {
		customers,
		isLoading,
		hasNoCustomers: !isLoading && customers.length === 0,
		searchTerm,
		setSearchTerm: (term: string) => {
			setSearchTerm(term)
			setPage(1)
		},
		page,
		setPage,
		perPage: PER_PAGE,
		totalItems: customersData?.totalItems ?? 0,
		totalPages: customersData?.totalPages ?? 1,
		handleNewCustomer: () => navigate({ to: '/connect/customers/new' }),
		handleEditCustomer: (customer: Customer) =>
			navigate({
				to: '/connect/customers/$customerId/edit',
				params: () => ({ customerId: customer.id }),
			}),
	}
}

export type ConnectModuleData = ReturnType<typeof useConnectModule>
