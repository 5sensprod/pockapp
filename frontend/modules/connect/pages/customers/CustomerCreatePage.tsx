// frontend/modules/connect/components/CustomerCreatePage.tsx

import { zodResolver } from '@hookform/resolvers/zod'
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
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { type CustomerDto, useCreateCustomer } from '@/lib/queries/customers'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, User } from 'lucide-react'
import { toast } from 'sonner'
import { CustomerTagsPicker } from '../../features/customers/CustomerTagsPicker'

// ─────────────────────────────────────────────────
// Schéma de validation dynamique
// ─────────────────────────────────────────────────

const customerSchema = z
	.object({
		name: z
			.string()
			.min(2, 'Le nom doit contenir au moins 2 caractères')
			.max(100),
		email: z.string().email('Email invalide').optional().or(z.literal('')),
		phone: z.string().optional(),
		company: z.string().optional(),
		address: z.string().max(500, "L'adresse est trop longue").optional(),
		notes: z.string().optional(),
		tags: z.array(z.string()).optional(),
		customer_type: z
			.enum(['individual', 'professional', 'administration', 'association'])
			.optional(),
		payment_terms: z
			.enum(['immediate', '30_days', '45_days', '60_days'])
			.optional(),
	})
	.superRefine((data, ctx) => {
		// Adresse obligatoire pour pro/admin/association
		const requiresAddress = [
			'professional',
			'administration',
			'association',
		].includes(data.customer_type || '')
		if (requiresAddress && !data.address?.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "L'adresse est obligatoire pour ce type de client",
				path: ['address'],
			})
		}
	})

type CustomerFormValues = z.infer<typeof customerSchema>

// ─────────────────────────────────────────────────
// Page de création de client
// ─────────────────────────────────────────────────

export function CustomerCreatePage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()
	const createCustomer = useCreateCustomer()

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
			customer_type: 'individual',
			payment_terms: 'immediate',
		},
	})

	const customerType = form.watch('customer_type')
	const isIndividual = customerType === 'individual'
	const requiresPaymentTerms = [
		'professional',
		'administration',
		'association',
	].includes(customerType || '')

	const onSubmit = async (data: CustomerFormValues) => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise active sélectionnée')
			return
		}

		try {
			const payload: CustomerDto = {
				...data,
				tags: data.tags,
				owner_company: activeCompanyId,
				// Ne pas envoyer payment_terms si particulier
				payment_terms: isIndividual ? undefined : data.payment_terms,
			}

			const result = await createCustomer.mutateAsync(payload)
			toast.success('Client créé avec succès')
			navigate({
				to: '/connect/customers/$customerId',
				params: { customerId: result.id },
			})
		} catch (error) {
			console.error(error)
			toast.error('Une erreur est survenue lors de la création du client')
		}
	}

	return (
		<div className='container mx-auto max-w-4xl px-6 py-3'>
			{/* Header */}
			<div className='mb-3 flex items-center gap-3'>
				<Button
					variant='ghost'
					size='icon'
					className='h-8 w-8'
					onClick={() => navigate({ to: '/connect/customers' })}
				>
					<ArrowLeft className='h-4 w-4' />
				</Button>
				<div className='flex-1'>
					<h1
						className='flex items-center gap-2 text-lg font-bold'
						title='Ajoutez un nouveau client à votre base.'
					>
						<User className='h-5 w-5' />
						Nouveau client
					</h1>
				</div>
			</div>

			<Card className='shadow-sm'>
				<CardHeader className='border-b bg-muted/20 px-3 py-1.5'>
					<CardTitle className='text-sm font-semibold'>
						Informations du client
					</CardTitle>
				</CardHeader>
				<CardContent className='p-3 [&_input]:h-8 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-muted-foreground [&_[role=combobox]]:h-8'>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className='grid gap-x-3 gap-y-2 sm:grid-cols-2'>
							{/* Type de client */}
							<FormField
								control={form.control}
								name='customer_type'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Type de client *</FormLabel>
										<Select
											onValueChange={field.onChange}
											value={field.value || 'individual'}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder='Sélectionner un type' />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value='individual'>Particulier</SelectItem>
												<SelectItem value='professional'>
													Professionnel
												</SelectItem>
												<SelectItem value='administration'>
													Administration
												</SelectItem>
												<SelectItem value='association'>Association</SelectItem>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>

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
							<div className='contents'>
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

							{/* Entreprise - masqué pour les particuliers */}
							{!isIndividual && (
								<FormField
									control={form.control}
									name='company'
									render={({ field }) => (
										<FormItem>
											<FormLabel>Entreprise / Organisation</FormLabel>
											<FormControl>
												<Input placeholder="Nom de l'entreprise" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							{/* Adresse - obligatoire pour pro/admin/association */}
							<FormField
								control={form.control}
								name='address'
								render={({ field }) => (
									<FormItem className='sm:col-span-2'>
										<FormLabel>Adresse {!isIndividual && '*'}</FormLabel>
										<FormControl>
											<Textarea
												placeholder='123 rue de la Paix, 75001 Paris'
												rows={2}
												{...field}
											/>
										</FormControl>
										{!isIndividual && (
											<FormDescription>
												Obligatoire pour les professionnels, administrations et
												associations
											</FormDescription>
										)}
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Délai de paiement - uniquement pour pro/admin/association */}
							{requiresPaymentTerms && (
								<FormField
									control={form.control}
									name='payment_terms'
									render={({ field }) => (
										<FormItem>
											<FormLabel>Délai de paiement</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value || 'immediate'}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder='Sélectionner un délai' />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value='immediate'>Immédiat</SelectItem>
													<SelectItem value='30_days'>30 jours</SelectItem>
													<SelectItem value='45_days'>45 jours</SelectItem>
													<SelectItem value='60_days'>60 jours</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							{/* Tags */}
							<FormField
								control={form.control}
								name='tags'
								render={({ field }) => (
									<FormItem className='sm:col-span-2'>
										<FormLabel>Tags</FormLabel>
										<CustomerTagsPicker
											value={field.value}
											onChange={field.onChange}
										/>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Notes */}
							<FormField
								control={form.control}
								name='notes'
								render={({ field }) => (
									<FormItem className='sm:col-span-2'>
										<FormLabel>Notes</FormLabel>
										<FormControl>
											<Textarea
												placeholder='Notes internes sur le client.'
												rows={2}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Actions */}
							<div className='flex justify-end gap-2 pt-1 sm:col-span-2'>
								<Button
									type='button'
									variant='outline'
									onClick={() => navigate({ to: '/connect/customers' })}
								>
									Annuler
								</Button>
								<Button type='submit' disabled={createCustomer.isPending}>
									Créer le client
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}
