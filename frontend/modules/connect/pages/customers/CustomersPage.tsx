// frontend/modules/connect/components/CustomersPage.tsx
//
// Migré sur ConnectModuleShell.
// Avant : header inline (titre H1, bouton Nouveau), container mx-auto manuel.
// Après : shell gère header/badge/CTA — la page ne fait qu'afficher la table.

import { EmptyState } from '@/components/module-ui'
import { Input } from '@/components/ui/input'
// import { navigationActions } from '@/lib/stores/navigationStore'
import { Search } from 'lucide-react'
import { Users } from 'lucide-react'
// import { useEffect } from 'react'
import { ConnectModuleShell } from '../../ConnectModuleShell'
import { CustomerTable } from '../../features/customers/CustomerTable'
import { useConnectModule } from '../../useConnectModule'
export function CustomersPage() {
	const connect = useConnectModule()
	// useEffect(() => {
	// 	navigationActions.clear()
	// }, [])

	return (
		<ConnectModuleShell
			pageTitle='Clients'
			hideBadge
			// Barre de recherche dans la zone centre du subheader
			headerCenter={
				<div className='relative w-full max-w-sm'>
					<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
					<Input
						placeholder='Rechercher un client...'
						value={connect.searchTerm}
						onChange={(e) => connect.setSearchTerm(e.target.value)}
						className='pl-10 h-8 text-sm'
					/>
				</div>
			}
		>
			<div className='flex flex-col gap-6'>
				{connect.isLoading ? (
					<div className='flex items-center justify-center py-16'>
						<div className='h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin' />
					</div>
				) : connect.hasNoCustomers ? (
					<EmptyState
						icon={Users}
						title={
							connect.searchTerm
								? 'Aucun résultat'
								: 'Aucun client pour le moment'
						}
						description={
							connect.searchTerm
								? `Aucun client ne correspond à "${connect.searchTerm}".`
								: 'Commencez par ajouter votre premier client.'
						}
						fullPage
					/>
				) : (
					<CustomerTable
						data={connect.customers}
						onEditCustomer={connect.handleEditCustomer}
						page={connect.page}
						totalPages={connect.totalPages}
						totalItems={connect.totalItems}
						perPage={connect.perPage}
						onPageChange={connect.setPage}
					/>
				)}
			</div>
		</ConnectModuleShell>
	)
}
