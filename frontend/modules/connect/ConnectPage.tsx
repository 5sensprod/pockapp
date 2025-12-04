// frontend/modules/connect/ConnectPage.tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useCustomers } from '@/lib/queries/customers'
import { useEffect, useState } from 'react'
import { type Customer, CustomerDialog } from './components/CustomerDialog'
import { CustomerTable } from './components/CustomerTable'

import { manifest } from './index'

export function ConnectPage() {
	const { activeCompanyId } = useActiveCompany()
	const [searchTerm, setSearchTerm] = useState('')
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

	const {
		data: customersData,
		isLoading,
		refetch,
	} = useCustomers({
		companyId: activeCompanyId ?? undefined,
		filter: searchTerm
			? `name ~ "${searchTerm}" || email ~ "${searchTerm}" || phone ~ "${searchTerm}"`
			: '',
	})

	// Refetch quand l'entreprise change
	useEffect(() => {
		if (activeCompanyId) {
			refetch()
		}
	}, [activeCompanyId, refetch])

	// Adaptation PocketBase -> Customer (tags: string[])
	const customers: Customer[] =
		customersData?.items.map((c: any) => ({
			id: c.id,
			name: c.name,
			email: c.email,
			phone: c.phone,
			company: c.company,
			address: c.address,
			notes: c.notes,
			tags: Array.isArray(c.tags) ? c.tags : c.tags ? [c.tags] : [],
		})) ?? []

	const Icon = manifest.icon

	const handleNewCustomer = () => {
		setEditingCustomer(null)
		setIsDialogOpen(true)
	}

	const handleEditCustomer = (customer: Customer) => {
		setEditingCustomer(customer)
		setIsDialogOpen(true)
	}

	return (
		<div className='container mx-auto px-6 py-8'>
			{/* Header */}
			<div className='mb-8'>
				<div className='flex items-center gap-3 mb-2'>
					<div className='w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center'>
						<Icon
							className={`h-6 w-6 ${manifest.iconColor ?? 'text-primary'}`}
						/>
					</div>

					<div className='flex-1'>
						<h1 className='text-3xl font-bold'>{manifest.name}</h1>
						<p className='text-muted-foreground'>{manifest.description}</p>
					</div>

					<Button onClick={handleNewCustomer}>Nouveau client</Button>
				</div>
			</div>

			{/* Search */}
			<div className='mb-6 flex gap-4'>
				<div className='relative flex-1 max-w-md'>
					<Input
						placeholder='Rechercher un client...'
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className='pl-10'
					/>
				</div>
			</div>

			{/* Table */}
			{isLoading ? (
				<div className='text-center py-12 text-muted-foreground'>
					Chargement...
				</div>
			) : customers.length === 0 ? (
				<div className='text-center py-12 text-muted-foreground'>
					Aucun client pour le moment
				</div>
			) : (
				<CustomerTable data={customers} onEditCustomer={handleEditCustomer} />
			)}

			{/* Dialog création / édition */}
			<CustomerDialog
				open={isDialogOpen}
				onOpenChange={(open) => {
					setIsDialogOpen(open)
					if (!open) {
						setEditingCustomer(null)
					}
				}}
				customer={editingCustomer}
			/>
		</div>
	)
}
