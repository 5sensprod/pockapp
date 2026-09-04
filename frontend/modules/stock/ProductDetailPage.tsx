import { ArrowLeft, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBrands } from '@/lib/queries/brands'
import { useCatalogProduct } from '@/lib/queries/catalog-products'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useBlocker, useNavigate, useParams } from '@tanstack/react-router'

import { ProductDetailHeader } from './components/detail/ProductDetailHeader'
import { ProductIdentityCard } from './components/detail/ProductIdentityCard'
import { ProductLinksCard } from './components/detail/ProductLinksCard'
import { ProductPricingCard } from './components/detail/ProductPricingCard'
import { ProductSitePanel } from './components/detail/ProductSitePanel'
import { ProductStockCard } from './components/detail/ProductStockCard'
import { EditableDetailCard } from './components/detail/detail-primitives'
import {
	type ProductDetailSection,
	useProductDetailEditor,
} from './components/detail/useProductDetailEditor'

export function ProductDetailPage() {
	const { productId } = useParams({ from: '/stock/produits/$productId' })
	const navigate = useNavigate()
	const pb = usePocketBase()
	const { activeCompanyId } = useActiveCompany()
	const productQuery = useCatalogProduct(productId)
	const brands = useBrands({ companyId: activeCompanyId ?? undefined })

	if (productQuery.isLoading) {
		return (
			<p className='container mx-auto px-6 py-12 text-muted-foreground'>
				Lecture de la fiche…
			</p>
		)
	}
	if (!productQuery.data) {
		return (
			<div className='container mx-auto space-y-4 px-6 py-12'>
				<h1 className='font-semibold text-xl'>Produit introuvable</h1>
				<p className='text-muted-foreground'>
					{productQuery.error
						? String(productQuery.error)
						: "Cette fiche n'existe plus."}
				</p>
				<Button
					variant='outline'
					onClick={() => navigate({ to: '/stock/produits' })}
				>
					<ArrowLeft className='mr-2 h-4 w-4' />
					Retour aux produits
				</Button>
			</div>
		)
	}

	return (
		<ProductDetailContent
			product={productQuery.data}
			brandName={
				brands.data?.find((brand) => brand.id === productQuery.data.brand)?.name
			}
			imageUrl={
				productQuery.data.image
					? pb.files.getUrl(productQuery.data, productQuery.data.image)
					: null
			}
			onBack={() => navigate({ to: '/stock/produits' })}
		/>
	)
}

