import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, Package, Tags, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { CategoriesResponse } from '@/lib/pocketbase-types'
import { useProducts } from '@/lib/queries/products'
import { BrandList } from './components/BrandList'
import { CategoryTree } from './components/CategoryTree'
import { ProductDialog } from './components/ProductDialog'
import { ProductTable, type ProductWithExpand } from './components/ProductTable'
import { SupplierList } from './components/SupplierList'
import { manifest } from './index'

export function StockPage() {
	const [searchTerm, setSearchTerm] = useState('')
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [selectedCategory, setSelectedCategory] =
		useState<CategoriesResponse | null>(null)
	const [activeTab, setActiveTab] = useState('products')

	const { activeCompanyId } = useActiveCompany()

	const buildFilter = () => {
		const filters: string[] = []

		if (selectedCategory) {
			filters.push(`categories ~ "${selectedCategory.id}"`)
		}

		if (searchTerm) {
			filters.push(`(name ~ "${searchTerm}" || barcode ~ "${searchTerm}")`)
		}

		return filters.join(' && ')
	}

	const {
		data: productsData,
		isLoading,
		refetch,
	} = useProducts({
		companyId: activeCompanyId ?? undefined,
		filter: buildFilter(),
		expand: 'categories,brand,supplier',
	})

	// ✅ AJOUT : Force refetch quand activeCompanyId change
	useEffect(() => {
		if (activeCompanyId) {
			refetch()
		}
	}, [activeCompanyId, refetch])

	const products = productsData?.items ?? []
	const Icon = manifest.icon

	return (
		<div className='flex h-full min-h-0'>
			{/* Sidebar Catégories (visible uniquement sur l'onglet produits) */}
			{activeTab === 'products' && (
				<div className='w-64 border-r bg-muted/30 flex-shrink-0'>
					<CategoryTree
						selectedId={selectedCategory?.id ?? null}
						onSelect={setSelectedCategory}
					/>
				</div>
			)}

			{/* Contenu principal */}
			<div className='flex-1 overflow-auto'>
				<div className='container mx-auto px-6 py-8'>
					{/* Header */}
					<div className='mb-6'>
						<div className='flex items-center gap-3 mb-4'>
							<div className='w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center'>
								<Icon
									className={`h-6 w-6 ${manifest.iconColor ?? 'text-primary'}`}
								/>
							</div>
							<div className='flex-1'>
								<h1 className='text-3xl font-bold'>{manifest.name}</h1>
								<p className='text-muted-foreground'>{manifest.description}</p>
							</div>
						</div>
					</div>

					{/* Onglets */}
					<Tabs value={activeTab} onValueChange={setActiveTab}>
						<TabsList className='mb-6'>
							<TabsTrigger value='products' className='gap-2'>
								<Package className='h-4 w-4' />
								Produits
							</TabsTrigger>
							<TabsTrigger value='brands' className='gap-2'>
								<Building2 className='h-4 w-4' />
								Marques
							</TabsTrigger>
							<TabsTrigger value='suppliers' className='gap-2'>
								<Truck className='h-4 w-4' />
								Fournisseurs
							</TabsTrigger>
						</TabsList>

						{/* Onglet Produits */}
						<TabsContent value='products' className='space-y-4'>
							<div className='flex items-center gap-4'>
								<div className='flex-1 max-w-md'>
									<Input
										placeholder='Rechercher un produit...'
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
									/>
								</div>
								<Button onClick={() => setIsDialogOpen(true)}>
									Nouveau produit
								</Button>
							</div>

							{selectedCategory && (
								<div className='flex items-center gap-2 text-sm'>
									<Tags className='h-4 w-4' />
									<span>Catégorie :</span>
									<span className='font-medium'>{selectedCategory.name}</span>
									<Button
										variant='ghost'
										size='sm'
										className='h-6 px-2'
										onClick={() => setSelectedCategory(null)}
									>
										✕
									</Button>
								</div>
							)}

							{isLoading ? (
								<div className='text-center py-12 text-muted-foreground'>
									Chargement...
								</div>
							) : products.length === 0 ? (
								<div className='text-center py-12 text-muted-foreground'>
									{selectedCategory
										? `Aucun produit dans "${selectedCategory.name}"`
										: searchTerm
											? 'Aucun produit trouvé'
											: 'Aucun produit pour le moment'}
								</div>
							) : (
								<ProductTable data={products as ProductWithExpand[]} />
							)}

							<ProductDialog
								open={isDialogOpen}
								onOpenChange={setIsDialogOpen}
								defaultCategoryId={selectedCategory?.id}
							/>
						</TabsContent>

						{/* Onglet Marques */}
						<TabsContent value='brands'>
							<BrandList />
						</TabsContent>

						{/* Onglet Fournisseurs */}
						<TabsContent value='suppliers'>
							<SupplierList />
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	)
}
