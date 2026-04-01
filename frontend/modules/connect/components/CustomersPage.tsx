// frontend/modules/connect/components/CustomersPage.tsx

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { Plus, Users } from 'lucide-react'
import { CustomerTable } from './CustomerTable'

// ✅ Import du hook personnalisé (vérifie que le chemin correspond bien à ton arborescence)
import { useConnectModule } from '../useConnectModule'

export function CustomersPage() {
	const { activeCompanyId } = useActiveCompany()

	// ✅ On délègue TOUTE la logique d'état et de requête au hook
	const {
		customers,
		isLoading,
		searchTerm,
		setSearchTerm,
		page,
		setPage,
		totalItems,
		totalPages,
		perPage,
		handleNewCustomer,
		handleEditCustomer,
	} = useConnectModule()

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
					<Button onClick={handleNewCustomer}>
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
						totalPages={totalPages}
						totalItems={totalItems}
						perPage={perPage}
						onPageChange={setPage}
						isLoading={isLoading}
					/>
				</div>
			)}
		</div>
	)
}
