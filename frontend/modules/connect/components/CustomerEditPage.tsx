// frontend/modules/connect/components/CustomerEditPage.tsx

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
	type CustomerDto,
	useCustomer,
	useUpdateCustomer,
} from '@/lib/queries/customers'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, User } from 'lucide-react'
import { toast } from 'sonner'

// ─────────────────────────────────────────────
// Schéma de validation (même que CustomerDialog)
// ─────────────────────────────────────────────

const customerSchema = z.object({
	name: z
		.string()
		.min(2, 'Le nom doit contenir au moins 2 caractères')
		.max(100),
	email: z.string().email('Email invalide').optional().or(z.literal('')),
	phone: z.string().optional(),
	company: z.string().optional(),
	address: z.string().max(500, "L'adresse est trop longue").optional(),
	notes: z.string().optional(),
	// On garde un array dans le formulaire pour simplifier le Select
	tags: z.array(z.string()).optional(),
})

type CustomerFormValues = z.infer<typeof customerSchema>

// ─────────────────────────────────────────────
// Page d'édition de client
// ─────────────────────────────────────────────

export function CustomerEditPage() {
	const navigate = useNavigate()
	const { customerId } = useParams({
		from: '/connect/customers/$customerId/edit',
	})

	const { data: customer, isLoading } = useCustomer(customerId)
	const updateCustomer = useUpdateCustomer()

	const form = useForm<CustomerFormValues>({
		resolver: zodResolver(customerSchema),
		defaultValues: {
			name: '',
			email: '',
			phone: '',
			company: '',
			address: '',
			notes: '',
			tags: [],
		},
	})

	const { reset } = form

	// Quand les données arrivent, on pré-remplit le formulaire
	useEffect(() => {
		if (customer) {
			reset({
				name: customer.name ?? '',
				email: customer.email ?? '',
				phone: customer.phone ?? '',
				company: customer.company ?? '',
				address: customer.address ?? '',
				notes: customer.notes ?? '',
				tags: Array.isArray(customer.tags)
					? (customer.tags as unknown as string[])
					: customer.tags
						? [String(customer.tags)]
						: [],
			})
		}
	}, [customer, reset])

	const onSubmit = async (data: CustomerFormValues) => {
		if (!customer) return

		try {
			const singleTag = data.tags?.[0]

			const payload: Partial<CustomerDto> = {
				...data,
				tags: singleTag,
			}

			await updateCustomer.mutateAsync({ id: customer.id, data: payload })
			toast.success('Client modifié avec succès')
			navigate({ to: '/connect/customers' })
		} catch (error) {
			console.error(error)
			toast.error('Une erreur est survenue lors de la modification du client')
		}
	}

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
						Modifier le client
					</h1>
					<p className='text-muted-foreground'>
						Mettez à jour les informations du client.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{customer.name}</CardTitle>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
							{/* Nom */}
							<FormField
								control={form.control}
								name='name'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Nom *</FormLabel>
										<FormControl>
											<Input placeholder='Jean Dupont' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Email & téléphone */}
							<div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
								<FormField
									control={form.control}
									name='email'
									render={({ field }) => (
										<FormItem>
											<FormLabel>Email</FormLabel>
											<FormControl>
												<Input
													type='email'
													placeholder='contact@example.com'
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name='phone'
									render={({ field }) => (
										<FormItem>
											<FormLabel>Téléphone</FormLabel>
											<FormControl>
												<Input placeholder='+33 6 12 34 56 78' {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Entreprise */}
							<FormField
								control={form.control}
								name='company'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Entreprise</FormLabel>
										<FormControl>
											<Input placeholder="Nom de l'entreprise" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Adresse */}
							<FormField
								control={form.control}
								name='address'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Adresse</FormLabel>
										<FormControl>
											<Textarea
												placeholder='123 rue de la Paix, 75001 Paris'
												rows={3}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Statut / tags */}
							<FormField
								control={form.control}
								name='tags'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Statut</FormLabel>
										<Select
											onValueChange={(value) => field.onChange([value])}
											value={field.value?.[0] ?? ''}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder='Sélectionner un statut' />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value='prospect'>Prospect</SelectItem>
												<SelectItem value='actif'>Actif</SelectItem>
												<SelectItem value='vip'>VIP</SelectItem>
												<SelectItem value='inactif'>Inactif</SelectItem>
											</SelectContent>
										</Select>
										<FormDescription>Catégorisez votre client.</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Notes */}
							<FormField
								control={form.control}
								name='notes'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Notes</FormLabel>
										<FormControl>
											<Textarea
												placeholder='Notes internes sur le client.'
												rows={3}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Actions */}
							<div className='flex justify-end gap-3 pt-4'>
								<Button
									type='button'
									variant='outline'
									onClick={() => navigate({ to: '/connect/customers' })}
								>
									Annuler
								</Button>
								<Button type='submit' disabled={updateCustomer.isPending}>
									Enregistrer les modifications
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}
