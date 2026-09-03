// frontend/modules/cash/CreateProductDialog.tsx
// Dialogue de création rapide de produit depuis le terminal de caisse.
//
// ⚠️ C'ÉTAIT LE POINT DUR DE LA MIGRATION. Ce dialogue créait ses produits dans
// NeDB, si bien que PocketBase était en retard PAR CONSTRUCTION : 53 produits y
// manquaient au 18 août 2026, tous nés en caisse depuis le dernier import.
// Depuis le 19 août 2026 il écrit dans PocketBase, comme tout le reste. C'est
// ce qui rend possible l'arrêt du rechargement par purge (front F).

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
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useCreateCatalogProduct } from '@/lib/queries/catalog-products'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import { Loader2, Package } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

interface CreateProductDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	initialBarcode?: string
	initialName?: string // 🆕 Pré-remplit la DÉSIGNATION (le nom du ticket)
	onProductCreated?: (product: any) => void
}

export function CreateProductDialog(props: CreateProductDialogProps) {
	const { open, onOpenChange, initialBarcode, initialName, onProductCreated } =
		props

	type QuickProductForm = {
		name: string
		price_ttc: number
		tax_rate: number
		barcode: string
		sku: string
		designation: string
		description: string
		stock: number
		min_stock: number
	}

	const [formData, setFormData] = React.useState<QuickProductForm>({
		name: '',
		price_ttc: 0,
		tax_rate: 20,
		barcode: initialBarcode || '',
		sku: '',
		designation: '',
		description: '',
		stock: 0,
		min_stock: 0,
	})

	const { activeCompanyId } = useActiveCompany()
	const createProduct = useCreateCatalogProduct()

	// Réinitialiser le formulaire avec le nouveau barcode ou nom quand il change
	React.useEffect(() => {
		if (open) {
			setFormData((prev) => ({
				...prev,
				designation: initialName || prev.designation,
				barcode: initialBarcode || prev.barcode,
			}))
		}
	}, [open, initialBarcode, initialName])

	const resetForm = React.useCallback(() => {
		setFormData({
			name: '',
			price_ttc: 0,
			tax_rate: 20,
			barcode: initialBarcode || '',
			sku: '',
			designation: initialName || '',
			description: '',
			stock: 0,
			min_stock: 0,
		})
	}, [initialBarcode, initialName])

	const handleSubmit = React.useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault()

			const designation = formData.designation.trim()
			if (!designation) {
				toast.error('La désignation du produit est obligatoire')
				return
			}

			if (formData.price_ttc <= 0) {
				toast.error('Le prix TTC doit être supérieur à 0')
				return
			}

			if (!activeCompanyId) {
				toast.error('Aucune entreprise active')
				return
			}

			try {
				// `status: 'published'` — sans quoi le produit tout juste créé serait
				// invisible du sélecteur de la caisse, qui écarte les brouillons.
				// `legacy_id` est posé par la couche, pas ici.
				// Ce qui est tapé au comptoir est la DÉSIGNATION, celle du ticket.
				// `name` titre la fiche en ligne : on ne le reprend que si le
				// vendeur n'a rien saisi, pour ne pas laisser une page sans titre
				// ni un produit sans slug (`resoudreSlugProduit` le dérive de `name`).
				const product = await createProduct.mutateAsync({
					...formData,
					designation,
					name: formData.name.trim() || designation,
					company: activeCompanyId,
					status: 'published',
					type: 'simple',
					manage_stock: true,
				})
				toast.success('Produit créé avec succès !')
				onProductCreated?.(product)
				onOpenChange(false)
				resetForm()
			} catch (error) {
				toast.error(`Enregistrement refusé : ${pocketbaseErrorMessage(error)}`)
			}
		},
		[
			formData,
			createProduct,
			activeCompanyId,
			onProductCreated,
			onOpenChange,
			resetForm,
		],
	)

	const handleFieldChange = React.useCallback(
		(field: keyof QuickProductForm, value: string | number) => {
			setFormData((prev) => ({
				...prev,
				[field]: value,
			}))
		},
		[],
	)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-[500px]'>
				<DialogHeader>
					<div className='flex items-center gap-3'>
						<div className='flex h-10 w-10 items-center justify-center rounded-full bg-blue-100'>
							<Package className='h-5 w-5 text-blue-600' />
						</div>
						<div>
							<DialogTitle>Créer un nouveau produit</DialogTitle>
							<DialogDescription>
								{initialBarcode
									? 'Code-barres inconnu'
									: "Le produit n'existe pas dans le catalogue"}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<form onSubmit={handleSubmit} className='space-y-4'>
					{/* Code-barres (lecture seule si pré-rempli) */}
					{initialBarcode && (
						<div className='rounded-lg bg-slate-50 p-3 border border-slate-200'>
							<div className='text-xs font-medium text-slate-500 mb-1'>
								Code-barres scanné
							</div>
							<div className='font-mono text-sm font-semibold text-slate-900'>
								{formData.barcode}
							</div>
						</div>
					)}

					{/* Désignation (OBLIGATOIRE) — c'est le nom du ticket */}
					<div className='space-y-2'>
						<Label
							htmlFor='designation'
							className='flex items-center gap-1 text-sm font-semibold'
						>
							Désignation (ticket)
							<span className='text-red-500'>*</span>
						</Label>
						<Input
							id='designation'
							placeholder='Ex: Coca-Cola 33cl'
							value={formData.designation}
							onChange={(e) => handleFieldChange('designation', e.target.value)}
							required
							autoFocus
							className='h-11 text-base'
						/>
						<p className='text-xs text-slate-500'>
							Affichée sur le ticket de caisse.
						</p>
					</div>

					{/* Nom de la fiche en ligne (optionnel) */}
					<div className='space-y-2'>
						<Label
							htmlFor='name'
							className='flex items-center gap-1 text-sm font-semibold'
						>
							Nom de la fiche en ligne
						</Label>
						<Input
							id='name'
							placeholder='Laisser vide pour reprendre la désignation'
							value={formData.name}
							onChange={(e) => handleFieldChange('name', e.target.value)}
							className='h-11 text-base'
						/>
						<p className='text-xs text-slate-500'>
							Titre de la page produit sur le site ; se retouche depuis la
							fiche.
						</p>
					</div>

					{/* Prix TTC et TVA sur la même ligne */}
					<div className='grid grid-cols-2 gap-4'>
						<div className='space-y-2'>
							<Label
								htmlFor='price_ttc'
								className='flex items-center gap-1 text-sm font-semibold'
							>
								Prix TTC (€)
								<span className='text-red-500'>*</span>
							</Label>
							<Input
								id='price_ttc'
								type='number'
								step='0.01'
								min='0'
								placeholder='0.00'
								value={formData.price_ttc || ''}
								onChange={(e) =>
									handleFieldChange(
										'price_ttc',
										Number.parseFloat(e.target.value),
									)
								}
								required
								className='h-11 text-base text-right'
							/>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='tax_rate' className='text-sm font-semibold'>
								TVA
							</Label>
							<Select
								value={String(formData.tax_rate)}
								onValueChange={(v) =>
									handleFieldChange('tax_rate', Number.parseInt(v))
								}
							>
								<SelectTrigger id='tax_rate' className='h-11'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='0'>0%</SelectItem>
									<SelectItem value='5.5'>5.5%</SelectItem>
									<SelectItem value='10'>10%</SelectItem>
									<SelectItem value='20'>20%</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Info sur le prix HT calculé */}
					<div className='rounded-lg bg-blue-50 p-3 border border-blue-200'>
						<div className='flex items-center justify-between text-sm'>
							<span className='text-blue-700 font-medium'>Prix HT calculé</span>
							<span className='font-semibold text-blue-900'>
								{formData.price_ttc > 0
									? (
											formData.price_ttc /
											(1 + (formData.tax_rate || 20) / 100)
										).toFixed(2)
									: '0.00'}{' '}
								€
							</span>
						</div>
					</div>

					<DialogFooter className='mt-6 gap-2'>
						<Button
							type='button'
							variant='outline'
							onClick={() => onOpenChange(false)}
							disabled={createProduct.isPending}
							className='flex-1'
						>
							Annuler
						</Button>
						<Button
							type='submit'
							disabled={createProduct.isPending}
							className='flex-1'
						>
							{createProduct.isPending ? (
								<>
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
									Création...
								</>
							) : (
								'Créer et ajouter au panier'
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
