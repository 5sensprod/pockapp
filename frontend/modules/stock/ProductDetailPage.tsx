import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBrands } from '@/lib/queries/brands'
import { useCatalogProduct } from '@/lib/queries/catalog-products'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import { useNavigate, useParams } from '@tanstack/react-router'

import { ProductIdentityCard } from './components/detail/ProductIdentityCard'
import { ProductDescriptionCard } from './components/detail/ProductDescriptionCard'
import { ProductDetailHeader } from './components/detail/ProductDetailHeader'
import { ProductLinksCard } from './components/detail/ProductLinksCard'
import { ProductMediaPanel } from './components/detail/ProductMediaPanel'
import { ProductOnlinePanel } from './components/detail/ProductOnlinePanel'
import { ProductPricingCard } from './components/detail/ProductPricingCard'
import { ProductStockCard } from './components/detail/ProductStockCard'
import { useProductDetailEditor } from './components/detail/useProductDetailEditor'

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
	return (
		<Form {...editor.form}>
			<form onSubmit={editor.form.handleSubmit(editor.submit)}>
				<ProductDetailHeader
					product={product}
					brandName={brandName}
					imageUrl={imageUrl}
					editing={editor.editing}
					pending={editor.pending}
					onBack={onBack}
					onEdit={editor.start}
					onCancel={editor.cancel}
				/>

				<main className='container mx-auto grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]'>
					<div
						className={cn('grid gap-5', !editor.editing && 'xl:grid-cols-2')}
					>
						<div className='xl:col-span-2'>
							<ProductIdentityCard
								product={product}
								editing={editor.editing}
								form={editor.form}
							/>
						</div>
						<ProductPricingCard
							product={product}
							editing={editor.editing}
							form={editor.form}
						/>
						<ProductStockCard
							product={product}
							editing={editor.editing}
							form={editor.form}
						/>
						<div className='xl:col-span-2'>
							<ProductLinksCard
								product={product}
								editing={editor.editing}
								form={editor.form}
							/>
						</div>
					</div>
					<aside className='space-y-5'>
						<ProductMediaPanel
							product={product}
							editing={editor.editing}
							gallery={editor.gallery}
							onGalleryChange={editor.setGallery}
							currentImage={editor.currentImage}
							onPromote={editor.promoteImage}
							onRemoveMain={editor.removeMainImage}
							promoting={editor.promoting}
							removingMain={editor.removingMain}
							disabled={editor.pending}
						/>
						<ProductDescriptionCard
							product={product}
							editing={editor.editing}
							form={editor.form}
						/>
						<ProductOnlinePanel
							product={product}
							editing={editor.editing}
							form={editor.form}
						/>
					</aside>
				</main>
			</form>
			{editor.dialogue}
		</Form>
	)
}
