import { Input } from '@/components/ui/input'
import type { BrandsResponse } from '@/lib/pocketbase-types'
// frontend/modules/stock/components/BrandListAppPos.tsx
import { cn } from '@/lib/utils'
import { Building2, Search, X } from 'lucide-react'
import { useState } from 'react'

interface BrandListAppPosProps {
	brands: BrandsResponse[]
	isLoading: boolean
	selectedId?: string | null
	onSelect: (brand: BrandsResponse | null) => void
	onClose?: () => void
}

export function BrandListAppPos({
	brands,
	isLoading,
	selectedId,
	onSelect,
	onClose,
}: BrandListAppPosProps) {
	const [search, setSearch] = useState('')

	const filtered = [...brands]
		.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
		.sort((a, b) => a.name.localeCompare(b.name, 'fr'))

	return (
		<div className='flex flex-col h-full'>
			<div className='p-3 border-b flex items-center justify-between shrink-0'>
				<span className='font-medium text-sm'>Marques</span>
				<div className='flex items-center gap-2'>
					<span className='text-xs text-muted-foreground'>{brands.length}</span>
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
							<Building2 className='h-4 w-4 shrink-0 text-muted-foreground' />
							<span className='truncate'>Toutes les marques</span>
						</button>

						{filtered.map((brand) => (
							<button
								key={brand.id}
								type='button'
								onClick={() => onSelect(brand)}
								title={brand.name}
								className={cn(
									'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-accent',
									selectedId === brand.id &&
										'bg-primary/15 text-primary font-medium',
								)}
							>
								<Building2 className='h-4 w-4 shrink-0 text-blue-500' />
								<span className='truncate'>{brand.name}</span>
							</button>
						))}

						{filtered.length === 0 && (
							<p className='text-xs text-muted-foreground p-2'>Aucune marque</p>
						)}
					</>
				)}
			</div>
		</div>
	)
}
