// frontend/components/cash/CreateProductDialog.tsx
// Dialogue de création rapide de produit depuis le terminal de caisse

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
import { useCreateAppPosProduct } from '@/lib/apppos'
import type { CreateAppPosProductInput } from '@/lib/apppos'
import { Loader2, Package } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

interface CreateProductDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	initialBarcode?: string
	initialName?: string // 🆕 Pour pré-remplir le nom
	onProductCreated?: (product: any) => void
}

export function CreateProductDialog(props: CreateProductDialogProps) {
	const { open, onOpenChange, initialBarcode, initialName, onProductCreated } =
		props

	const [formData, setFormData] = React.useState<CreateAppPosProductInput>({
		name: '',
		price_ttc: 0,
		tva_rate: 20,
		barcode: initialBarcode || '',
		sku: '',
		description: '',
		stock_quantity: 0,
		stock_min: 0,
	})

	const createProduct = useCreateAppPosProduct({
		onSuccess: (product) => {
			toast.success('Produit créé avec succès !')
			onProductCreated?.(product)
			onOpenChange(false)
			resetForm()
		},
		onError: (error) => {
			toast.error(`Erreur : ${error.message}`)
		},
	})

	// Réinitialiser le formulaire avec le nouveau barcode ou nom quand il change
	React.useEffect(() => {
		if (open) {
			setFormData((prev) => ({
				...prev,
				name: initialName || prev.name,
				barcode: initialBarcode || prev.barcode,
			}))
		}
	}, [open, initialBarcode, initialName])

	const resetForm = React.useCallback(() => {
		setFormData({
			name: initialName || '',
			price_ttc: 0,
			tva_rate: 20,
			barcode: initialBarcode || '',
			sku: '',
			description: '',
			stock_quantity: 0,
			stock_min: 0,
		})
	}, [initialBarcode, initialName])

	const handleSubmit = React.useCallback(
		(e: React.FormEvent) => {
			e.preventDefault()

			// Validation
			if (!formData.name.trim()) {
				toast.error('Le nom du produit est obligatoire')
				return
			}

			if (formData.price_ttc <= 0) {
				toast.error('Le prix TTC doit être supérieur à 0')
				return
			}

			createProduct.mutate(formData)
		},
		[formData, createProduct],
	)

	const handleFieldChange = React.useCallback(
		(field: keyof CreateAppPosProductInput, value: string | number) => {
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

					{/* Nom du produit (OBLIGATOIRE) */}
					<div className='space-y-2'>
						<Label
							htmlFor='name'
							className='flex items-center gap-1 text-sm font-semibold'
						>
							Nom du produit
							<span className='text-red-500'>*</span>
						</Label>
						<Input
							id='name'
							placeholder='Ex: Coca-Cola 33cl'
							value={formData.name}
							onChange={(e) => handleFieldChange('name', e.target.value)}
							required
							autoFocus
							className='h-11 text-base'
						/>
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
							<Label htmlFor='tva_rate' className='text-sm font-semibold'>
								TVA
							</Label>
							<Select
								value={String(formData.tva_rate)}
								onValueChange={(v) =>
									handleFieldChange('tva_rate', Number.parseInt(v))
								}
							>
								<SelectTrigger id='tva_rate' className='h-11'>
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
											(1 + (formData.tva_rate || 20) / 100)
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
