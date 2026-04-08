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
			const singleTag = data.tags?.[0]

			const payload: CustomerDto = {
				...data,
				tags: singleTag,
				owner_company: activeCompanyId,
				// Ne pas envoyer payment_terms si particulier
				payment_terms: isIndividual ? undefined : data.payment_terms,
			}

			await createCustomer.mutateAsync(payload)
			toast.success('Client créé avec succès')
			navigate({ to: '/connect/customers' })
		} catch (error) {
			console.error(error)
			toast.error('Une erreur est survenue lors de la création du client')
		}
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
						Nouveau client
					</h1>
					<p className='text-muted-foreground'>
						Ajoutez un nouveau client à votre base.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Informations du client</CardTitle>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
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
										<FormDescription>
											Détermine les mentions légales et la gestion du client.
										</FormDescription>
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
									<FormItem>
										<FormLabel>Adresse {!isIndividual && '*'}</FormLabel>
										<FormControl>
											<Textarea
												placeholder='123 rue de la Paix, 75001 Paris'
												rows={3}
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
											<FormDescription>
												Délai de paiement accordé à ce client
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

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
