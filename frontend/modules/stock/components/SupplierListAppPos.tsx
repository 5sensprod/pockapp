// frontend/modules/stock/components/SupplierListAppPos.tsx
// Liste des fournisseurs pour AppPOS (lecture seule)

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Mail, Phone, RefreshCw, Truck } from 'lucide-react'
import { useState } from 'react'

import type { SuppliersResponse } from '@/lib/pocketbase-types'

interface SupplierListAppPosProps {
	suppliers: SuppliersResponse[]
	isLoading: boolean
}

export function SupplierListAppPos({
	suppliers,
	isLoading,
}: SupplierListAppPosProps) {
	const [searchTerm, setSearchTerm] = useState('')

	const filteredSuppliers = suppliers.filter((supplier) =>
		supplier.name.toLowerCase().includes(searchTerm.toLowerCase()),
	)

	if (isLoading) {
		return (
			<div className='text-center py-12 text-muted-foreground'>
				<RefreshCw className='h-6 w-6 animate-spin mx-auto mb-2' />
				Chargement des fournisseurs...
			</div>
		)
	}

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-4'>
				<div className='flex-1 max-w-md'>
					<Input
						placeholder='Rechercher un fournisseur...'
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
					/>
				</div>
				<Badge variant='outline'>
					{filteredSuppliers.length} fournisseur(s)
				</Badge>
			</div>

			<div className='rounded-md border'>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Fournisseur</TableHead>
							<TableHead>Contact</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Téléphone</TableHead>
							<TableHead className='text-right'>ID AppPOS</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredSuppliers.length === 0 ? (
							<TableRow>
								<TableCell colSpan={5} className='h-24 text-center'>
									Aucun fournisseur trouvé
								</TableCell>
							</TableRow>
						) : (
							filteredSuppliers.map((supplier) => (
								<TableRow key={supplier.id}>
									<TableCell>
										<div className='flex items-center gap-2'>
											<Truck className='h-4 w-4 text-orange-500' />
											<span className='font-medium'>{supplier.name}</span>
										</div>
									</TableCell>
									<TableCell className='text-muted-foreground'>
										{supplier.contact || '-'}
									</TableCell>
									<TableCell>
										{supplier.email ? (
											<div className='flex items-center gap-1 text-sm'>
												<Mail className='h-3 w-3' />
												{supplier.email}
											</div>
										) : (
											<span className='text-muted-foreground'>-</span>
										)}
									</TableCell>
									<TableCell>
										{supplier.phone ? (
											<div className='flex items-center gap-1 text-sm'>
												<Phone className='h-3 w-3' />
												{supplier.phone}
											</div>
										) : (
											<span className='text-muted-foreground'>-</span>
										)}
									</TableCell>
									<TableCell className='text-right'>
										<code className='text-xs bg-muted px-1 py-0.5 rounded'>
											{supplier.id}
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
