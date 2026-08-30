// frontend/modules/connect/pages/invoices/sections/InvoiceCustomerCard.tsx
//
// Le client du document. Extrait tel quel de InvoiceDetailPage : aucun
// changement de rendu.

import { Card, CardContent } from '@/components/ui/card'
import type { CustomerExpand } from '@/lib/types/invoice.types'

interface Props {
	customer: CustomerExpand | null
	onOpenCustomer: (customerId: string) => void
}

export function InvoiceCustomerCard({ customer, onOpenCustomer }: Props) {
	return (
		<Card>
			<CardContent className='p-6'>
				{customer ? (
					<div className='space-y-2'>
						<button
							type='button'
							className='font-semibold text-foreground hover:text-primary hover:underline text-left'
							onClick={() => onOpenCustomer(customer.id)}
						>
							{customer.name}
						</button>
						{customer.company && (
							<p className='text-sm text-muted-foreground'>
								{customer.company}
							</p>
						)}
						{customer.email && (
							<p className='text-sm text-muted-foreground'>{customer.email}</p>
						)}
						{customer.phone && (
							<p className='text-sm text-muted-foreground'>{customer.phone}</p>
						)}
						{customer.address && (
							<p className='text-sm text-muted-foreground'>
								{customer.address}
							</p>
						)}
					</div>
				) : (
					<p className='text-muted-foreground'>Client inconnu</p>
				)}
			</CardContent>
		</Card>
	)
}
