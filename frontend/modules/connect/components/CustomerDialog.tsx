import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
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
import {
	type CustomerDto,
	useCreateCustomer,
	useUpdateCustomer,
} from '@/lib/queries/customers'
import { toast } from 'sonner'

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
	// On garde un array dans le formulaire pour simplifier le Select,
	// on le convertira en string pour l'API PocketBase
	tags: z.array(z.string()).optional(),
})

export type CustomerFormValues = z.infer<typeof customerSchema>

// Correspond mieux au schéma PocketBase (tags: string)
export interface Customer {
	id: string
	name: string
	email?: string
	phone?: string
	company?: string
	address?: string
	notes?: string
	tags?: string // string côté API, qu'on adapte à un array dans le form
}

interface CustomerDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	customer?: Customer | null
}

export function CustomerDialog({
	open,
	onOpenChange,
	customer = null,
}: CustomerDialogProps) {
	const isEdit = !!customer
	const createCustomer = useCreateCustomer()
	const updateCustomer = useUpdateCustomer()
	const { activeCompanyId } = useActiveCompany()

	const form = useForm<CustomerFormValues>({
		resolver: zodResolver(customerSchema),
		defaultValues: {
			name: customer?.name ?? '',
			email: customer?.email ?? '',
			phone: customer?.phone ?? '',
			company: customer?.company ?? '',
			address: customer?.address ?? '',
			notes: customer?.notes ?? '',
			// PB stocke un string, on le met dans un array pour le Select
			tags: customer?.tags ? [customer.tags] : [],
		},
	})

	const onSubmit = async (data: CustomerFormValues) => {
		try {
			if (isEdit && customer) {
				// Pour l’update : on convertit tags[] -> string
				const payload: Partial<CustomerDto> = {
					...data,
					tags: data.tags?.[0], // string | undefined
				}

				await updateCustomer.mutateAsync({ id: customer.id, data: payload })
				toast.success('Client modifié avec succès')
			} else {
				if (!activeCompanyId) {
					toast.error('Aucune entreprise active sélectionnée')
					return
				}

				// Pour la création : on ajoute owner_company + conversion des tags
				const payload: CustomerDto = {
					...data,
					tags: data.tags?.[0], // string | undefined
					owner_company: activeCompanyId, // id de l’entreprise courante
				}

				await createCustomer.mutateAsync(payload)
				toast.success('Client créé avec succès')
			}

			onOpenChange(false)
			form.reset()
		} catch (error) {
			console.error(error)
			toast.error('Une erreur est survenue')
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
				<DialogHeader>
					<DialogTitle>
						{isEdit ? 'Modifier le client' : 'Nouveau client'}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? 'Modifiez les informations du client'
							: 'Ajoutez un nouveau client à votre base'}
					</DialogDescription>
				</DialogHeader>

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
						<div className='grid grid-cols-2 gap-4'>
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

						{/* Entreprise (nom libre, rien à voir avec owner_company) */}
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
										defaultValue={field.value?.[0]}
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
									<FormDescription>Catégorisez votre client</FormDescription>
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
											placeholder='Notes internes sur le client...'
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
								onClick={() => {
									onOpenChange(false)
									form.reset()
								}}
							>
								Annuler
							</Button>
							<Button
								type='submit'
								disabled={createCustomer.isPending || updateCustomer.isPending}
							>
								{isEdit ? 'Modifier' : 'Créer'}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
