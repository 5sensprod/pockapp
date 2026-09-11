import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { useProductDuplicateGuard } from '@/components/catalog/ProductDuplicateGuard'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import {
	type CatalogProductShape,
	invalidateCatalog,
	useCreateCatalogProduct,
	usePromoteProductImage,
	useRemoveProductMainImage,
	useUpdateCatalogProduct,
} from '@/lib/queries/catalog-products'
import { type GalleryEntry, memeGalerie } from '@/lib/queries/gallery-order'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import type { CatalogProduct } from '@/lib/queries/site-catalog'
import { setStockManually } from '@/lib/queries/stock-adjust'
import { useSyncAfterSave } from '@/lib/sync/SyncAfterSaveDialog'
import { usePocketBase } from '@/lib/use-pocketbase'

import {
	type ProductDetailValues,
	productCreationSchema,
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
	const { activeCompanyId } = useActiveCompany()
	const create = useCreateCatalogProduct()
	const isCreation = !product.id
	// Dès que la création répond, les reprises ciblent ce même enregistrement.
	const createdRecord = useRef<CatalogProductShape | null>(null)
	const [createdId, setCreatedId] = useState<string | null>(null)
	const savingRef = useRef(false)
	const [saving, setSaving] = useState(false)
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
	const loadedProductId = useRef('')
	const form = useForm<ProductDetailValues>({
		resolver: zodResolver(
			isCreation ? productCreationSchema : productDetailSchema,
		),
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
		// Une invalidation après promotion change l'objet `product` sans changer de
		// fiche. Réinitialiser sur l'objet effacerait alors les textes non sauvés.
	}, [product, form])

	const cancel = () => {
		form.reset(productDetailValues(product))
		// Promotion et suppression sont déjà parties au serveur. Annuler ne doit
		// revenir que sur la galerie différée, jamais ressusciter l'état précédent.
		setGallery(baseGallery)
		setPendingMain(null)
		setImagesTouched(false)
		setActiveSection(null)
	}

	// Doublons : sur une fiche existante, seuls les champs MODIFIÉS sont
	// comparés. Sinon une fiche dont le doublon a déjà été accepté redemanderait
	// confirmation à chaque enregistrement, prix ou stock compris.
	const identiteModifiee = (values: {
		designation?: string
		sku?: string
		barcode?: string
	}) => {
		const origine = form.formState.defaultValues
		const garder = (champ: 'designation' | 'sku' | 'barcode') =>
			isCreation ||
			(values[champ] ?? '').trim() !== (origine?.[champ] ?? '').trim()
				? values[champ]
				: ''
		return {
			designation: garder('designation'),
			sku: garder('sku'),
			barcode: garder('barcode'),
		}
	}
	const duplicates = useProductDuplicateGuard(
		identiteModifiee({
			designation: form.watch?.('designation'),
			sku: form.watch?.('sku'),
			barcode: form.watch?.('barcode'),
		}),
		activeCompanyId ?? undefined,
		product.id || createdRecord.current?.id || undefined,
	)

	const galleryDirty = !memeGalerie(baseGallery, gallery)
	const hasChanges =
		(isCreation && !createdId) ||
		form.formState.isDirty ||
		galleryDirty ||
		imagesTouched ||
		!!pendingMain
	// Une card peut être refermée avant l'enregistrement sans perdre son
	// brouillon. L'inventaire distant doit donc rester disponible tant qu'une
	// modification attend d'être sauvée, pas seulement pendant l'édition visible.
	const syncAfterSave = useSyncAfterSave(
		!isCreation && (activeSection !== null || hasChanges),
	)

	const submit = async (data: ProductDetailValues): Promise<boolean> => {
		if (savingRef.current) return false
		if (!hasChanges) return true
		if (isCreation && !activeCompanyId) {
			toast.error('Aucune entreprise active')
			return false
		}
		// Le motif AVANT toute écriture : refuser après le patch produit
		// laisserait une fiche à moitié enregistrée.
		// Contre les valeurs d'ORIGINE du formulaire, pas contre `product` : un
		// passage en Stock B fait juste avant les a déjà mises à jour, alors que
		// `product` attend encore sa relecture.
		const origine = form.formState.defaultValues
		const stockChange = data.stock !== Number(origine?.stock ?? 0)
		const stockBChange = data.stock_b !== Number(origine?.stock_b ?? 0)
		const mouvementStock = stockChange || stockBChange
		// Un prix promo qui n'est pas une baisse serait ignoré en caisse sans un
		// mot (`prixPromoActif`) : on le dit ici, où il se saisit.
		if (data.promo_price_ttc > 0 && data.promo_price_ttc >= data.price_ttc) {
			form.setError('promo_price_ttc', {
				message: 'Le prix promo doit être inférieur au prix TTC',
			})
			toast.error('Prix promo supérieur ou égal au prix TTC')
			return false
		}
		if (
			data.stock_b_price_ttc > 0 &&
			data.stock_b_price_ttc >= data.price_ttc
		) {
			form.setError('stock_b_price_ttc', {
				message: 'Le prix Stock B doit être inférieur au prix TTC',
			})
			toast.error('Prix Stock B supérieur ou égal au prix TTC')
			return false
		}
		if (mouvementStock && !data.stock_reason) {
			form.setError('stock_reason', {
				message: 'Indiquez pourquoi le stock change',
			})
			toast.error('Motif du mouvement de stock manquant')
			return false
		}
		if (
			mouvementStock &&
			data.stock_reason === 'other' &&
			!data.stock_comment.trim()
		) {
			form.setError('stock_comment', {
				message: 'Précisez le motif',
			})
			toast.error('Le motif « Autre » demande un commentaire')
			return false
		}
		savingRef.current = true
		setSaving(true)
		try {
			// Avant toute écriture : un refus ici ne laisse rien à moitié fait.
			if (
				!(await duplicates.verify(
					identiteModifiee(data),
					product.id || createdRecord.current?.id || undefined,
				))
			) {
				return false
			}
			const payload = {
				...productDetailPayload(data),
				gallery: memeGalerie(baseGallery, gallery) ? undefined : gallery,
			}
			const existingId = product.id || createdRecord.current?.id
			let saved = existingId
				? await update.mutateAsync({ id: existingId, data: payload })
				: await create.mutateAsync({
						...payload,
						name: data.name.trim(),
						company: activeCompanyId ?? undefined,
					})
			if (isCreation) createdRecord.current = saved
			// Les fichiers sont déjà stockés : une reprise ne doit pas les téléverser à nouveau.
			setGallery(saved.gallery ?? [])
			setBaseGallery(saved.gallery ?? [])

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
							productId: saved.id,
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
			setPendingMain(null)
			setCurrentImage(saved.image ?? null)
			setGallery(saved.gallery ?? [])
			setBaseGallery(saved.gallery ?? [])

			if (mouvementStock && data.stock_reason) {
				const motif = {
					reason: data.stock_reason,
					comment: data.stock_comment,
					metadata: { origin: 'product_detail' },
				}
				if (stockChange) {
					const stock = await setStockManually(pb, saved.id, data.stock, motif)
					if (!stock.applied && stock.stockAfter !== data.stock) {
						throw new Error(stock.error ?? 'ajustement du stock refusé')
					}
					saved = { ...saved, stock: stock.stockAfter ?? data.stock }
					form.resetField('stock', { defaultValue: saved.stock })
				}
				if (stockBChange) {
					const stockB = await setStockManually(pb, saved.id, data.stock_b, {
						...motif,
						counter: 'stock_b',
					})
					if (!stockB.applied && stockB.stockBAfter !== data.stock_b) {
						throw new Error(stockB.error ?? 'ajustement du Stock B refusé')
					}
					saved = { ...saved, stock_b: stockB.stockBAfter ?? data.stock_b }
					form.resetField('stock_b', { defaultValue: saved.stock_b })
				}
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
			toast.success(isCreation ? 'Produit créé' : 'Produit modifié')
			if (isCreation) {
				setCreatedId(saved.id)
				return true
			}
			// Seul le retour PocketBase connaît les noms attribués aux nouveaux
			// fichiers de galerie ; l'empreinte ne doit jamais partir des valeurs RHF.
			await syncAfterSave.proposer(
				saved as unknown as CatalogProduct,
				syncImages,
				avant,
			)
			return true
		} catch (error) {
			toast.error(
				`${createdRecord.current ? 'Produit créé, enregistrement à terminer' : 'Enregistrement refusé'} : ${pocketbaseErrorMessage(error)}`,
			)
			return false
		} finally {
			savingRef.current = false
			setSaving(false)
		}
	}

	const promoteImage = async (filename: string) => {
		const productId = product.id || createdRecord.current?.id
		if (!productId) return
		try {
			const after = await promote.mutateAsync({
				productId,
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
		const productId = product.id || createdRecord.current?.id
		if (!productId) return
		try {
			await removeMain.mutateAsync(productId)
			setCurrentImage('')
			setImagesTouched(true)
			toast.success('Image principale supprimée')
		} catch (error) {
			toast.error(`Suppression refusée : ${pocketbaseErrorMessage(error)}`)
		}
	}

	return {
		imageRecord: createdRecord.current ?? product,
		createdId,
		form,
		duplicates,
		/**
		 * Enregistrer sans passer par le bouton du bandeau.
		 *
		 * C'est ce qui permet au studio de fiche (`ProductSheetStudio`) de tenir
		 * sa promesse — ouvrir, cliquer une suggestion, enregistrer — SANS
		 * ouvrir un second chemin d'écriture : il pose ses valeurs dans le
		 * formulaire, puis appelle ceci. Tout ce que `submit` garantit reste
		 * garanti : l'ajustement de stock, le slug réparé, et la proposition de
		 * synchronisation vers le site.
		 */
		saveNow: async () => {
			// ⚠️ **Le résultat doit REMONTER.** `handleSubmit` rend `void` : sans
			// cette variable, un appelant ne peut pas distinguer un enregistrement
			// réussi d'un refus PocketBase — et le studio se refermait, ou la
			// navigation se poursuivait, sur un travail perdu. Une validation RHF
			// en échec n'appelle pas le callback : `ok` reste faux, ce qui est la
			// bonne réponse.
			let ok = false
			await form.handleSubmit(async (data) => {
				ok = await submit(data)
			})()
			return ok
		},
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
		pending:
			saving ||
			create.isPending ||
			update.isPending ||
			promote.isPending ||
			removeMain.isPending,
		promoting: promote.isPending,
		removingMain: removeMain.isPending,
		dialogue: syncAfterSave.dialogue,
	}
}
