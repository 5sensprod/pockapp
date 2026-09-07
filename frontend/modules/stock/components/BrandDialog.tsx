import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { ImageField } from '@/components/ui/image-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useCreateBrand, useUpdateBrand } from '@/lib/queries/brands'
import type { CatalogBrandShape } from '@/lib/queries/catalog-shapes'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import type { CatalogBrand } from '@/lib/queries/site-catalog'
import { useSuppliers, useUpdateSupplier } from '@/lib/queries/suppliers'
import { useBrandSyncAfterSave } from '@/lib/sync/SyncAfterSaveDialog'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { toast } from 'sonner'

// `website` a disparu du formulaire : le champ n'existe pas dans la collection
// installée (§6bis.4 du rituel de migration AppStock). Il était saisi, validé
// comme URL, puis ignoré à l'écriture.
//
// `slug` n'y entre pas non plus, et c'est une autre raison : **l'URL est figée
// au premier envoi**, et le serveur en est le seul gardien (§4.5 du contrat
// catalogue). Le modifier ici ne changerait rien en ligne et laisserait croire
// le contraire.
const brandSchema = z.object({
	name: z.string().min(1, 'Le nom est requis').max(255),
	description: z.string().max(20000).optional(),
})

type BrandFormValues = z.infer<typeof brandSchema>

interface BrandDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	brand?: CatalogBrandShape | null
}

