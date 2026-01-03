// frontend/components/settings/CompanyManagement.tsx
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
	type Company,
	type CompanyDto,
	getLogoUrl,
	useCompanies,
	useCreateCompany,
	useDeleteCompany,
	useUpdateCompany,
} from '@/lib/queries/companies'
import { usePocketBase } from '@/lib/use-pocketbase'
import {
	Building2,
	Camera,
	CheckCircle,
	CreditCard,
	FileText,
	ImagePlus,
	Loader2,
	MapPin,
	Pencil,
	Plus,
	ShieldAlert,
	Trash2,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

interface FormDataWithLogo extends CompanyDto {
	logoFile?: File | null
	logoPreview?: string | null
	removeLogo?: boolean
	existingLogo?: string
}

const emptyFormData: FormDataWithLogo = {
	name: '',
	trade_name: '',
	active: true,
	is_default: false,
	email: '',
	phone: '',
	website: '',
	address_line1: '',
	address_line2: '',
	zip_code: '',
	city: '',
	country: 'France',
	siren: '',
	siret: '',
	vat_number: '',
	legal_form: '',
	rcs: '',
	ape_naf: '',
	share_capital: 0,
	bank_name: '',
	iban: '',
	bic: '',
	account_holder: '',
	default_payment_terms_days: 30,
	default_payment_method: 'virement',
	invoice_footer: '',
	invoice_prefix: '',
	logoFile: null,
	logoPreview: null,
	removeLogo: false,
	existingLogo: '',
}

export default function CompanyManagement() {
	const pb = usePocketBase()
	const fileInputRef = useRef<HTMLInputElement>(null)

	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null)
	const [editingCompany, setEditingCompany] = useState<Company | null>(null)
	const [formData, setFormData] = useState<FormDataWithLogo>(emptyFormData)

	// Queries
	const { data: companies = [], isLoading, error } = useCompanies()
	const createCompany = useCreateCompany()
	const updateCompany = useUpdateCompany()
	const deleteCompany = useDeleteCompany()

	// Gestion de l'upload de logo
	const handleLogoChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
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

			// Créer un aperçu
			const reader = new FileReader()
			reader.onloadend = () => {
				setFormData((prev) => ({
					...prev,
					logoFile: file,
					logoPreview: reader.result as string,
					removeLogo: false,
				}))
			}
			reader.readAsDataURL(file)
		},
		[],
	)

	const handleRemoveLogo = useCallback(() => {
		setFormData((prev) => ({
			...prev,
			logoFile: null,
			logoPreview: null,
			removeLogo: true,
		}))
		if (fileInputRef.current) {
			fileInputRef.current.value = ''
		}
	}, [])

	// ✅ Obtenir l'URL du logo à afficher (utilisé dans le Dialog)
	const displayLogoUrl = useMemo((): string | null => {
		if (formData.removeLogo) return null
		if (formData.logoPreview) return formData.logoPreview
		if (editingCompany?.logo) {
			return getLogoUrl(pb, editingCompany)
		}
		return null
	}, [formData.removeLogo, formData.logoPreview, editingCompany, pb])

	// Ouvrir le dialog pour créer
	const handleCreate = () => {
		setEditingCompanyId(null)
		setEditingCompany(null)
		setFormData(emptyFormData)
		setIsDialogOpen(true)
	}

	// Ouvrir le dialog pour éditer
	const handleEdit = (company: Company) => {
		setEditingCompanyId(company.id)
		setEditingCompany(company)
		setFormData({
			name: company.name || '',
			trade_name: company.trade_name || '',
			active: company.active ?? true,
			is_default: company.is_default ?? false,
			email: company.email || '',
			phone: company.phone || '',
			website: company.website || '',
			address_line1: company.address_line1 || '',
			address_line2: company.address_line2 || '',
			zip_code: company.zip_code || '',
			city: company.city || '',
			country: company.country || 'France',
			siren: company.siren || '',
			siret: company.siret || '',
			vat_number: company.vat_number || '',
			legal_form: company.legal_form || '',
			rcs: company.rcs || '',
			ape_naf: company.ape_naf || '',
			share_capital: company.share_capital || 0,
			bank_name: company.bank_name || '',
			iban: company.iban || '',
			bic: company.bic || '',
			account_holder: company.account_holder || '',
			default_payment_terms_days: company.default_payment_terms_days || 30,
			default_payment_method: company.default_payment_method || 'virement',
			invoice_footer: company.invoice_footer || '',
			invoice_prefix: company.invoice_prefix || '',
			logoFile: null,
			logoPreview: null,
			removeLogo: false,
			existingLogo: company.logo || '',
		})
		setIsDialogOpen(true)
	}

	// Sauvegarder
	const handleSave = async () => {
		try {
			if (!formData.name.trim()) {
				toast.error("Le nom de l'entreprise est obligatoire")
				return
			}

			const {
				logoFile,
				logoPreview,
				removeLogo,
				existingLogo,
				...companyData
			} = formData

			if (editingCompanyId) {
				await updateCompany.mutateAsync({
					id: editingCompanyId,
					data: {
						...companyData,
						logo: logoFile,
						removeLogo,
					},
				})
				toast.success('Entreprise modifiée avec succès')
			} else {
				await createCompany.mutateAsync({
					...companyData,
					logo: logoFile,
				})
				toast.success('Entreprise créée avec succès')
			}

			setIsDialogOpen(false)
		} catch (error: unknown) {
			console.error('Error saving company:', error)
			const message =
				error instanceof Error
					? error.message
					: "Erreur lors de l'enregistrement"
			toast.error(message)
		}
	}

	// Supprimer
	const handleDelete = async (company: Company) => {
		if (company.is_first) {
			toast.error("Impossible de supprimer l'entreprise principale")
			return
		}

		if (
			!confirm(
				`Voulez-vous vraiment supprimer l'entreprise "${company.name}" ?`,
			)
		) {
			return
		}

		try {
			await deleteCompany.mutateAsync(company.id)
			toast.success('Entreprise supprimée')
		} catch (error: unknown) {
			console.error('Error deleting company:', error)
			const message =
				error instanceof Error
					? error.message
					: "Impossible de supprimer l'entreprise"
			toast.error(message)
		}
	}

	// Obtenir l'URL du logo pour la liste
	const getCompanyLogoUrl = (company: Company): string | null => {
		return getLogoUrl(pb, company)
	}

	if (isLoading) {
		return (
			<div className='flex items-center justify-center p-8'>
				<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
			</div>
		)
	}

	if (error) {
		return (
			<div className='flex flex-col items-center justify-center p-8 gap-4'>
				<p className='text-red-600'>
					Erreur lors du chargement des entreprises
				</p>
				<Button onClick={() => window.location.reload()}>
					Recharger la page
				</Button>
			</div>
		)
	}

	return (
		<div className='max-w-5xl'>
			<div className='bg-card rounded-lg border'>
				{/* Header */}
				<div className='p-6 border-b'>
					<div className='flex items-center justify-between'>
						<div>
							<h2 className='text-xl font-semibold flex items-center gap-2'>
								<Building2 className='h-5 w-5' />
								Gestion des entreprises
							</h2>
							<p className='text-sm text-muted-foreground mt-1'>
								Créer et gérer les entreprises de l'application
							</p>
						</div>
						<Button onClick={handleCreate} className='gap-2'>
							<Plus className='h-4 w-4' />
							Nouvelle entreprise
						</Button>
					</div>
				</div>

				{/* Table */}
				<div className='overflow-x-auto'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Entreprise</TableHead>
								<TableHead>SIRET</TableHead>
								<TableHead>Ville</TableHead>
								<TableHead>Statut</TableHead>
								<TableHead className='text-right'>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{companies.map((company) => {
								const logoUrl = getCompanyLogoUrl(company)
								return (
									<TableRow key={company.id}>
										<TableCell>
											<div className='flex items-center gap-3'>
												{/* Logo ou icône par défaut */}
												<div className='w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden'>
													{logoUrl ? (
														<img
															src={logoUrl}
															alt={company.name}
															className='w-full h-full object-cover'
														/>
													) : (
														<Building2 className='h-5 w-5 text-primary' />
													)}
												</div>
												<div>
													<div className='font-medium flex items-center gap-2'>
														{company.name}
														{company.is_first && (
															<span className='inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800'>
																Principale
															</span>
														)}
														{company.is_default && (
															<CheckCircle className='h-4 w-4 text-green-600' />
														)}
													</div>
													{company.trade_name && (
														<span className='text-xs text-muted-foreground'>
															{company.trade_name}
														</span>
													)}
												</div>
											</div>
										</TableCell>
										<TableCell className='text-sm text-muted-foreground font-mono'>
											{company.siret || '-'}
										</TableCell>
										<TableCell className='text-sm text-muted-foreground'>
											{company.city || '-'}
										</TableCell>
										<TableCell>
											<span
												className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
													company.active
														? 'bg-green-100 text-green-800'
														: 'bg-gray-100 text-gray-800'
												}`}
											>
												{company.active ? 'Active' : 'Inactive'}
											</span>
										</TableCell>
										<TableCell className='text-right'>
											<div className='flex items-center justify-end gap-2'>
												<Button
													variant='ghost'
													size='icon'
													className='h-8 w-8'
													onClick={() => handleEdit(company)}
												>
													<Pencil className='h-4 w-4' />
												</Button>
												<Button
													variant='ghost'
													size='icon'
													className='h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50'
													onClick={() => handleDelete(company)}
													disabled={company.is_first}
													title={
														company.is_first
															? "L'entreprise principale ne peut pas être supprimée"
															: 'Supprimer'
													}
												>
													{company.is_first ? (
														<ShieldAlert className='h-4 w-4 text-gray-400' />
													) : (
														<Trash2 className='h-4 w-4' />
													)}
												</Button>
											</div>
										</TableCell>
									</TableRow>
								)
							})}

							{companies.length === 0 && (
								<TableRow>
									<TableCell colSpan={5} className='text-center py-8'>
										<p className='text-muted-foreground'>Aucune entreprise</p>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</div>

			{/* Dialog création/édition */}
			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogContent className='max-w-3xl max-h-[90vh] overflow-y-auto'>
					<DialogHeader>
						<DialogTitle>
							{editingCompanyId
								? "Modifier l'entreprise"
								: 'Nouvelle entreprise'}
						</DialogTitle>
						<DialogDescription>
							{editingCompanyId
								? "Modifier les informations de l'entreprise"
								: 'Créer une nouvelle entreprise'}
						</DialogDescription>
					</DialogHeader>

					<Tabs defaultValue='general' className='w-full'>
						<TabsList className='grid w-full grid-cols-4'>
							<TabsTrigger value='general' className='gap-2'>
								<Building2 className='h-4 w-4' />
								Général
							</TabsTrigger>
							<TabsTrigger value='address' className='gap-2'>
								<MapPin className='h-4 w-4' />
								Adresse
							</TabsTrigger>
							<TabsTrigger value='bank' className='gap-2'>
								<CreditCard className='h-4 w-4' />
								Banque
							</TabsTrigger>
							<TabsTrigger value='invoicing' className='gap-2'>
								<FileText className='h-4 w-4' />
								Facturation
							</TabsTrigger>
						</TabsList>

						{/* Onglet Général */}
						<TabsContent value='general' className='space-y-4 mt-4'>
							{/* Section Logo */}
							<div className='flex items-start gap-6 p-4 bg-muted/50 rounded-lg'>
								<div className='relative'>
									{displayLogoUrl ? (
										<img
											src={displayLogoUrl}
											alt='Logo'
											className='w-20 h-20 rounded-lg object-cover border-2 border-muted'
										/>
									) : (
										<div className='w-20 h-20 rounded-lg bg-primary/10 flex items-center justify-center border-2 border-dashed border-muted-foreground/30'>
											<ImagePlus className='h-8 w-8 text-muted-foreground/50' />
										</div>
									)}
									{/* Bouton overlay */}
									<button
										type='button'
										onClick={() => fileInputRef.current?.click()}
										className='absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors'
									>
										<Camera className='h-4 w-4' />
									</button>
								</div>

								<div className='flex-1 space-y-2'>
									<Label>Logo de l'entreprise</Label>
									<div className='flex items-center gap-2'>
										<Button
											type='button'
											variant='outline'
											size='sm'
											onClick={() => fileInputRef.current?.click()}
										>
											<Camera className='h-4 w-4 mr-2' />
											{displayLogoUrl ? 'Changer' : 'Ajouter'}
										</Button>
										{displayLogoUrl && (
											<Button
												type='button'
												variant='ghost'
												size='sm'
												className='text-red-600 hover:text-red-700 hover:bg-red-50'
												onClick={handleRemoveLogo}
											>
												<Trash2 className='h-4 w-4 mr-2' />
												Supprimer
											</Button>
										)}
									</div>
									<p className='text-xs text-muted-foreground'>
										JPG, PNG ou WebP. Max 5 Mo.
									</p>
								</div>

								<input
									ref={fileInputRef}
									type='file'
									accept='image/jpeg,image/png,image/webp'
									onChange={handleLogoChange}
									className='hidden'
								/>
							</div>

							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='name'>Raison sociale *</Label>
									<Input
										id='name'
										value={formData.name}
										onChange={(e) =>
											setFormData({ ...formData, name: e.target.value })
										}
										placeholder='Ma Société SAS'
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='trade_name'>Nom commercial</Label>
									<Input
										id='trade_name'
										value={formData.trade_name}
										onChange={(e) =>
											setFormData({ ...formData, trade_name: e.target.value })
										}
										placeholder='Ma Marque'
									/>
								</div>
							</div>

							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='legal_form'>Forme juridique</Label>
									<Input
										id='legal_form'
										value={formData.legal_form}
										onChange={(e) =>
											setFormData({ ...formData, legal_form: e.target.value })
										}
										placeholder='SAS, SARL, EURL...'
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='share_capital'>Capital social (€)</Label>
									<Input
										id='share_capital'
										type='number'
										value={formData.share_capital}
										onChange={(e) =>
											setFormData({
												...formData,
												share_capital: Number.parseFloat(e.target.value) || 0,
											})
										}
										placeholder='10000'
									/>
								</div>
							</div>

							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='siren'>SIREN</Label>
									<Input
										id='siren'
										value={formData.siren}
										onChange={(e) =>
											setFormData({ ...formData, siren: e.target.value })
										}
										placeholder='123 456 789'
										maxLength={11}
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='siret'>SIRET</Label>
									<Input
										id='siret'
										value={formData.siret}
										onChange={(e) =>
											setFormData({ ...formData, siret: e.target.value })
										}
										placeholder='123 456 789 00012'
										maxLength={17}
									/>
								</div>
							</div>

							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='vat_number'>N° TVA intracommunautaire</Label>
									<Input
										id='vat_number'
										value={formData.vat_number}
										onChange={(e) =>
											setFormData({ ...formData, vat_number: e.target.value })
										}
										placeholder='FR 12 345678901'
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='rcs'>RCS</Label>
									<Input
										id='rcs'
										value={formData.rcs}
										onChange={(e) =>
											setFormData({ ...formData, rcs: e.target.value })
										}
										placeholder='Paris B 123 456 789'
									/>
								</div>
							</div>

							<div className='grid grid-cols-3 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='ape_naf'>Code APE/NAF</Label>
									<Input
										id='ape_naf'
										value={formData.ape_naf}
										onChange={(e) =>
											setFormData({ ...formData, ape_naf: e.target.value })
										}
										placeholder='6201Z'
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='email'>Email</Label>
									<Input
										id='email'
										type='email'
										value={formData.email}
										onChange={(e) =>
											setFormData({ ...formData, email: e.target.value })
										}
										placeholder='contact@societe.fr'
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='phone'>Téléphone</Label>
									<Input
										id='phone'
										value={formData.phone}
										onChange={(e) =>
											setFormData({ ...formData, phone: e.target.value })
										}
										placeholder='01 23 45 67 89'
									/>
								</div>
							</div>

							<div className='space-y-2'>
								<Label htmlFor='website'>Site web</Label>
								<Input
									id='website'
									type='url'
									value={formData.website}
									onChange={(e) =>
										setFormData({ ...formData, website: e.target.value })
									}
									placeholder='https://www.societe.fr'
								/>
							</div>

							<div className='flex items-center gap-6 pt-2'>
								<div className='flex items-center gap-2'>
									<Switch
										id='active'
										checked={formData.active}
										onCheckedChange={(checked) =>
											setFormData({ ...formData, active: checked })
										}
									/>
									<Label htmlFor='active'>Entreprise active</Label>
								</div>
								<div className='flex items-center gap-2'>
									<Switch
										id='is_default'
										checked={formData.is_default}
										onCheckedChange={(checked) =>
											setFormData({ ...formData, is_default: checked })
										}
									/>
									<Label htmlFor='is_default'>Entreprise par défaut</Label>
								</div>
							</div>
						</TabsContent>

						{/* Onglet Adresse */}
						<TabsContent value='address' className='space-y-4 mt-4'>
							<div className='space-y-2'>
								<Label htmlFor='address_line1'>Adresse ligne 1</Label>
								<Input
									id='address_line1'
									value={formData.address_line1}
									onChange={(e) =>
										setFormData({ ...formData, address_line1: e.target.value })
									}
									placeholder='123 rue de Paris'
								/>
							</div>
							<div className='space-y-2'>
								<Label htmlFor='address_line2'>Adresse ligne 2</Label>
								<Input
									id='address_line2'
									value={formData.address_line2}
									onChange={(e) =>
										setFormData({ ...formData, address_line2: e.target.value })
									}
									placeholder='Bâtiment A, 2ème étage'
								/>
							</div>
							<div className='grid grid-cols-3 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='zip_code'>Code postal</Label>
									<Input
										id='zip_code'
										value={formData.zip_code}
										onChange={(e) =>
											setFormData({ ...formData, zip_code: e.target.value })
										}
										placeholder='75001'
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='city'>Ville</Label>
									<Input
										id='city'
										value={formData.city}
										onChange={(e) =>
											setFormData({ ...formData, city: e.target.value })
										}
										placeholder='Paris'
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='country'>Pays</Label>
									<Input
										id='country'
										value={formData.country}
										onChange={(e) =>
											setFormData({ ...formData, country: e.target.value })
										}
										placeholder='France'
									/>
								</div>
							</div>
						</TabsContent>

						{/* Onglet Banque */}
						<TabsContent value='bank' className='space-y-4 mt-4'>
							<div className='space-y-2'>
								<Label htmlFor='bank_name'>Nom de la banque</Label>
								<Input
									id='bank_name'
									value={formData.bank_name}
									onChange={(e) =>
										setFormData({ ...formData, bank_name: e.target.value })
									}
									placeholder='Crédit Agricole'
								/>
							</div>
							<div className='space-y-2'>
								<Label htmlFor='account_holder'>Titulaire du compte</Label>
								<Input
									id='account_holder'
									value={formData.account_holder}
									onChange={(e) =>
										setFormData({ ...formData, account_holder: e.target.value })
									}
									placeholder='MA SOCIETE SAS'
								/>
							</div>
							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='iban'>IBAN</Label>
									<Input
										id='iban'
										value={formData.iban}
										onChange={(e) =>
											setFormData({ ...formData, iban: e.target.value })
										}
										placeholder='FR76 1234 5678 9012 3456 7890 123'
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='bic'>BIC</Label>
									<Input
										id='bic'
										value={formData.bic}
										onChange={(e) =>
											setFormData({ ...formData, bic: e.target.value })
										}
										placeholder='AGRIFRPP'
									/>
								</div>
							</div>
						</TabsContent>

						{/* Onglet Facturation */}
						<TabsContent value='invoicing' className='space-y-4 mt-4'>
							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='invoice_prefix'>Préfixe factures</Label>
									<Input
										id='invoice_prefix'
										value={formData.invoice_prefix}
										onChange={(e) =>
											setFormData({
												...formData,
												invoice_prefix: e.target.value,
											})
										}
										placeholder='FAC-'
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='default_payment_terms_days'>
										Délai de paiement (jours)
									</Label>
									<Input
										id='default_payment_terms_days'
										type='number'
										value={formData.default_payment_terms_days}
										onChange={(e) =>
											setFormData({
												...formData,
												default_payment_terms_days:
													Number.parseInt(e.target.value) || 30,
											})
										}
										placeholder='30'
									/>
								</div>
							</div>

							<div className='space-y-2'>
								<Label htmlFor='default_payment_method'>
									Mode de paiement par défaut
								</Label>
								<Select
									value={formData.default_payment_method}
									onValueChange={(value) =>
										setFormData({
											...formData,
											default_payment_method:
												value as CompanyDto['default_payment_method'],
										})
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='virement'>Virement bancaire</SelectItem>
										<SelectItem value='cb'>Carte bancaire</SelectItem>
										<SelectItem value='cheque'>Chèque</SelectItem>
										<SelectItem value='especes'>Espèces</SelectItem>
										<SelectItem value='autre'>Autre</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className='space-y-2'>
								<Label htmlFor='invoice_footer'>Pied de page factures</Label>
								<Textarea
									id='invoice_footer'
									value={formData.invoice_footer}
									onChange={(e) =>
										setFormData({ ...formData, invoice_footer: e.target.value })
									}
									placeholder='Mentions légales, conditions de paiement...'
									rows={4}
								/>
							</div>
						</TabsContent>
					</Tabs>

					<DialogFooter className='mt-6'>
						<Button variant='outline' onClick={() => setIsDialogOpen(false)}>
							Annuler
						</Button>
						<Button
							onClick={handleSave}
							disabled={createCompany.isPending || updateCompany.isPending}
						>
							{(createCompany.isPending || updateCompany.isPending) && (
								<Loader2 className='h-4 w-4 mr-2 animate-spin' />
							)}
							{editingCompanyId ? 'Enregistrer' : 'Créer'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
