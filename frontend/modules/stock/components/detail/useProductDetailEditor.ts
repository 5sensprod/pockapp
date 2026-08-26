import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import {
	type CatalogProductShape,
	invalidateCatalog,
	resoudreSlugProduit,
	usePromoteProductImage,
	useRemoveProductMainImage,
	useUpdateCatalogProduct,
} from '@/lib/queries/catalog-products'
import { type GalleryEntry, memeGalerie } from '@/lib/queries/gallery-order'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import type { CatalogProduct } from '@/lib/queries/site-catalog'
import { setCountedStock } from '@/lib/queries/stock-adjust'
import { useSyncAfterSave } from '@/lib/sync/SyncAfterSaveDialog'
import { usePocketBase } from '@/lib/use-pocketbase'

import {
	productDetailPayload,
	productDetailSchema,
	productDetailValues,
	type ProductDetailValues,
} from './product-detail-form'

export function useProductDetailEditor(product: CatalogProductShape) {
	const pb = usePocketBase()
	const queryClient = useQueryClient()
	const update = useUpdateCatalogProduct()
	const promote = usePromoteProductImage()
	const removeMain = useRemoveProductMainImage()
	const [editing, setEditing] = useState(false)
	const [gallery, setGallery] = useState<GalleryEntry[]>(product.gallery ?? [])
	const [baseGallery, setBaseGallery] = useState<GalleryEntry[]>(
		product.gallery ?? [],
	)
	const [currentImage, setCurrentImage] = useState<string | null>(null)
	const [imagesTouched, setImagesTouched] = useState(false)
	const [repairedSlug, setRepairedSlug] = useState('')
	const loadedProductId = useRef('')
	const syncAfterSave = useSyncAfterSave(editing)
	const form = useForm<ProductDetailValues>({
		resolver: zodResolver(productDetailSchema),
		defaultValues: productDetailValues(product),
	})

	useEffect(() => {
		if (loadedProductId.current === product.id) return
		loadedProductId.current = product.id
		form.reset(productDetailValues(product))
		setGallery(product.gallery ?? [])
		setBaseGallery(product.gallery ?? [])
		setCurrentImage(null)
		setImagesTouched(false)
		setRepairedSlug('')
		// Une invalidation après promotion change l'objet `product` sans changer de
		// fiche. Réinitialiser sur l'objet effacerait alors les textes non sauvés.
	}, [product, form])

	useEffect(() => {
		if (!editing || product.slug) return
		let alive = true
		void resoudreSlugProduit(pb, product.name).then((slug) => {
			if (alive) setRepairedSlug(slug)
		})
		return () => {
			alive = false
		}
	}, [editing, pb, product.name, product.slug])

	const cancel = () => {
		form.reset(productDetailValues(product))
		// Promotion et suppression sont déjà parties au serveur. Annuler ne doit
		// revenir que sur la galerie différée, jamais ressusciter l'état précédent.
		setGallery(baseGallery)
		setImagesTouched(false)
		setEditing(false)
	}

	const submit = async (data: ProductDetailValues) => {
		try {
			const payload = {
				...productDetailPayload(data),
				gallery: memeGalerie(baseGallery, gallery) ? undefined : gallery,
				...(!product.slug && repairedSlug ? { slug: repairedSlug } : {}),
			}
			let saved = await update.mutateAsync({ id: product.id, data: payload })

			if (data.stock !== (product.stock ?? 0)) {
				const stock = await setCountedStock(pb, product.id, data.stock, {
					metadata: { origin: 'product_detail' },
				})
				if (!stock.applied && stock.stockAfter !== data.stock) {
					throw new Error(stock.error ?? 'ajustement du stock refusé')
				}
				saved = { ...saved, stock: stock.stockAfter ?? data.stock }
				// L'ajustement arrive après le patch produit : il ré-invalide aussi la
				// projection `site-catalog`, sinon la file pourrait exporter l'ancien
				// stock depuis un cache tout juste rechargé.
				invalidateCatalog(queryClient)
			}

			const syncImages = imagesTouched
			form.reset(productDetailValues(saved))
			setGallery(saved.gallery ?? [])
			setBaseGallery(saved.gallery ?? [])
			setCurrentImage(null)
			setImagesTouched(false)
			setEditing(false)
			toast.success('Produit modifié')
			// Seul le retour PocketBase connaît les noms attribués aux nouveaux
			// fichiers de galerie ; l'empreinte ne doit jamais partir des valeurs RHF.
			await syncAfterSave.proposer(
				saved as unknown as CatalogProduct,
				syncImages,
			)
		} catch (error) {
			toast.error(`Enregistrement refusé : ${pocketbaseErrorMessage(error)}`)
		}
	}

	const promoteImage = async (filename: string) => {
		try {
			const after = await promote.mutateAsync({
				productId: product.id,
				filename,
			})
			setCurrentImage(after.image)
			setGallery(after.gallery)
			setBaseGallery(after.gallery)
			setImagesTouched(true)
			toast.success('Image principale mise à jour')
		} catch (error) {
			toast.error(`Promotion refusée : ${pocketbaseErrorMessage(error)}`)
		}
	}

	const removeMainImage = async () => {
		try {
			await removeMain.mutateAsync(product.id)
			setCurrentImage('')
			setImagesTouched(true)
			toast.success('Image principale supprimée')
		} catch (error) {
			toast.error(`Suppression refusée : ${pocketbaseErrorMessage(error)}`)
		}
	}

	return {
		form,
		editing,
		start: () => {
			form.reset(productDetailValues(product))
			setEditing(true)
		},
		cancel,
		submit,
		gallery,
		setGallery: (value: GalleryEntry[]) => {
			setGallery(value)
			setImagesTouched(true)
		},
		currentImage,
		promoteImage,
		removeMainImage,
		pending: update.isPending || promote.isPending || removeMain.isPending,
		promoting: promote.isPending,
		removingMain: removeMain.isPending,
		dialogue: syncAfterSave.dialogue,
	}
}
