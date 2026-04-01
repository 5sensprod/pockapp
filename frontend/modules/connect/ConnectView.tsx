// frontend/modules/connect/ConnectView.tsx
//
// Composant PRESENTATIONAL — zéro logique métier, zéro hook.
// Reçoit tout via les props (type ConnectModuleData depuis useConnectModule).

import { EmptyState } from '@/components/module-ui'
import { Input } from '@/components/ui/input'
import { Search, Users } from 'lucide-react'
import { CustomerTable } from './components/CustomerTable'
import type { ConnectModuleData } from './useConnectModule'

type ConnectViewProps = ConnectModuleData

export function ConnectView({
	customers,
	isLoading,
	hasNoCustomers,
	searchTerm,
	setSearchTerm,
	handleEditCustomer,
	page,
	setPage,
	totalItems,
	totalPages,
	perPage,
}: ConnectViewProps) {
	return (
		<div className='flex flex-col gap-6'>
			{/* ── Barre de recherche ────────────────────────────────────────── */}
			<div className='relative max-w-md'>
				<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
				<Input
					placeholder='Rechercher un client...'
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					className='pl-10'
				/>
			</div>

			{/* ── Contenu principal ─────────────────────────────────────────── */}
			{isLoading ? (
				// État chargement
				<div className='flex items-center justify-center py-16'>
					<div className='h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin' />
				</div>
			) : hasNoCustomers ? (
				// État vide — EmptyState mutualisé depuis module-ui
				<EmptyState
					icon={Users}
					title={searchTerm ? 'Aucun résultat' : 'Aucun client pour le moment'}
					description={
						searchTerm
							? `Aucun client ne correspond à "${searchTerm}".`
							: 'Commencez par ajouter votre premier client.'
					}
					fullPage
				/>
			) : (
				// Table clients
				<CustomerTable
					data={customers}
					onEditCustomer={handleEditCustomer}
					page={page}
					totalPages={totalPages}
					totalItems={totalItems}
					perPage={perPage}
					onPageChange={setPage}
				/>
			)}
		</div>
	)
}
