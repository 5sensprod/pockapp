import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useCreateBrand, useUpdateBrand } from '@/lib/queries/brands'
import type { CatalogBrandShape } from '@/lib/queries/catalog-shapes'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import { usePocketBase } from '@/lib/use-pocketbase'
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

	// L'image vit hors du formulaire : react-hook-form sérialise ses valeurs, et
	// un `File` n'y survit pas.
	const [imageFile, setImageFile] = useState<File | null>(null)
	const [imageRemoved, setImageRemoved] = useState(false)

	// `image` est un NOM DE FICHIER, pas une URL. Seul `pb.files.getUrl` sait en
	// faire une — et c'est PocketBase qui la sert, plus AppPos.
	const imageUrl = brand?.image ? pb.files.getUrl(brand, brand.image) : null

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

		try {
			if (isEdit && brand) {
				await updateBrand.mutateAsync({ id: brand.id, data: payload })
				toast.success('Marque modifiée')
			} else {
				if (!activeCompanyId) {
					toast.error('Aucune entreprise active')
					return
				}
				await createBrand.mutateAsync({ ...payload, company: activeCompanyId })
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
								disabled={createBrand.isPending || updateBrand.isPending}
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
