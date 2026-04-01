// frontend/modules/connect/components/CustomersPage.tsx

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useCustomers } from '@/lib/queries/customers'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Users } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { Customer } from './CustomerDialog'
import { CustomerTable } from './CustomerTable'

const PER_PAGE = 20

export function CustomersPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()

	const [searchTerm, setSearchTerm] = useState('')
	const [page, setPage] = useState(1)
	const prevDebouncedRef = useRef('')

	const debouncedSearch = useDebounce(searchTerm, 400)

	// Reset page via ref quand la recherche change — sans re-render supplémentaire
	if (debouncedSearch !== prevDebouncedRef.current) {
		prevDebouncedRef.current = debouncedSearch
		if (page !== 1) setPage(1)
	}

	const { data: customersData, isLoading } = useCustomers({
		companyId: activeCompanyId ?? undefined,
		filter: debouncedSearch
			? `name ~ "${debouncedSearch}" || email ~ "${debouncedSearch}" || phone ~ "${debouncedSearch}" || company ~ "${debouncedSearch}"`
			: '',
		page,
		perPage: PER_PAGE,
	})

	const customers: Customer[] = useMemo(
		() =>
			(customersData?.items ?? []).map((c: any) => ({
				id: c.id,
				name: c.name,
				email: c.email,
				phone: c.phone,
				company: c.company,
				address: c.address,
				notes: c.notes,
				tags: Array.isArray(c.tags)
					? (c.tags as unknown as string[])
					: c.tags
						? [String(c.tags)]
						: [],
				customer_type: c.customer_type || 'individual',
				payment_terms: c.payment_terms,
			})),
		[customersData],
	)

	const handleEditCustomer = (customer: Customer) => {
		navigate({
			to: '/connect/customers/$customerId/edit',
			params: { customerId: customer.id },
		})
	}

	// Pas de early return sur isLoading — ça détruirait le focus de l'input
	return (
		<div className='container mx-auto px-6 py-8'>
			{/* Header */}
			<div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
				<div className='flex items-center gap-3'>
					<Users className='h-7 w-7 text-muted-foreground' />
					<div>
						<h1 className='text-2xl font-bold'>Clients</h1>
						<p className='text-muted-foreground'>
							Gérez la liste de vos clients (création, modification,
							suppression).
						</p>
					</div>
				</div>
				<div className='flex gap-2'>
					<Button onClick={() => navigate({ to: '/connect/customers/new' })}>
						<Plus className='h-4 w-4 mr-2' />
						Nouveau client
					</Button>
				</div>
			</div>

			{/* Message si pas d'entreprise active */}
			{!activeCompanyId ? (
				<p className='mt-8 text-muted-foreground'>
					Aucune entreprise active sélectionnée.
				</p>
			) : (
				<div className='mt-6 space-y-4'>
					<div className='flex-1 max-w-md'>
						<Input
							placeholder='Rechercher par nom, email, téléphone, entreprise...'
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
						/>
					</div>

					<CustomerTable
						data={customers}
						onEditCustomer={handleEditCustomer}
						page={page}
						totalPages={customersData?.totalPages ?? 1}
						totalItems={customersData?.totalItems ?? 0}
						perPage={PER_PAGE}
						onPageChange={setPage}
						isLoading={isLoading}
					/>
				</div>
			)}
		</div>
	)
}
