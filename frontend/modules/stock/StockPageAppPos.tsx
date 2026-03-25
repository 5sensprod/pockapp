// frontend/modules/stock/StockPageAppPos.tsx
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
	Building2,
	ClipboardList,
	Database,
	LogIn,
	Package,
	RefreshCw,
	Tags,
	Truck,
	X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
	getAppPosToken,
	loginToAppPos,
	useAppPosBrands,
	useAppPosCategories,
	useAppPosProducts,
	useAppPosSuppliers,
} from '@/lib/apppos'
import { useAppPosStockUpdates } from '@/lib/apppos'
import type {
	BrandsResponse,
	CategoriesResponse,
	SuppliersResponse,
} from '@/lib/pocketbase-types'
import { Link } from '@tanstack/react-router'
import { BrandListAppPos } from './components/BrandListAppPos'
import { CategoryTreeAppPos } from './components/CategoryTreeAppPos'
import { ProductTable, type ProductWithExpand } from './components/ProductTable'
import { SupplierListAppPos } from './components/SupplierListAppPos'

const APPPOS_CREDENTIALS = {
	username: import.meta.env.VITE_APPPOS_USERNAME ?? '',
	password: import.meta.env.VITE_APPPOS_PASSWORD ?? '',
}

type PanelType = 'categories' | 'brands' | 'suppliers' | null

