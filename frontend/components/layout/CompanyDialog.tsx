import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CompaniesResponse } from '@/lib/pocketbase-types'
import {
	type CompanyDto,
	useCompany,
	useCreateCompany,
	useUpdateCompany,
} from '@/lib/queries/companies'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'

const companySchema = z.object({
	name: z.string().min(1, 'Le nom est obligatoire'),
	trade_name: z.string().optional(),

	email: z.string().email('Email invalide').optional().or(z.literal('')),
	phone: z.string().optional(),
	website: z.string().url('URL invalide').optional().or(z.literal('')),

	address_line1: z.string().optional(),
	address_line2: z.string().optional(),
	zip_code: z.string().optional(),
	city: z.string().optional(),
	country: z.string().optional(),

	siren: z
		.string()
		.regex(/^\d{9}$/, 'Le SIREN doit contenir 9 chiffres')
		.optional()
		.or(z.literal('')),
	siret: z
		.string()
		.regex(/^\d{14}$/, 'Le SIRET doit contenir 14 chiffres')
		.optional()
		.or(z.literal('')),
	vat_number: z.string().optional(),

	legal_form: z.string().optional(),
	rcs: z.string().optional(),
	ape_naf: z.string().optional(),
	share_capital: z
		.preprocess(
			(v) => (v === '' || v == null ? undefined : Number(v)),
			z.number().nonnegative().optional(),
		)
		.optional(),

	bank_name: z.string().optional(),
	iban: z.string().optional(),
	bic: z.string().optional(),
	account_holder: z.string().optional(),

	default_payment_terms_days: z
		.preprocess(
			(v) => (v === '' || v == null ? undefined : Number(v)),
			z.number().int().nonnegative().max(365).optional(),
		)
		.optional(),
	default_payment_method: z
		.enum(['virement', 'cb', 'especes', 'cheque', 'autre'])
		.optional()
		.or(z.literal('')),
	invoice_footer: z.string().optional(),
	invoice_prefix: z.string().optional(),
})

type CompanyFormValues = z.infer<typeof companySchema>

interface CompanyDialogProps {
	isOpen: boolean
	onOpenChange: (open: boolean) => void
	companyId: string | null
}