export function BrandDialog({
	open,
	onOpenChange,
	brand = null,
}: BrandDialogProps) {
	const isEdit = !!brand
	const { activeCompanyId } = useActiveCompany()
	const createBrand = useCreateBrand()
	const updateBrand = useUpdateBrand()
	const pb = usePocketBase()
	const syncApresEnregistrement = useBrandSyncAfterSave(open && isEdit)

	// L'image vit hors du formulaire : react-hook-form sérialise ses valeurs, et
	// un `File` n'y survit pas.
	const [imageFile, setImageFile] = useState<File | null>(null)
	const [imageRemoved, setImageRemoved] = useState(false)

	// ── Les fournisseurs, vus depuis la marque ───────────────────────────────
	// La relation n'a QU'UN sens au schéma : c'est `suppliers.brands` qui la
	// porte (`backend/migrations/catalog.go:234`), la collection `brands` n'a
	// aucun champ vers les fournisseurs. La fiche marque affichait donc une
	// moitié de couple — le dialogue produit, lui, lit déjà le lien dans les
	// deux sens (`CatalogProductDialog.tsx:403`).
	//
	// Cocher un fournisseur ici écrit donc DANS LE FOURNISSEUR, et nulle part
	// ailleurs : c'est une écriture inverse, une par fournisseur ajouté ou
	// retiré. Elle reste hors du formulaire — `brands` n'est pas un champ de la
	// marque, le mettre dans le schéma zod laisserait croire qu'il part avec le
	// reste du corps.
	const { data: suppliers } = useSuppliers({
		companyId: activeCompanyId ?? undefined,
	})
	const updateSupplier = useUpdateSupplier()
	const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])
	const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)
	const [supplierSearch, setSupplierSearch] = useState('')
	const initialSupplierIds = useMemo(
		() =>
			brand
				? (suppliers ?? [])
						.filter((supplier) => supplier.brands?.includes(brand.id))
						.map((supplier) => supplier.id)
				: [],
		[brand, suppliers],
	)

	// `image` est un NOM DE FICHIER, pas une URL. Seul `pb.files.getUrl` sait en
	// faire une — et c'est PocketBase qui la sert, plus AppPos.
	const imageUrl = brand?.image ? pb.files.getUrl(brand, brand.image) : null

	const selectedSuppliers = useMemo(
		() =>
			(suppliers ?? []).filter((supplier) =>
				selectedSupplierIds.includes(supplier.id),
			),
		[suppliers, selectedSupplierIds],
	)
	// Recherche insensible aux accents : « CREME » doit trouver « Crème ».
	const fournisseursCherches = useMemo(() => {
		const terme = supplierSearch
			.trim()
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '')
			.toLocaleLowerCase('fr')
		if (!terme) return suppliers ?? []
		return (suppliers ?? []).filter((supplier) =>
			supplier.name
				.normalize('NFD')
				.replace(/\p{Diacritic}/gu, '')
				.toLocaleLowerCase('fr')
				.includes(terme),
		)
	}, [suppliers, supplierSearch])
	const toggleSupplier = (supplierId: string) => {
		setSelectedSupplierIds((current) =>
			current.includes(supplierId)
				? current.filter((id) => id !== supplierId)
				: [...current, supplierId],
		)
	}

	const form = useForm<BrandFormValues>({
		resolver: zodResolver(brandSchema),
		defaultValues: {
			name: '',
			description: '',
		},
	})

	useEffect(() => {
		if (open) {
			form.reset({
				name: brand?.name ?? '',
				description: brand?.description ?? '',
			})
			setImageFile(null)
			setImageRemoved(false)
		}
	}, [open, brand, form])

	// Les fournisseurs arrivent par une requête distincte : leur liste peut se
	// résoudre APRÈS l'ouverture. On repart donc de `initialSupplierIds` à
	// chaque fois qu'il change, tant que le dialogue est ouvert — sinon une
	// ouverture sur cache froid afficherait « aucun fournisseur » sur une marque
	// qui en a.
	useEffect(() => {
		if (!open) return
		setSelectedSupplierIds(initialSupplierIds)
		setSupplierSearch('')
	}, [open, initialSupplierIds])

	const onSubmit = async (data: BrandFormValues) => {
		// Chaîne vide et non `undefined` : c'est ainsi qu'on efface une valeur.
		// `undefined` disparaît du corps JSON, et l'ancienne description resterait
		// en base — un champ vidé à l'écran qui se remplit seul au rechargement.
		const payload = {
			name: data.name.trim(),
			description: data.description ?? '',
			// Ne rien dire de l'image la laisse en place ; voir `image-upload.ts`.
			image: imageFile,
			removeImage: imageRemoved,
		}
		const donneesModifiees = Boolean(
			brand &&
				(payload.name !== brand.name ||
					payload.description !== (brand.description ?? '')),
		)
		const imageModifiee = imageFile !== null || imageRemoved

		/** Reporte le choix dans les fournisseurs concernés — et EUX SEULS. On
		 *  n'envoie jamais la liste complète des fournisseurs : chacun est mis à
		 *  jour avec sa propre liste `brands`, amputée ou augmentée de cette
		 *  marque, pour ne pas écraser les autres marques qu'il distribue. */
		const reporterSurLesFournisseurs = async (brandId: string) => {
			const ajoutes = (suppliers ?? []).filter(
				(supplier) =>
					selectedSupplierIds.includes(supplier.id) &&
					!supplier.brands?.includes(brandId),
			)
			const retires = (suppliers ?? []).filter(
				(supplier) =>
					!selectedSupplierIds.includes(supplier.id) &&
					supplier.brands?.includes(brandId),
			)

			for (const supplier of ajoutes) {
				await updateSupplier.mutateAsync({
					id: supplier.id,
					data: {
						name: supplier.name,
						brands: [...(supplier.brands ?? []), brandId],
					},
				})
			}
			for (const supplier of retires) {
				await updateSupplier.mutateAsync({
					id: supplier.id,
					data: {
						name: supplier.name,
						brands: (supplier.brands ?? []).filter((id) => id !== brandId),
					},
				})
			}
			return ajoutes.length + retires.length
		}

		try {
			if (isEdit && brand) {
				const enregistree = await updateBrand.mutateAsync({
					id: brand.id,
					data: payload,
				})
				const fournisseursTouches = await reporterSurLesFournisseurs(brand.id)
				toast.success(
					fournisseursTouches > 0
						? `Marque modifiée — ${fournisseursTouches} fournisseur${fournisseursTouches > 1 ? 's' : ''} mis à jour`
						: 'Marque modifiée',
				)
				if (donneesModifiees || imageModifiee) {
					await syncApresEnregistrement.proposer(enregistree as CatalogBrand, {
						dataModified: donneesModifiees,
						imageModified: imageModifiee,
					})
				}
			} else {
				if (!activeCompanyId) {
					toast.error('Aucune entreprise active')
					return
				}
				const creee = await createBrand.mutateAsync({
					...payload,
					company: activeCompanyId,
				})
				// L'identifiant n'existe qu'après la création : le report ne peut pas
				// se faire avant.
				await reporterSurLesFournisseurs(creee.id)
				toast.success('Marque créée')
			}
			onOpenChange(false)
		} catch (error) {
			const detail = pocketbaseErrorMessage(error)
			toast.error(`Enregistrement refusé : ${detail}`)
			console.error(error)
		}
	}

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className='max-w-md'>
					<DialogHeader>
						<DialogTitle>
							{isEdit ? 'Modifier la marque' : 'Nouvelle marque'}
						</DialogTitle>
						<DialogDescription>
							{isEdit
								? 'Modifiez les informations'
								: 'Ajoutez une nouvelle marque'}
						</DialogDescription>
					</DialogHeader>

					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
							<ImageField
								label='Logo de la marque'
								currentUrl={imageUrl}
								value={imageFile}
								onChange={setImageFile}
								removed={imageRemoved}
								onRemovedChange={setImageRemoved}
								disabled={createBrand.isPending || updateBrand.isPending}
								// 512 px : le site affiche le logo dans un cadre de 248×248
								// (`BrandBadge`), on garde la marge des écrans haute densité.
								optimize={{ maxSide: 512 }}
							/>

							<FormField
								control={form.control}
								name='name'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Nom *</FormLabel>
										<FormControl>
											<Input placeholder='Yamaha' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name='description'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description</FormLabel>
										<FormControl>
											<Textarea
												placeholder='Description de la marque...'
												rows={3}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Fournisseurs — écriture inverse, voir le commentaire plus
							    haut. Les 43 fournisseurs étalés en pastilles noyaient la
							    seule information utile : celui qui est déjà rattaché. Ne
							    sont donc affichés QUE les rattachements en place ; les
							    autres se cherchent dans la liste déroulante.

							    Ni `FormItem` ni `FormLabel` ici : tous deux passent par
							    `useFormField`, qui LÈVE hors d'un `FormField` — et il n'y a
							    pas de champ de formulaire derrière ce sélecteur. */}
							<div className='space-y-2'>
								<Label>Distribuée par</Label>
								{selectedSuppliers.length > 0 && (
									<div className='flex flex-wrap gap-2'>
										{selectedSuppliers.map((supplier) => (
											<span
												key={supplier.id}
												className='inline-flex items-center gap-1 rounded-full bg-primary py-1 pr-1 pl-2.5 text-primary-foreground text-xs'
											>
												{supplier.name}
												<button
													type='button'
													aria-label={`Retirer ${supplier.name}`}
													title='Retirer ce fournisseur'
													onClick={() => toggleSupplier(supplier.id)}
													className='rounded-full p-0.5 hover:bg-primary-foreground/20'
												>
													<X className='h-3 w-3' />
												</button>
											</span>
										))}
									</div>
								)}
								<Popover
									open={supplierPickerOpen}
									onOpenChange={(ouvert) => {
										setSupplierPickerOpen(ouvert)
										if (!ouvert) setSupplierSearch('')
									}}
								>
									<PopoverTrigger asChild>
										<Button
											type='button'
											variant='outline'
											aria-haspopup='listbox'
											aria-expanded={supplierPickerOpen}
											className='w-full justify-between font-normal'
										>
											<span
												className={cn(
													'truncate',
													selectedSuppliers.length === 0 &&
														'text-muted-foreground',
												)}
											>
												{selectedSuppliers.length === 0
													? 'Aucun fournisseur'
													: selectedSuppliers.length === 1
														? selectedSuppliers[0].name
														: `${selectedSuppliers.length} fournisseurs`}
											</span>
											<ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
										</Button>
									</PopoverTrigger>
									<PopoverContent
										align='start'
										className='w-[--radix-popover-trigger-width] p-0'
									>
										<div className='relative border-b p-2'>
											<Search className='-translate-y-1/2 absolute top-1/2 left-4 h-3.5 w-3.5 text-muted-foreground' />
											<Input
												value={supplierSearch}
												onChange={(event) =>
													setSupplierSearch(event.target.value)
												}
												placeholder='Chercher un fournisseur…'
												aria-label='Chercher un fournisseur'
												className='h-8 pl-7 text-sm'
											/>
										</div>
										<div className='max-h-60 overflow-y-auto p-1'>
											{/* « Aucun » vide le rattachement — et le DIT, plutôt que
											    d'obliger à décocher les pastilles une à une. */}
											<button
												type='button'
												onClick={() => setSelectedSupplierIds([])}
												className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent'
											>
												<Check
													className={cn(
														'h-3.5 w-3.5 shrink-0',
														selectedSupplierIds.length > 0 && 'invisible',
													)}
												/>
												<span className='text-muted-foreground'>Aucun</span>
											</button>
											{fournisseursCherches.map((supplier) => {
												const isSelected = selectedSupplierIds.includes(
													supplier.id,
												)
												return (
													<button
														key={supplier.id}
														type='button'
														aria-pressed={isSelected}
														onClick={() => toggleSupplier(supplier.id)}
														className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent'
													>
														<Check
															className={cn(
																'h-3.5 w-3.5 shrink-0',
																!isSelected && 'invisible',
															)}
														/>
														<span className='truncate'>{supplier.name}</span>
													</button>
												)
											})}
											{fournisseursCherches.length === 0 && (
												<p className='px-2 py-6 text-center text-muted-foreground text-sm'>
													Aucun résultat
												</p>
											)}
										</div>
									</PopoverContent>
								</Popover>
							</div>

							<div className='flex justify-end gap-3 pt-4'>
								<Button
									type='button'
									variant='outline'
									onClick={() => onOpenChange(false)}
								>
									Annuler
								</Button>
								<Button
									type='submit'
									disabled={
										createBrand.isPending ||
										updateBrand.isPending ||
										updateSupplier.isPending
									}
								>
									{isEdit ? 'Modifier' : 'Créer'}
								</Button>
							</div>
						</form>
					</Form>
				</DialogContent>
			</Dialog>
			{syncApresEnregistrement.dialogue}
		</>
	)
}
