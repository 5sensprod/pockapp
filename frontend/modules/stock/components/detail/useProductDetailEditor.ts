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
	type ProductDetailValues,
	productDetailPayload,
	productDetailSchema,
	productDetailValues,
} from './product-detail-form'

export type ProductDetailSection =
	| 'identity'
	| 'pricing'
	| 'stock'
	| 'content'
	| 'visuals'

export function useProductDetailEditor(product: CatalogProductShape) {
	const pb = usePocketBase()
	const queryClient = useQueryClient()
	const update = useUpdateCatalogProduct()
	const promote = usePromoteProductImage()
	const removeMain = useRemoveProductMainImage()
	const [activeSection, setActiveSection] =
		useState<ProductDetailSection | null>(null)
	const [gallery, setGallery] = useState<GalleryEntry[]>(product.gallery ?? [])
	const [baseGallery, setBaseGallery] = useState<GalleryEntry[]>(
		product.gallery ?? [],
	)
	const [currentImage, setCurrentImage] = useState<string | null>(null)
	// L'image choisie comme vedette AVANT d'être envoyée. Elle n'a pas encore de
	// nom de fichier : la route de promotion ne saurait pas la désigner. On garde
	// donc l'objet `File` et on promeut APRÈS l'enregistrement, quand PocketBase
	// a rendu les noms qu'il lui a attribués.
	const [pendingMain, setPendingMain] = useState<File | null>(null)
	const [imagesTouched, setImagesTouched] = useState(false)
	const [repairedSlug, setRepairedSlug] = useState('')
	const loadedProductId = useRef('')
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
		setPendingMain(null)
		setImagesTouched(false)
		setRepairedSlug('')
		// Une invalidation après promotion change l'objet `product` sans changer de
		// fiche. Réinitialiser sur l'objet effacerait alors les textes non sauvés.
	}, [product, form])

	useEffect(() => {
		if (activeSection === null || product.slug) return
		let alive = true
		void resoudreSlugProduit(pb, product.name).then((slug) => {
			if (alive) setRepairedSlug(slug)
		})
		return () => {
			alive = false
		}
	}, [activeSection, pb, product.name, product.slug])

	const cancel = () => {
		form.reset(productDetailValues(product))
		// Promotion et suppression sont déjà parties au serveur. Annuler ne doit
		// revenir que sur la galerie différée, jamais ressusciter l'état précédent.
		setGallery(baseGallery)
		setPendingMain(null)
		setImagesTouched(false)
		setActiveSection(null)
	}

	const galleryDirty = !memeGalerie(baseGallery, gallery)
	const hasChanges =
		form.formState.isDirty || galleryDirty || imagesTouched || !!pendingMain
	// Une card peut être refermée avant l'enregistrement sans perdre son
	// brouillon. L'inventaire distant doit donc rester disponible tant qu'une
	// modification attend d'être sauvée, pas seulement pendant l'édition visible.
	const syncAfterSave = useSyncAfterSave(activeSection !== null || hasChanges)

	const submit = async (data: ProductDetailValues) => {
		if (!hasChanges) return
		try {
			const slug = product.slug
				? ''
				: repairedSlug || (await resoudreSlugProduit(pb, data.name))
			const payload = {
				...productDetailPayload(data),
				gallery: memeGalerie(baseGallery, gallery) ? undefined : gallery,
				...(!product.slug && slug ? { slug } : {}),
			}
			let saved = await update.mutateAsync({ id: product.id, data: payload })

			// La vedette désignée avant envoi, promue maintenant. Son nom se déduit
			// du RANG : PocketBase traite les noms déjà soumis d'abord, puis ajoute
			// les téléversements derrière, dans leur ordre
			// (`forms/record_upsert.go:461`, et `gallery-order.ts`). Le fichier
			// désigné occupe donc, dans la galerie enregistrée, le rang
			// « nombre de noms conservés + son rang parmi les fichiers neufs ».
			if (pendingMain) {
				const conserves = gallery.filter(
					(entree) => typeof entree === 'string',
				).length
				const rang = gallery
					.filter((entree): entree is File => entree instanceof File)
					.indexOf(pendingMain)
				const nom = rang < 0 ? undefined : saved.gallery?.[conserves + rang]
				if (nom) {
					try {
						const after = await promote.mutateAsync({
							productId: product.id,
							filename: nom,
						})
						saved = { ...saved, image: after.image, gallery: after.gallery }
					} catch (error) {
						// L'enregistrement, lui, a réussi : on ne le déclare pas perdu
						// pour une vedette non désignée. Elle reste à un clic.
						toast.warning(
							`Images enregistrées, mais la principale reste à désigner : ${pocketbaseErrorMessage(error)}`,
						)
					}
				}
			}

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

			const syncImages = galleryDirty || imagesTouched || !!pendingMain
			// L'état d'AVANT, pris sur la fiche telle qu'elle était en base : le
			// filtre de `proposer` n'ouvre la modale que si un champ qui atteint la
			// page publique a bougé. Un prix d'achat ou un fournisseur ne compte pas.
			const avant = product
			form.reset(productDetailValues(saved))
			setGallery(saved.gallery ?? [])
			setBaseGallery(saved.gallery ?? [])
			setCurrentImage(pendingMain ? (saved.image ?? null) : null)
			setPendingMain(null)
			setImagesTouched(false)
			setActiveSection(null)
			toast.success('Produit modifié')
			// Seul le retour PocketBase connaît les noms attribués aux nouveaux
			// fichiers de galerie ; l'empreinte ne doit jamais partir des valeurs RHF.
			await syncAfterSave.proposer(
				saved as unknown as CatalogProduct,
				syncImages,
				avant,
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
		activeSection,
		start: (section: ProductDetailSection) => setActiveSection(section),
		close: () => setActiveSection(null),
		cancel,
		submit,
		hasChanges,
		galleryDirty,
		imagesTouched,
		gallery,
		setGallery: (value: GalleryEntry[]) => {
			setGallery(value)
			setPendingMain((actuel) => {
				// Retirer l'image qu'on venait de désigner annule la désignation :
				// sinon elle serait promue au rang d'une autre après enregistrement.
				if (actuel && value.includes(actuel)) return actuel
				// UNE FICHE SANS VEDETTE EN PREND UNE. Le premier fichier importé
				// devient l'image mise en avant par défaut — sans cela, un produit
				// né en caisse partait en ligne avec des photos mais sans visuel de
				// tête, et il fallait un second geste que personne ne fait. Ce n'est
				// qu'un DÉFAUT : l'étoile d'une autre tuile le remplace, et un
				// produit qui a déjà une principale n'est jamais touché.
				const vedette = currentImage ?? product.image ?? ''
				if (vedette !== '') return null
				return (
					value.find((entree): entree is File => entree instanceof File) ?? null
				)
			})
		},
		currentImage,
		promoteImage,
		pendingMain,
		/** Désigner une entrée de galerie comme future principale. Un nom déjà en
		 *  base part tout de suite par la route ; un fichier neuf attend
		 *  l'enregistrement. */
		designateMain: (entree: GalleryEntry) => {
			if (typeof entree === 'string') {
				void promoteImage(entree)
				return
			}
			setPendingMain(entree)
		},
		removeMainImage,
		pending: update.isPending || promote.isPending || removeMain.isPending,
		promoting: promote.isPending,
		removingMain: removeMain.isPending,
		dialogue: syncAfterSave.dialogue,
	}
}
