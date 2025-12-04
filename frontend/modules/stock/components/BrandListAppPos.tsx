// frontend/modules/stock/components/BrandListAppPos.tsx
// Liste des marques pour AppPOS (lecture seule)

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { RefreshCw, Building2 } from 'lucide-react'
import { useState } from 'react'

import type { BrandsResponse } from '@/lib/pocketbase-types'

interface BrandListAppPosProps {
	brands: BrandsResponse[]
	isLoading: boolean
}

export function BrandListAppPos({ brands, isLoading }: BrandListAppPosProps) {
	const [searchTerm, setSearchTerm] = useState('')

	const filteredBrands = brands.filter((brand) =>
		brand.name.toLowerCase().includes(searchTerm.toLowerCase()),
	)

	if (isLoading) {
		return (
			<div className='text-center py-12 text-muted-foreground'>
				<RefreshCw className='h-6 w-6 animate-spin mx-auto mb-2' />
				Chargement des marques...
			</div>
		)
	}

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-4'>
				<div className='flex-1 max-w-md'>
					<Input
						placeholder='Rechercher une marque...'
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
					/>
				</div>
				<Badge variant='outline'>
					{filteredBrands.length} marque(s)
				</Badge>
			</div>

			<div className='rounded-md border'>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Marque</TableHead>
							<TableHead>Description</TableHead>
							<TableHead className='text-right'>ID AppPOS</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredBrands.length === 0 ? (
							<TableRow>
								<TableCell colSpan={3} className='h-24 text-center'>
									Aucune marque trouvée
								</TableCell>
							</TableRow>
						) : (
							filteredBrands.map((brand) => (
								<TableRow key={brand.id}>
									<TableCell>
										<div className='flex items-center gap-2'>
											<Building2 className='h-4 w-4 text-blue-500' />
											<span className='font-medium'>{brand.name}</span>
										</div>
									</TableCell>
									<TableCell className='text-muted-foreground'>
										{brand.description || '-'}
									</TableCell>
									<TableCell className='text-right'>
										<code className='text-xs bg-muted px-1 py-0.5 rounded'>
											{brand.id}
										</code>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	)
}
