import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBrands } from '@/lib/queries/brands'
import { useCatalogProduct } from '@/lib/queries/catalog-products'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import { useNavigate, useParams } from '@tanstack/react-router'

import { ProductDetailHeader } from './components/detail/ProductDetailHeader'
import { ProductIdentityCard } from './components/detail/ProductIdentityCard'
import { ProductLinksCard } from './components/detail/ProductLinksCard'
import { ProductPricingCard } from './components/detail/ProductPricingCard'
import { ProductSitePanel } from './components/detail/ProductSitePanel'
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

				<main className='container mx-auto grid items-start gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(340px,0.9fr)]'>
					<div
						className={cn('grid content-start gap-4 self-start xl:grid-cols-2')}
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
					<aside className='self-start'>
						<ProductSitePanel
							product={product}
							editing={editor.editing}
							form={editor.form}
							gallery={editor.gallery}
							onGalleryChange={editor.setGallery}
							currentImage={editor.currentImage}
							onPromote={editor.promoteImage}
							onRemoveMain={editor.removeMainImage}
							promoting={editor.promoting}
							removingMain={editor.removingMain}
							disabled={editor.pending}
						/>
					</aside>
				</main>
			</form>
			{editor.dialogue}
		</Form>
	)
}