export function CompanyDialog({
	isOpen,
	onOpenChange,
	companyId,
}: CompanyDialogProps) {
	const pb = usePocketBase()
	const isEditMode = useMemo(() => !!companyId, [companyId])
	const fileInputRef = useRef<HTMLInputElement>(null)

	// État pour le logo
	const [logoFile, setLogoFile] = useState<File | null>(null)
	const [logoPreview, setLogoPreview] = useState<string | null>(null)
	const [removeLogo, setRemoveLogo] = useState(false)

	const { data: companyData, isLoading: isCompanyLoading } = useCompany(
		companyId ?? undefined,
	)

	const createCompany = useCreateCompany()
	const updateCompany = useUpdateCompany()

	const form = useForm({
		resolver: zodResolver(companySchema),
		defaultValues: {
			name: '',
			trade_name: '',
			email: '',
			phone: '',
			website: '',
			address_line1: '',
			address_line2: '',
			zip_code: '',
			city: '',
			country: '',
			siren: '',
			siret: '',
			vat_number: '',
			legal_form: '',
			rcs: '',
			ape_naf: '',
			share_capital: undefined,
			bank_name: '',
			iban: '',
			bic: '',
			account_holder: '',
			default_payment_terms_days: undefined,
			default_payment_method: undefined,
			invoice_footer: '',
			invoice_prefix: '',
		},
	})

	// Remplir le formulaire en mode édition
	useEffect(() => {
		if (isEditMode && companyData) {
			const c = companyData as CompaniesResponse
			form.reset({
				name: c.name ?? '',
				trade_name: c.trade_name ?? '',
				email: c.email ?? '',
				phone: c.phone ?? '',
				website: c.website ?? '',
				address_line1: c.address_line1 ?? '',
				address_line2: c.address_line2 ?? '',
				zip_code: c.zip_code ?? '',
				city: c.city ?? '',
				country: c.country ?? '',
				siren: c.siren ?? '',
				siret: c.siret ?? '',
				vat_number: c.vat_number ?? '',
				legal_form: c.legal_form ?? '',
				rcs: c.rcs ?? '',
				ape_naf: c.ape_naf ?? '',
				share_capital: c.share_capital ?? undefined,
				bank_name: c.bank_name ?? '',
				iban: c.iban ?? '',
				bic: c.bic ?? '',
				account_holder: c.account_holder ?? '',
				default_payment_terms_days: c.default_payment_terms_days ?? undefined,
				default_payment_method: c.default_payment_method ?? undefined,
				invoice_footer: c.invoice_footer ?? '',
				invoice_prefix: c.invoice_prefix ?? '',
			})

			// Charger le logo existant
			if (c.logo) {
				const logoUrl = pb.files.getUrl(c, c.logo)
				setLogoPreview(logoUrl)
			} else {
				setLogoPreview(null)
			}
			setLogoFile(null)
			setRemoveLogo(false)
		}

		// En création : tout à vide
		if (!isEditMode && isOpen) {
			form.reset({
				name: '',
				trade_name: '',
				email: '',
				phone: '',
				website: '',
				address_line1: '',
				address_line2: '',
				zip_code: '',
				city: '',
				country: '',
				siren: '',
				siret: '',
				vat_number: '',
				legal_form: '',
				rcs: '',
				ape_naf: '',
				share_capital: undefined,
				bank_name: '',
				iban: '',
				bic: '',
				account_holder: '',
				default_payment_terms_days: undefined,
				default_payment_method: undefined,
				invoice_footer: '',
				invoice_prefix: '',
			})
			setLogoFile(null)
			setLogoPreview(null)
			setRemoveLogo(false)
		}
	}, [isEditMode, companyData, form, isOpen, pb])

	// Gestion de l'upload de fichier
	const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		// Vérifier le type
		const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
		if (!allowedTypes.includes(file.type)) {
			toast.error('Format non supporté. Utilisez JPG, PNG ou WebP.')
			return
		}

		// Vérifier la taille (5 Mo max)
		if (file.size > 5 * 1024 * 1024) {
			toast.error('Le fichier est trop volumineux (max 5 Mo)')
			return
		}

		setLogoFile(file)
		setRemoveLogo(false)

		// Créer un aperçu
		const reader = new FileReader()
		reader.onloadend = () => {
			setLogoPreview(reader.result as string)
		}
		reader.readAsDataURL(file)
	}, [])

	const handleRemoveLogo = useCallback(() => {
		setLogoFile(null)
		setLogoPreview(null)
		setRemoveLogo(true)
		if (fileInputRef.current) {
			fileInputRef.current.value = ''
		}
	}, [])

	const handleLogoClick = () => {
		fileInputRef.current?.click()
	}

	// const handleLogoKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
	// 	if (e.key === 'Enter' || e.key === ' ') {
	// 		fileInputRef.current?.click()
	// 	}
	// }

	const isSubmitting = createCompany.isPending || updateCompany.isPending

	const onSubmit = async (values: CompanyFormValues) => {
		const payload: CompanyDto & { logo?: File | null; removeLogo?: boolean } = {
			...values,
			email: values.email || undefined,
			website: values.website || undefined,
			siren: values.siren || undefined,
			siret: values.siret || undefined,
			vat_number: values.vat_number || undefined,
			default_payment_method:
				(values.default_payment_method as CompanyDto['default_payment_method']) ||
				undefined,
			logo: logoFile,
			removeLogo,
		}

		try {
			if (isEditMode && companyId) {
				await updateCompany.mutateAsync({ id: companyId, data: payload })
				toast.success('Entreprise mise à jour')
			} else {
				await createCompany.mutateAsync(payload)
				toast.success('Entreprise créée')
			}
			onOpenChange(false)
		} catch (error: unknown) {
			console.error('Erreur:', error)

			let errorMessage = "Une erreur est survenue lors de l'enregistrement"

			if (error && typeof error === 'object') {
				const err = error as Record<string, unknown>

				if (err.response && typeof err.response === 'object') {
					const response = err.response as Record<string, unknown>
					if (response.message) {
						errorMessage = String(response.message)
					}
					if (response.data && typeof response.data === 'object') {
						const fieldErrors = Object.entries(
							response.data as Record<string, { message?: string }>,
						)
							.map(
								([field, detail]) =>
									`${field}: ${detail?.message || 'invalide'}`,
							)
							.join(', ')
						if (fieldErrors) {
							errorMessage = fieldErrors
						}
					}
				} else if (err.message) {
					errorMessage = String(err.message)
				}
			}

			toast.error(errorMessage)
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-3xl'>
				<DialogHeader>
					<DialogTitle>
						{isEditMode ? 'Modifier une entreprise' : 'Ajouter une entreprise'}
					</DialogTitle>
					<DialogDescription>
						Renseigne les informations légales et de contact de ton entreprise.
					</DialogDescription>
				</DialogHeader>
				<form
					className='space-y-6 max-h-[70vh] overflow-y-auto pr-1 pl-1'
					onSubmit={form.handleSubmit(onSubmit)}
				>
					{/* Logo */}
					<section className='space-y-3'>
						<h3 className='text-sm font-semibold text-muted-foreground'>
							Logo
						</h3>
						<div className='flex items-center gap-4'>
							{/* Aperçu */}
							<button
								type='button'
								className={cn(
									'relative w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center overflow-hidden',
									'bg-muted/50 hover:bg-muted/80 transition-colors cursor-pointer',
									logoPreview && 'border-solid border-primary/30',
								)}
								onClick={handleLogoClick}
								disabled={isSubmitting || isCompanyLoading}
							>
								{logoPreview ? (
									<img
										src={logoPreview}
										alt='Logo'
										className='w-full h-full object-contain'
									/>
								) : (
									<ImagePlus className='w-8 h-8 text-muted-foreground' />
								)}
							</button>

							{/* Actions */}
							<div className='flex flex-col gap-2'>
								<input
									ref={fileInputRef}
									type='file'
									accept='image/jpeg,image/png,image/webp'
									onChange={handleFileChange}
									className='hidden'
									disabled={isSubmitting || isCompanyLoading}
								/>
								<Button
									type='button'
									variant='outline'
									size='sm'
									onClick={handleLogoClick}
									disabled={isSubmitting || isCompanyLoading}
								>
									<Upload className='w-4 h-4 mr-2' />
									{logoPreview ? 'Changer' : 'Importer'}
								</Button>
								{logoPreview && (
									<Button
										type='button'
										variant='ghost'
										size='sm'
										onClick={handleRemoveLogo}
										disabled={isSubmitting || isCompanyLoading}
										className='text-destructive hover:text-destructive'
									>
										<Trash2 className='w-4 h-4 mr-2' />
										Supprimer
									</Button>
								)}
							</div>

							<p className='text-xs text-muted-foreground'>
								JPG, PNG ou WebP. Max 5 Mo.
							</p>
						</div>
					</section>

					{/* Identité */}
					<section className='space-y-3'>
						<h3 className='text-sm font-semibold text-muted-foreground'>
							Identité
						</h3>
						<div className='grid gap-3 md:grid-cols-2'>
							<div className='space-y-1.5'>
								<Label htmlFor='name'>Raison sociale *</Label>
								<Input
									id='name'
									{...form.register('name')}
									disabled={isSubmitting || isCompanyLoading}
								/>
								{form.formState.errors.name && (
									<p className='text-xs text-red-600'>
										{form.formState.errors.name.message}
									</p>
								)}
							</div>

							<div className='space-y-1.5'>
								<Label htmlFor='trade_name'>Nom commercial</Label>
								<Input
									id='trade_name'
									{...form.register('trade_name')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
						</div>
					</section>

					{/* Contact */}
					<section className='space-y-3'>
						<h3 className='text-sm font-semibold text-muted-foreground'>
							Contact
						</h3>
						<div className='grid gap-3 md:grid-cols-2'>
							<div className='space-y-1.5'>
								<Label htmlFor='email'>Email</Label>
								<Input
									id='email'
									type='email'
									{...form.register('email')}
									disabled={isSubmitting || isCompanyLoading}
								/>
								{form.formState.errors.email && (
									<p className='text-xs text-red-600'>
										{form.formState.errors.email.message}
									</p>
								)}
							</div>

							<div className='space-y-1.5'>
								<Label htmlFor='phone'>Téléphone</Label>
								<Input
									id='phone'
									{...form.register('phone')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>

							<div className='space-y-1.5'>
								<Label htmlFor='website'>Site web</Label>
								<Input
									id='website'
									{...form.register('website')}
									disabled={isSubmitting || isCompanyLoading}
								/>
								{form.formState.errors.website && (
									<p className='text-xs text-red-600'>
										{form.formState.errors.website.message}
									</p>
								)}
							</div>
						</div>

						<div className='grid gap-3 md:grid-cols-2'>
							<div className='space-y-1.5'>
								<Label htmlFor='address_line1'>Adresse</Label>
								<Input
									id='address_line1'
									{...form.register('address_line1')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='address_line2'>Complément</Label>
								<Input
									id='address_line2'
									{...form.register('address_line2')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
						</div>

						<div className='grid gap-3 md:grid-cols-3'>
							<div className='space-y-1.5'>
								<Label htmlFor='zip_code'>Code postal</Label>
								<Input
									id='zip_code'
									{...form.register('zip_code')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='city'>Ville</Label>
								<Input
									id='city'
									{...form.register('city')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='country'>Pays</Label>
								<Input
									id='country'
									{...form.register('country')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
						</div>
					</section>

					{/* Légal */}
					<section className='space-y-3'>
						<h3 className='text-sm font-semibold text-muted-foreground'>
							Informations légales
						</h3>

						<div className='grid gap-3 md:grid-cols-3'>
							<div className='space-y-1.5'>
								<Label htmlFor='siren'>SIREN</Label>
								<Input
									id='siren'
									{...form.register('siren')}
									disabled={isSubmitting || isCompanyLoading}
								/>
								{form.formState.errors.siren && (
									<p className='text-xs text-red-600'>
										{form.formState.errors.siren.message}
									</p>
								)}
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='siret'>SIRET</Label>
								<Input
									id='siret'
									{...form.register('siret')}
									disabled={isSubmitting || isCompanyLoading}
								/>
								{form.formState.errors.siret && (
									<p className='text-xs text-red-600'>
										{form.formState.errors.siret.message}
									</p>
								)}
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='vat_number'>N° TVA intracom.</Label>
								<Input
									id='vat_number'
									{...form.register('vat_number')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
						</div>

						<div className='grid gap-3 md:grid-cols-3'>
							<div className='space-y-1.5'>
								<Label htmlFor='legal_form'>Forme juridique</Label>
								<Input
									id='legal_form'
									{...form.register('legal_form')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='rcs'>RCS</Label>
								<Input
									id='rcs'
									{...form.register('rcs')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='ape_naf'>Code APE / NAF</Label>
								<Input
									id='ape_naf'
									{...form.register('ape_naf')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
						</div>

						<div className='grid gap-3 md:grid-cols-3'>
							<div className='space-y-1.5'>
								<Label htmlFor='share_capital'>Capital social (€)</Label>
								<Input
									id='share_capital'
									type='number'
									step='0.01'
									{...form.register('share_capital')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
						</div>
					</section>

					{/* Bancaire & facturation */}
					<section className='space-y-3'>
						<h3 className='text-sm font-semibold text-muted-foreground'>
							Bancaire & facturation
						</h3>

						<div className='grid gap-3 md:grid-cols-2'>
							<div className='space-y-1.5'>
								<Label htmlFor='bank_name'>Banque</Label>
								<Input
									id='bank_name'
									{...form.register('bank_name')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='account_holder'>Titulaire du compte</Label>
								<Input
									id='account_holder'
									{...form.register('account_holder')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
						</div>

						<div className='grid gap-3 md:grid-cols-2'>
							<div className='space-y-1.5'>
								<Label htmlFor='iban'>IBAN</Label>
								<Input
									id='iban'
									{...form.register('iban')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='bic'>BIC</Label>
								<Input
									id='bic'
									{...form.register('bic')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
						</div>

						<div className='grid gap-3 md:grid-cols-3'>
							<div className='space-y-1.5'>
								<Label htmlFor='default_payment_terms_days'>
									Délai de paiement (jours)
								</Label>
								<Input
									id='default_payment_terms_days'
									type='number'
									{...form.register('default_payment_terms_days')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='default_payment_method'>
									Moyen de paiement par défaut
								</Label>
								<Input
									id='default_payment_method'
									placeholder='virement, cb...'
									{...form.register('default_payment_method')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='invoice_prefix'>Préfixe facture</Label>
								<Input
									id='invoice_prefix'
									{...form.register('invoice_prefix')}
									disabled={isSubmitting || isCompanyLoading}
								/>
							</div>
						</div>

						<div className='space-y-1.5'>
							<Label htmlFor='invoice_footer'>Pied de facture / mentions</Label>
							<Textarea
								id='invoice_footer'
								rows={3}
								{...form.register('invoice_footer')}
								disabled={isSubmitting || isCompanyLoading}
								className={cn('resize-none')}
							/>
						</div>
					</section>

					<div className='flex justify-end gap-2 pt-2'>
						<Button
							type='button'
							variant='outline'
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							Annuler
						</Button>
						<Button type='submit' disabled={isSubmitting}>
							{isEditMode ? 'Enregistrer' : 'Créer'}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	)
}