export function StockPageAppPos() {
	const [searchTerm, setSearchTerm] = useState('')
	const [selectedCategory, setSelectedCategory] =
		useState<CategoriesResponse | null>(null)
	const [selectedBrand, setSelectedBrand] = useState<BrandsResponse | null>(
		null,
	)
	const [selectedSupplier, setSelectedSupplier] =
		useState<SuppliersResponse | null>(null)
	const [activePanel, setActivePanel] = useState<PanelType>(null)

	const [isAppPosConnected, setIsAppPosConnected] = useState(false)
	const [isConnecting, setIsConnecting] = useState(true)
	const [connectionError, setConnectionError] = useState<string | null>(null)

	useEffect(() => {
		const connect = async () => {
			if (getAppPosToken()) {
				setIsAppPosConnected(true)
				setIsConnecting(false)
				return
			}
			try {
				const res = await loginToAppPos(
					APPPOS_CREDENTIALS.username,
					APPPOS_CREDENTIALS.password,
				)
				if (res.success && res.token) setIsAppPosConnected(true)
				else throw new Error('Login failed')
			} catch (e) {
				setConnectionError(
					e instanceof Error ? e.message : 'Impossible de se connecter',
				)
				setIsAppPosConnected(false)
			} finally {
				setIsConnecting(false)
			}
		}
		connect()
	}, [])

	const {
		data: productsData,
		isLoading: productsLoading,
		refetch: refetchProducts,
		error: productsError,
	} = useAppPosProducts({
		enabled: isAppPosConnected,
		searchTerm: searchTerm || undefined,
	})

	const {
		data: categories,
		isLoading: categoriesLoading,
		refetch: refetchCategories,
	} = useAppPosCategories({ enabled: isAppPosConnected })

	const {
		data: brandsData,
		isLoading: brandsLoading,
		refetch: refetchBrands,
	} = useAppPosBrands({ enabled: isAppPosConnected })

	const {
		data: suppliersData,
		isLoading: suppliersLoading,
		refetch: refetchSuppliers,
	} = useAppPosSuppliers({ enabled: isAppPosConnected })

	useAppPosStockUpdates({ enabled: isAppPosConnected })

	// Filtrage local combiné
	const allProducts = useMemo(
		() =>
			(productsData?.items ?? []).map((p: any) => ({
				...p,
				id: p.id ?? p._id,
				barcode: p.barcode ?? p.sku ?? null,
				price_ttc: p.price_ttc ?? p.price ?? null,
				cost_price: p.cost_price ?? p.purchase_price ?? null,
				stock_quantity: p.stock_quantity ?? p.stock ?? null,
				active: p.active ?? (p.status ? p.status !== 'draft' : true),
				images: p.images ?? p.image?.src ?? p.image?.url ?? null,
				expand: {
					brand: p.brand_ref
						? { id: p.brand_ref.id, name: p.brand_ref.name }
						: undefined,
					supplier: p.supplier_ref
						? { id: p.supplier_ref.id, name: p.supplier_ref.name }
						: undefined,
					categories:
						p.categories_refs?.map((c: any) => ({ id: c.id, name: c.name })) ??
						[],
				},
			})) as ProductWithExpand[],
		[productsData],
	)

	const filteredProducts = useMemo(() => {
		let result = allProducts
		if (selectedCategory) {
			result = result.filter(
				(p: any) =>
					p.categories?.includes(selectedCategory.id) ||
					p.category_id === selectedCategory.id,
			)
		}
		if (selectedBrand) {
			result = result.filter(
				(p: any) =>
					p.expand?.brand?.id === selectedBrand.id ||
					p.brand === selectedBrand.id,
			)
		}
		if (selectedSupplier) {
			result = result.filter(
				(p: any) =>
					p.expand?.supplier?.id === selectedSupplier.id ||
					p.supplier === selectedSupplier.id,
			)
		}
		return result
	}, [allProducts, selectedCategory, selectedBrand, selectedSupplier])

	const activeFilters = [
		selectedCategory && {
			key: 'category',
			label: `Catégorie : ${selectedCategory.name}`,
			clear: () => setSelectedCategory(null),
		},
		selectedBrand && {
			key: 'brand',
			label: `Marque : ${selectedBrand.name}`,
			clear: () => setSelectedBrand(null),
		},
		selectedSupplier && {
			key: 'supplier',
			label: `Fournisseur : ${selectedSupplier.name}`,
			clear: () => setSelectedSupplier(null),
		},
	].filter(Boolean) as { key: string; label: string; clear: () => void }[]

	const hasFilters = activeFilters.length > 0 || !!searchTerm

	const handleRefresh = () => {
		refetchProducts()
		refetchCategories()
		refetchBrands()
		refetchSuppliers()
	}

	const togglePanel = (panel: PanelType) =>
		setActivePanel((prev) => (prev === panel ? null : panel))

	const handleRetryConnection = async () => {
		setIsConnecting(true)
		setConnectionError(null)
		try {
			const res = await loginToAppPos(
				APPPOS_CREDENTIALS.username,
				APPPOS_CREDENTIALS.password,
			)
			if (res.success && res.token) setIsAppPosConnected(true)
			else throw new Error('Login failed')
		} catch (e) {
			setConnectionError(
				e instanceof Error ? e.message : 'Impossible de se connecter',
			)
		} finally {
			setIsConnecting(false)
		}
	}

	if (isConnecting)
		return (
			<div className='flex items-center justify-center h-full min-h-[400px]'>
				<div className='text-center'>
					<RefreshCw className='h-8 w-8 animate-spin mx-auto mb-4 text-orange-500' />
					<h2 className='text-lg font-medium'>Connexion à AppPOS...</h2>
					<p className='text-sm text-muted-foreground mt-1'>
						http://localhost:3000
					</p>
				</div>
			</div>
		)

	if (connectionError || !isAppPosConnected)
		return (
			<div className='flex items-center justify-center h-full min-h-[400px]'>
				<div className='text-center max-w-md'>
					<div className='w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4'>
						<Database className='h-8 w-8 text-red-500' />
					</div>
					<h2 className='text-lg font-medium text-red-600'>
						Connexion à AppPOS échouée
					</h2>
					<p className='text-sm text-muted-foreground mt-2 mb-4'>
						{connectionError || "Impossible de se connecter à l'API AppPOS"}
					</p>
					<Button onClick={handleRetryConnection} className='gap-2'>
						<LogIn className='h-4 w-4' />
						Réessayer la connexion
					</Button>
				</div>
			</div>
		)

	const railItems: {
		id: PanelType
		icon: React.ReactNode
		label: string
		hasFilter: boolean
	}[] = [
		{
			id: 'categories',
			icon: <Tags className='h-5 w-5' />,
			label: 'Catégories',
			hasFilter: !!selectedCategory,
		},
		{
			id: 'brands',
			icon: <Building2 className='h-5 w-5' />,
			label: 'Marques',
			hasFilter: !!selectedBrand,
		},
		{
			id: 'suppliers',
			icon: <Truck className='h-5 w-5' />,
			label: 'Fournisseurs',
			hasFilter: !!selectedSupplier,
		},
	]

	return (
		<div className='flex h-full min-h-0 overflow-hidden'>
			{/* Rail fixe */}
			<div className='w-14 bg-muted border-r flex flex-col items-center py-4 gap-2 shrink-0'>
				{railItems.map((item) => (
					<div key={item.id} className='relative'>
						<button
							type='button'
							onClick={() => togglePanel(item.id)}
							className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-accent ${
								activePanel === item.id ? 'bg-primary/15 text-primary' : ''
							}`}
							title={item.label}
						>
							{item.icon}
						</button>
						{item.hasFilter && (
							<span className='absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-primary' />
						)}
					</div>
				))}
			</div>

			{/* Panneau latéral coulissant */}
			<div
				className={`transition-[width] duration-200 ease-in-out overflow-hidden border-r bg-background flex-shrink-0 ${
					activePanel ? 'w-64' : 'w-0 border-r-0'
				}`}
			>
				<div className='w-64 h-full'>
					{activePanel === 'categories' && (
						<CategoryTreeAppPos
							categories={categories || []}
							isLoading={categoriesLoading}
							selectedId={selectedCategory?.id ?? null}
							onSelect={setSelectedCategory}
							onClose={() => setActivePanel(null)}
						/>
					)}
					{activePanel === 'brands' && (
						<BrandListAppPos
							brands={brandsData || []}
							isLoading={brandsLoading}
							selectedId={selectedBrand?.id ?? null}
							onSelect={setSelectedBrand}
							onClose={() => setActivePanel(null)}
						/>
					)}
					{activePanel === 'suppliers' && (
						<SupplierListAppPos
							suppliers={suppliersData || []}
							isLoading={suppliersLoading}
							selectedId={selectedSupplier?.id ?? null}
							onSelect={setSelectedSupplier}
							onClose={() => setActivePanel(null)}
						/>
					)}
				</div>
			</div>

			{/* Contenu principal */}
			<div className='flex-1 overflow-auto'>
				<div className='container mx-auto px-6 py-8'>
					{/* Header */}
					<div className='mb-6 flex items-center gap-3'>
						<div className='w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0'>
							<Database className='h-6 w-6 text-orange-500' />
						</div>
						<div className='flex-1'>
							<div className='flex items-center gap-2'>
								<h1 className='text-3xl font-bold'>Stock</h1>
								<Badge
									variant='outline'
									className='text-orange-600 border-orange-300'
								>
									AppPOS
								</Badge>
								<Badge className='bg-green-500'>Connecté</Badge>
							</div>
							<p className='text-muted-foreground text-sm'>
								http://localhost:3000
							</p>
						</div>
						<Link to='/inventory-apppos'>
							<Button variant='outline' size='sm' className='gap-2'>
								<ClipboardList className='h-4 w-4' />
								Inventaire
							</Button>
						</Link>
						<Button
							variant='outline'
							size='sm'
							onClick={handleRefresh}
							className='gap-2'
						>
							<RefreshCw className='h-4 w-4' />
							Rafraîchir
						</Button>
					</div>

					{productsError && (
						<div className='bg-red-50 border border-red-200 rounded-lg p-4 mb-4'>
							<p className='text-red-800 text-sm'>
								<strong>Erreur :</strong> {(productsError as Error).message}
							</p>
						</div>
					)}

					{/* Barre de recherche */}
					<div className='flex items-center gap-4 mb-3'>
						<div className='flex-1 max-w-md'>
							<Input
								placeholder='Rechercher un produit (nom, SKU, code-barres)...'
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
						</div>
						<Badge variant='secondary'>
							<Package className='h-3.5 w-3.5 mr-1' />
							{filteredProducts.length} produit
							{filteredProducts.length > 1 ? 's' : ''}
						</Badge>
					</div>

					{/* Tags filtres actifs */}
					{activeFilters.length > 0 && (
						<div className='flex flex-wrap items-center gap-2 mb-4'>
							{activeFilters.map((f) => (
								<span
									key={f.key}
									className='flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full'
								>
									{f.label}
									<button
										type='button'
										onClick={f.clear}
										className='hover:opacity-70'
									>
										<X className='h-3 w-3' />
									</button>
								</span>
							))}
							{activeFilters.length > 1 && (
								<button
									type='button'
									onClick={() => {
										setSelectedCategory(null)
										setSelectedBrand(null)
										setSelectedSupplier(null)
									}}
									className='text-xs text-muted-foreground hover:text-foreground underline'
								>
									Tout effacer
								</button>
							)}
						</div>
					)}

					{/* Liste produits */}
					{productsLoading ? (
						<div className='text-center py-12 text-muted-foreground'>
							<RefreshCw className='h-6 w-6 animate-spin mx-auto mb-2' />
							Chargement depuis AppPOS...
						</div>
					) : filteredProducts.length === 0 ? (
						<div className='text-center py-16 text-muted-foreground'>
							<Package className='h-10 w-10 mx-auto mb-3 opacity-30' />
							<p className='font-medium mb-1'>Aucun produit trouvé</p>
							{hasFilters && (
								<>
									<p className='text-sm mb-3'>
										Des filtres sont actifs — essayez de les supprimer.
									</p>
									<Button
										variant='outline'
										size='sm'
										onClick={() => {
											setSelectedCategory(null)
											setSelectedBrand(null)
											setSelectedSupplier(null)
											setSearchTerm('')
										}}
										className='gap-2'
									>
										<X className='h-3.5 w-3.5' />
										Supprimer tous les filtres
									</Button>
								</>
							)}
						</div>
					) : (
						<ProductTable data={filteredProducts} />
					)}
				</div>
			</div>
		</div>
	)
}
