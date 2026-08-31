import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { GalleryField } from '@/components/ui/gallery-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useBrands } from '@/lib/queries/brands'
import {
	type CatalogProductStatus,
	useCreateCatalogProduct,
	usePromoteProductImage,
} from '@/lib/queries/catalog-products'
import { consignmentProductPayload } from '@/lib/queries/consignment-product'
import type { ConsignmentItemDto } from '@/lib/queries/consignmentItems'
import type { GalleryEntry } from '@/lib/queries/gallery-order'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import { CategoryPicker } from '@/modules/stock/components/CategoryPicker'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	item: ConsignmentItemDto | null
	companyId: string
}

export function ConsignmentCatalogProductDialog({
	open,
	onOpenChange,
	item,
	companyId,
}: Props) {
	const createProduct = useCreateCatalogProduct()
	const promoteImage = usePromoteProductImage()
	const brands = useBrands({ companyId: companyId || undefined })

	const [name, setName] = useState('')
	const [description, setDescription] = useState('')
	const [brand, setBrand] = useState('')
	const [categories, setCategories] = useState<string[]>([])
	const [gallery, setGallery] = useState<GalleryEntry[]>([])
	const [status, setStatus] = useState<CatalogProductStatus>('draft')
	const [taxRate, setTaxRate] = useState(20)

	useEffect(() => {
		if (!open || !item) return
		setName(item.description.slice(0, 255))
		setDescription(item.description)
		setBrand('')
		setCategories([])
		setGallery([])
		setStatus('draft')
		setTaxRate(20)
	}, [open, item])

	const pending = createProduct.isPending || promoteImage.isPending

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		if (!item || !companyId) {
			toast.error('Dépôt ou entreprise manquant')
			return
		}
		if (name.trim() === '') {
			toast.error('Le nom du produit est requis')
			return
		}

		try {
			const created = await createProduct.mutateAsync(
				consignmentProductPayload(item, {
					company: companyId,
					name,
					description,
					status,
					taxRate,
					brand,
					categories,
					gallery,
				}),
			)

			// Les fichiers sont d'abord enregistrés dans `gallery`. Seul le nom
			// rendu par PocketBase peut ensuite être promu par la route dédiée.
			const firstImage = created.gallery?.[0]
			if (firstImage) {
				try {
					await promoteImage.mutateAsync({
						productId: created.id,
						filename: firstImage,
					})
				} catch (error) {
					toast.warning(
						`Produit créé, mais la photo principale reste à désigner : ${pocketbaseErrorMessage(error)}`,
					)
					onOpenChange(false)
					return
				}
			}

			toast.success('Fiche catalogue créée')
			onOpenChange(false)
		} catch (error) {
			toast.error(`Création refusée : ${pocketbaseErrorMessage(error)}`)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-h-[90vh] max-w-2xl overflow-y-auto'>
				<DialogHeader>
					<DialogTitle>Créer la fiche catalogue d’occasion</DialogTitle>
					<DialogDescription>
						Le déposant reste le client de ce dépôt. Aucun fournisseur n’est
						créé ni sélectionné.
					</DialogDescription>
				</DialogHeader>

				<form className='space-y-4' onSubmit={submit}>
					<GalleryField
						mainUrl={null}
						value={gallery}
						onChange={setGallery}
						urlDe={() => ''}
						disabled={pending}
						optimize={{ maxSide: 1600 }}
					/>
					<p className='text-muted-foreground text-xs'>
						Toutes les photos sont d’abord déposées dans la galerie. Après la
						création, la première est désignée comme principale par la route de
						promotion du catalogue.
					</p>

					<div className='space-y-1.5'>
						<label
							htmlFor='consignment-product-name'
							className='font-medium text-sm'
						>
							Nom de la fiche en ligne *
						</label>
						<Input
							id='consignment-product-name'
							value={name}
							maxLength={255}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div className='space-y-1.5'>
							<label
								htmlFor='consignment-product-price'
								className='font-medium text-sm'
							>
								Prix de vente TTC
							</label>
							<Input
								id='consignment-product-price'
								value={item?.store_price ?? 0}
								readOnly
							/>
							<p className='text-muted-foreground text-xs'>
								Repris du prix magasin du dépôt.
							</p>
						</div>
						<div className='space-y-1.5'>
							<label
								htmlFor='consignment-product-tax'
								className='font-medium text-sm'
							>
								TVA (%)
							</label>
							<Input
								id='consignment-product-tax'
								type='number'
								min='0'
								max='100'
								step='0.1'
								value={taxRate}
								onChange={(event) => setTaxRate(Number(event.target.value))}
							/>
						</div>
					</div>

					<div className='space-y-1.5'>
						<label
							htmlFor='consignment-product-brand'
							className='font-medium text-sm'
						>
							Marque
						</label>
						<select
							id='consignment-product-brand'
							value={brand}
							onChange={(event) => setBrand(event.target.value)}
							className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
						>
							<option value=''>— Aucune —</option>
							{(brands.data ?? []).map((entry) => (
								<option key={entry.id} value={entry.id}>
									{entry.name}
								</option>
							))}
						</select>
					</div>

					<div className='space-y-1.5'>
						<span className='font-medium text-sm'>Catégories</span>
						<CategoryPicker
							value={categories}
							onChange={(value) =>
								setCategories(Array.isArray(value) ? value : [value])
							}
							multiple
							showNone={false}
							searchPlaceholder='Rechercher une catégorie…'
							companyId={companyId}
						/>
					</div>

					<div className='space-y-1.5'>
						<label
							htmlFor='consignment-product-description'
							className='font-medium text-sm'
						>
							Description
						</label>
						<Textarea
							id='consignment-product-description'
							rows={4}
							value={description}
							onChange={(event) => setDescription(event.target.value)}
						/>
					</div>

					<div className='space-y-1.5'>
						<label
							htmlFor='consignment-product-status'
							className='font-medium text-sm'
						>
							Publication
						</label>
						<select
							id='consignment-product-status'
							value={status}
							onChange={(event) =>
								setStatus(event.target.value as CatalogProductStatus)
							}
							className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
						>
							<option value='draft'>Brouillon</option>
							<option value='published'>Publié sur le site</option>
						</select>
						<p className='text-muted-foreground text-xs'>
							L’état « occasion » ne décide pas de la publication.
						</p>
					</div>

					<div className='flex justify-end gap-3 pt-2'>
						<Button
							type='button'
							variant='outline'
							disabled={pending}
							onClick={() => onOpenChange(false)}
						>
							Annuler
						</Button>
						<Button type='submit' disabled={pending}>
							{pending ? 'Création…' : 'Créer la fiche catalogue'}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	)
}
