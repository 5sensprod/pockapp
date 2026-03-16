import { Input } from '@/components/ui/input'
import type { SuppliersResponse } from '@/lib/pocketbase-types'
// frontend/modules/stock/components/SupplierListAppPos.tsx
import { cn } from '@/lib/utils'
import { Search, Truck, X } from 'lucide-react'
import { useState } from 'react'

interface SupplierListAppPosProps {
	suppliers: SuppliersResponse[]
	isLoading: boolean
	selectedId?: string | null
	onSelect: (supplier: SuppliersResponse | null) => void
	onClose?: () => void
}

export function SupplierListAppPos({
	suppliers,
	isLoading,
	selectedId,
	onSelect,
	onClose,
}: SupplierListAppPosProps) {
	const [search, setSearch] = useState('')

	const filtered = [...suppliers]
		.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
		.sort((a, b) => a.name.localeCompare(b.name, 'fr'))

	return (
		<div className='flex flex-col h-full'>
			<div className='p-3 border-b flex items-center justify-between shrink-0'>
				<span className='font-medium text-sm'>Fournisseurs</span>
				<div className='flex items-center gap-2'>
					<span className='text-xs text-muted-foreground'>
						{suppliers.length}
					</span>
					{onClose && (
						<button
							type='button'
							onClick={onClose}
							className='p-1 rounded hover:bg-accent transition-colors'
							title='Fermer'
						>
							<X className='h-3.5 w-3.5 text-muted-foreground' />
						</button>
					)}
				</div>
			</div>

			<div className='px-2 py-2 border-b shrink-0'>
				<div className='relative'>
					<Search className='absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none' />
					<Input
						placeholder='Rechercher...'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className='h-7 pl-7 text-xs'
					/>
				</div>
			</div>

			<div className='flex-1 overflow-y-auto p-2'>
				{isLoading ? (
					<p className='text-xs text-muted-foreground p-2'>Chargement...</p>
				) : (
					<>
						<button
							type='button'
							onClick={() => onSelect(null)}
							className={cn(
								'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-accent',
								selectedId === null && 'bg-accent font-medium',
							)}
						>
							<Truck className='h-4 w-4 shrink-0 text-muted-foreground' />
							<span className='truncate'>Tous les fournisseurs</span>
						</button>

						{filtered.map((supplier) => (
							<button
								key={supplier.id}
								type='button'
								onClick={() => onSelect(supplier)}
								title={supplier.name}
								className={cn(
									'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-accent',
									selectedId === supplier.id &&
										'bg-primary/15 text-primary font-medium',
								)}
							>
								<Truck className='h-4 w-4 shrink-0 text-orange-500' />
								<span className='truncate'>{supplier.name}</span>
							</button>
						))}

						{filtered.length === 0 && (
							<p className='text-xs text-muted-foreground p-2'>
								Aucun fournisseur
							</p>
						)}
					</>
				)}
			</div>
		</div>
	)
}