function ProductDetailContent({
	product,
	brandName,
	imageUrl,
	onBack,
}: {
	product: NonNullable<ReturnType<typeof useCatalogProduct>['data']>
	brandName?: string
	imageUrl: string | null
	onBack: () => void
}) {
	const editor = useProductDetailEditor(product)
	const dirty = editor.form.formState.dirtyFields
	const dirtySections: Record<ProductDetailSection, boolean> = {
		identity: Boolean(
			dirty.designation ||
				dirty.sku ||
				dirty.barcode ||
				dirty.brand ||
				dirty.supplier ||
				dirty.categories ||
				dirty.commercial_state ||
				dirty.sale_state,
		),
		pricing: Boolean(
			dirty.price_ttc || dirty.purchase_price_ht || dirty.tax_rate,
		),
		stock: Boolean(
			dirty.stock || dirty.min_stock || dirty.type || dirty.manage_stock,
		),
		content: Boolean(dirty.name || dirty.description),
		visuals: editor.galleryDirty || editor.imagesTouched,
	}

	// ═══════════════════════════════════════════════════════════════════════
	// QUITTER LA FICHE SANS L'ENREGISTRER
	// ═══════════════════════════════════════════════════════════════════════
	// Le bandeau « Enregistrer » ne protège rien si la page peut disparaître
	// sous lui : un clic sur « Retour », une entrée de menu, et le travail est
	// perdu sans un mot.
	//
	// **Une seule interception suffit.** Le bouton « Retour » du bandeau ne fait
	// pas exception : il appelle `navigate()`, donc il passe par l'historique du
	// routeur comme le menu. L'intercepter EN PLUS rouvrait la question juste
	// après y avoir répondu — on l'a essayé, et c'était le bug.
	// Reste `beforeunload` pour la fermeture de la fenêtre, hors du routeur :
	// le navigateur pose alors sa propre phrase, qu'on ne peut pas formuler.
	//
	// « Enregistrer et quitter » ne quitte QUE si l'enregistrement a réussi :
	// `saveNow` rend un booléen exprès (voir `useProductDetailEditor`). Un refus
	// PocketBase laisse la fiche à l'écran, avec son texte.
	const [enregistrementEnCours, setEnregistrementEnCours] = useState(false)
	const [sortieAmorcee, setSortieAmorcee] = useState(false)
	// ⚠️ **LA CONDITION RESTE VRAIE PENDANT L'ENREGISTREMENT**, et pas seulement
	// tant qu'il y a des modifications. Mesuré : `useBlocker` retire son
	// abonnement à l'historique dès que `condition` repasse à `false`
	// (`useBlocker.js`, le `return` de l'effet), MAIS son `resolver` reste
	// `blocked` tant que la promesse n'est pas résolue. « Enregistrer et
	// quitter » faisait donc tomber la condition — plus rien de modifié — AVANT
	// d'appeler `proceed()` : l'abonnement était déjà parti, la navigation
	// perdue, et la boîte restait à l'écran sur une fiche pourtant enregistrée.
	const blocage = useBlocker({
		condition: editor.hasChanges || sortieAmorcee,
	})

	useEffect(() => {
		if (!editor.hasChanges) return
		const avertir = (event: BeforeUnloadEvent) => {
			event.preventDefault()
			// Les navigateurs ignorent le texte fourni depuis 2016 et affichent
			// leur propre phrase ; `returnValue` reste ce qui DÉCLENCHE la boîte.
			event.returnValue = ''
		}
		window.addEventListener('beforeunload', avertir)
		return () => window.removeEventListener('beforeunload', avertir)
	}, [editor.hasChanges])

	const quitterVraiment = () => {
		setSortieAmorcee(false)
		blocage.proceed()
	}

	const resterIci = () => {
		setSortieAmorcee(false)
		blocage.reset()
	}

	const enregistrerPuisQuitter = async () => {
		// Posé AVANT l'attente : c'est ce drapeau qui tient l'abonnement du
		// bloqueur en vie pendant que l'enregistrement fait tomber `hasChanges`.
		setSortieAmorcee(true)
		setEnregistrementEnCours(true)
		const enregistre = await editor.saveNow()
		setEnregistrementEnCours(false)
		if (enregistre) quitterVraiment()
		else resterIci()
	}

	useEffect(() => {
		if (editor.activeSection === null) return
		const closeOutside = (event: PointerEvent) => {
			if (!(event.target instanceof Element)) return
			if (event.target.closest('[data-editable-card]')) return
			// ⚠️ `role="alertdialog"` est aussi indispensable que `role="dialog"` :
			// la confirmation de suppression de l'image principale en est une, et
			// sans elle le `pointerdown` fermait la carte « Visuels » — donc
			// démontait la boîte — AVANT que le `click` sur « Supprimer
			// définitivement » ne l'atteigne. La seule image du produit devenait
			// alors impossible à supprimer, sans le moindre message.
			if (
				event.target.closest(
					'[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper], [data-sonner-toast]',
				)
			) {
				return
			}
			editor.close()
		}
		document.addEventListener('pointerdown', closeOutside)
		return () => document.removeEventListener('pointerdown', closeOutside)
	}, [editor.activeSection, editor.close])

	return (
		<Form {...editor.form}>
			<form onSubmit={editor.form.handleSubmit(editor.submit)}>
				<ProductDetailHeader
					product={product}
					designation={editor.form.watch('designation')}
					status={editor.form.watch('status')}
					brandName={brandName}
					imageUrl={imageUrl}
					canSave={editor.hasChanges}
					pending={editor.pending}
					onBack={onBack}
				/>

				<main className='container mx-auto grid items-start gap-5 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_430px]'>
					<div className='grid content-start gap-4 self-start'>
						<EditableDetailCard
							title='Identité du produit'
							banner='Vous pouvez maintenant modifier les informations du produit.'
							editing={editor.activeSection === 'identity'}
							dirty={dirtySections.identity}
							onEdit={() => editor.start('identity')}
						>
							<div className='grid gap-x-7 gap-y-5 md:grid-cols-3'>
								<ProductIdentityCard
									editing={editor.activeSection === 'identity'}
									form={editor.form}
									embedded
								/>
								<ProductLinksCard
									editing={editor.activeSection === 'identity'}
									form={editor.form}
									embedded
								/>
							</div>
						</EditableDetailCard>

						<EditableDetailCard
							title='Prix et marge'
							banner='Modifiez les tarifs. La marge est recalculée automatiquement.'
							editing={editor.activeSection === 'pricing'}
							dirty={dirtySections.pricing}
							onEdit={() => editor.start('pricing')}
						>
							<ProductPricingCard
								editing={editor.activeSection === 'pricing'}
								form={editor.form}
								embedded
							/>
						</EditableDetailCard>

						<EditableDetailCard
							title='Stock et disponibilité'
							banner='Vous pouvez modifier la quantité et les paramètres de suivi.'
							editing={editor.activeSection === 'stock'}
							dirty={dirtySections.stock}
							onEdit={() => editor.start('stock')}
						>
							<ProductStockCard
								editing={editor.activeSection === 'stock'}
								form={editor.form}
								embedded
							/>
						</EditableDetailCard>
					</div>
					<aside className='self-start lg:sticky lg:top-[104px]'>
						<ProductSitePanel
							product={product}
							activeSection={editor.activeSection}
							dirtySections={dirtySections}
							onEdit={editor.start}
							form={editor.form}
							gallery={editor.gallery}
							onGalleryChange={editor.setGallery}
							currentImage={editor.currentImage}
							onPromote={editor.promoteImage}
							onDesignateMain={editor.designateMain}
							pendingMain={editor.pendingMain}
							brandName={brandName}
							onSaveNow={editor.saveNow}
							saving={editor.pending}
							onRemoveMain={editor.removeMainImage}
							promoting={editor.promoting}
							removingMain={editor.removingMain}
							disabled={editor.pending}
						/>
					</aside>
				</main>
			</form>
			{editor.dialogue}

			<AlertDialog
				open={blocage.status === 'blocked'}
				onOpenChange={(ouvert) => {
					if (!ouvert) resterIci()
				}}
			>
				<AlertDialogContent className='sm:max-w-[560px]'>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Cette fiche n’est pas enregistrée
						</AlertDialogTitle>
						<AlertDialogDescription>
							Le texte, les prix ou les images modifiés seront perdus si tu
							quittes maintenant.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{/* Une seule rangée, alignée à droite, dans l'ordre de gravité
					    croissante : rester, partir, enregistrer. Le pied par défaut
					    empile en colonne sous 640 px — c'est voulu, la boîte reste
					    lisible sur un écran de caisse étroit. */}
					<AlertDialogFooter className='gap-2 sm:justify-end'>
						<AlertDialogCancel className='mt-0' onClick={resterIci}>
							Rester sur la fiche
						</AlertDialogCancel>
						<Button
							type='button'
							variant='outline'
							className='text-destructive hover:text-destructive'
							onClick={quitterVraiment}
							disabled={enregistrementEnCours}
						>
							Quitter sans enregistrer
						</Button>
						<AlertDialogAction
							onClick={(event) => {
								// Sans cela, Radix referme la boîte AVANT la fin de
								// l'enregistrement, et un refus n'aurait plus où s'afficher.
								event.preventDefault()
								void enregistrerPuisQuitter()
							}}
							disabled={enregistrementEnCours}
						>
							{enregistrementEnCours && (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							)}
							Enregistrer et quitter
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Form>
	)
}
