// frontend/modules/connect/components/CustomersPage.tsx

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { CustomersResponse } from '@/lib/pocketbase-types'
import { useCustomers } from '@/lib/queries/customers'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Customer } from './CustomerDialog'
import { CustomerTable } from './CustomerTable'

export function CustomersPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()

	const [searchTerm, setSearchTerm] = useState('')

	const { data: customersData, isLoading } = useCustomers({
		companyId: activeCompanyId ?? undefined,
	})

	// On récupère les enregistrements bruts PocketBase
	const rawCustomers = (customersData?.items ?? []) as CustomersResponse[]

	// On les mappe vers le type Customer utilisé par CustomerTable / CustomerDialog
	const customers: Customer[] = useMemo(
		() =>
			rawCustomers.map((c) => ({
				id: c.id,
				name: c.name,
				email: c.email,
				phone: c.phone,
				company: c.company,
				address: c.address,
				notes: c.notes,
				// c.tags (PocketBase) -> string[] pour l'UI
				tags: Array.isArray(c.tags)
					? (c.tags as unknown as string[])
					: c.tags
						? [String(c.tags)]
						: [],
			})),
		[rawCustomers],
	)

	// Filtre simple côté client (nom, email, téléphone, entreprise)
	const filteredCustomers = useMemo(() => {
		if (!searchTerm.trim()) return customers

		const term = searchTerm.toLowerCase()
		return customers.filter((c) => {
			return (
				c.name.toLowerCase().includes(term) ||
				(c.email ?? '').toLowerCase().includes(term) ||
				(c.phone ?? '').toLowerCase().includes(term) ||
				(c.company ?? '').toLowerCase().includes(term)
			)
		})
	}, [customers, searchTerm])

	const handleEditCustomer = (customer: Customer) => {
		navigate({
			to: '/connect/customers/$customerId/edit',
			params: { customerId: customer.id },
		})
	}

	if (!activeCompanyId) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<p className='text-muted-foreground'>
					Aucune entreprise active sélectionnée.
				</p>
			</div>
		)
	}

	if (isLoading) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<p className='text-muted-foreground'>Chargement des clients...</p>
			</div>
		)
	}

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
					<Button
						onClick={() =>
							navigate({
								to: '/connect/customers/new',
							})
						}
					>
						<Plus className='h-4 w-4 mr-2' />
						Nouveau client
					</Button>
				</div>
			</div>

			{/* Filtres + table */}
			<div className='mt-6 space-y-4'>
				<div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
					<div className='flex-1 max-w-md'>
						<Input
							placeholder='Rechercher par nom, email, téléphone, entreprise...'
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
						/>
					</div>
				</div>

				<CustomerTable
					data={filteredCustomers}
					onEditCustomer={handleEditCustomer}
				/>
			</div>
		</div>
	)
}
