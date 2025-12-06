// frontend/modules/connect/components/CustomerDetailPage.tsx

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCustomer } from '@/lib/queries/customers'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Mail, Phone, User } from 'lucide-react'

export function CustomerDetailPage() {
	const { customerId } = useParams({
		from: '/connect/customers/$customerId/',
	})
	const { data: customer, isLoading } = useCustomer(customerId)
	const navigate = useNavigate()

	if (isLoading) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<p className='text-muted-foreground'>Chargement du client...</p>
			</div>
		)
	}

	if (!customer) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<p className='text-muted-foreground'>Client introuvable</p>
				<Button
					variant='outline'
					className='mt-4'
					onClick={() => navigate({ to: '/connect/customers' })}
				>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour aux clients
				</Button>
			</div>
		)
	}

	return (
		<div className='container mx-auto px-6 py-8 max-w-3xl'>
			{/* Header */}
			<div className='flex items-center gap-4 mb-6'>
				<Button
					variant='ghost'
					size='icon'
					onClick={() => navigate({ to: '/connect/customers' })}
				>
					<ArrowLeft className='h-5 w-5' />
				</Button>
				<div className='flex-1'>
					<h1 className='text-2xl font-bold flex items-center gap-2'>
						<User className='h-6 w-6' />
						{customer.name}
					</h1>
					<p className='text-muted-foreground'>Fiche détaillée du client</p>
				</div>
				<Button
					onClick={() =>
						navigate({
							to: '/connect/customers/$customerId/edit',
							params: () => ({ customerId }),
						})
					}
				>
					Modifier
				</Button>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Informations</CardTitle>
				</CardHeader>
				<CardContent className='space-y-4'>
					<div className='space-y-1'>
						<p className='text-sm text-muted-foreground'>Nom</p>
						<p className='font-medium'>{customer.name}</p>
					</div>

					<div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
						<div className='space-y-1'>
							<p className='text-sm text-muted-foreground'>Email</p>
							{customer.email ? (
								<a
									href={`mailto:${customer.email}`}
									className='flex items-center gap-2 text-blue-600 hover:underline'
								>
									<Mail className='h-4 w-4' />
									{customer.email}
								</a>
							) : (
								<p className='text-muted-foreground'>-</p>
							)}
						</div>
						<div className='space-y-1'>
							<p className='text-sm text-muted-foreground'>Téléphone</p>
							{customer.phone ? (
								<a
									href={`tel:${customer.phone}`}
									className='flex items-center gap-2 hover:underline'
								>
									<Phone className='h-4 w-4' />
									{customer.phone}
								</a>
							) : (
								<p className='text-muted-foreground'>-</p>
							)}
						</div>
					</div>

					<div className='space-y-1'>
						<p className='text-sm text-muted-foreground'>Entreprise</p>
						<p className='font-medium'>{customer.company || '-'}</p>
					</div>

					<div className='space-y-1'>
						<p className='text-sm text-muted-foreground'>Adresse</p>
						<p className='font-medium whitespace-pre-line'>
							{customer.address || '-'}
						</p>
					</div>

					<div className='space-y-1'>
						<p className='text-sm text-muted-foreground'>Notes</p>
						<p className='font-medium whitespace-pre-line'>
							{customer.notes || '-'}
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
