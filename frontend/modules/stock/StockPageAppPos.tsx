// frontend/modules/stock/StockPageAppPos.tsx
// Version de StockPage qui se connecte à l'API AppPOS au lieu de PocketBase

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
	Building2,
	Database,
	LogIn,
	Package,
	RefreshCw,
	Tags,
	Truck,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import {
	// buildAppPosCategoryTree,
	getAppPosToken,
	loginToAppPos,
	useAppPosBrands,
	useAppPosCategories,
	useAppPosProducts,
	useAppPosSuppliers,
} from '@/lib/apppos'
import type { CategoriesResponse } from '@/lib/pocketbase-types'

import { BrandListAppPos } from './components/BrandListAppPos'
import { CategoryTreeAppPos } from './components/CategoryTreeAppPos'
// Import des composants
import { ProductTable, type ProductWithExpand } from './components/ProductTable'
import { SupplierListAppPos } from './components/SupplierListAppPos'

// ============================================================================
// CONFIGURATION APPPOS - À MODIFIER SELON TON ENVIRONNEMENT
// ============================================================================
const APPPOS_CREDENTIALS = {
	username: 'admin',
	password: 'admin123', // Change avec ton vrai mot de passe
}

export function StockPageAppPos() {
	const [searchTerm, setSearchTerm] = useState('')
	const [selectedCategory, setSelectedCategory] =
		useState<CategoriesResponse | null>(null)
	const [activeTab, setActiveTab] = useState('products')

	// État de connexion AppPOS
	const [isAppPosConnected, setIsAppPosConnected] = useState(false)
	const [isConnecting, setIsConnecting] = useState(true)
	const [connectionError, setConnectionError] = useState<string | null>(null)

	// Login automatique à AppPOS au montage
	useEffect(() => {
		const connectToAppPos = async () => {
			// Vérifier si déjà connecté
			if (getAppPosToken()) {
				setIsAppPosConnected(true)
				setIsConnecting(false)
				return
			}

			try {
				setIsConnecting(true)
				setConnectionError(null)

				const response = await loginToAppPos(
					APPPOS_CREDENTIALS.username,
					APPPOS_CREDENTIALS.password,
				)

				if (response.success && response.token) {
					setIsAppPosConnected(true)
					console.log('✅ Connecté à AppPOS:', response.user.username)
				} else {
					throw new Error('Login failed')
				}
			} catch (error) {
				console.error('❌ Erreur connexion AppPOS:', error)
				setConnectionError(
					error instanceof Error
						? error.message
						: 'Impossible de se connecter à AppPOS',
				)
				setIsAppPosConnected(false)
			} finally {
				setIsConnecting(false)
			}
		}

		connectToAppPos()
	}, [])

	// Hooks AppPOS - activés seulement si connecté
	const {
		data: productsData,
		isLoading: productsLoading,
		refetch: refetchProducts,
		error: productsError,
	} = useAppPosProducts({
		enabled: isAppPosConnected,
		searchTerm: searchTerm || undefined,
		categoryId: selectedCategory?.id,
	})

	const {
		data: categories,
		isLoading: categoriesLoading,
		refetch: refetchCategories,
	} = useAppPosCategories({
		enabled: isAppPosConnected,
	})

	const {
		data: brands,
		isLoading: brandsLoading,
		refetch: refetchBrands,
	} = useAppPosBrands({
		enabled: isAppPosConnected,
	})

	const {
		data: suppliers,
		isLoading: suppliersLoading,
		refetch: refetchSuppliers,
	} = useAppPosSuppliers({
		enabled: isAppPosConnected,
	})

	const products = productsData?.items ?? []
	const isLoading = productsLoading

	const handleRefresh = () => {
		refetchProducts()
		refetchCategories()
		refetchBrands()
		refetchSuppliers()
	}

	const handleRetryConnection = async () => {
		setIsConnecting(true)
		setConnectionError(null)

		try {
			const response = await loginToAppPos(
				APPPOS_CREDENTIALS.username,
				APPPOS_CREDENTIALS.password,
			)

			if (response.success && response.token) {
				setIsAppPosConnected(true)
			} else {
				throw new Error('Login failed')
			}
		} catch (error) {
			setConnectionError(
				error instanceof Error ? error.message : 'Impossible de se connecter',
			)
		} finally {
			setIsConnecting(false)
		}
	}

	// Affichage pendant la connexion
	if (isConnecting) {
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
	}

	// Affichage si erreur de connexion
	if (connectionError || !isAppPosConnected) {
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
					<div className='bg-muted/50 rounded-lg p-4 text-left text-sm mb-4'>
						<p className='font-medium mb-2'>Vérifiez que :</p>
						<ul className='list-disc list-inside space-y-1 text-muted-foreground'>
							<li>Le serveur AppPOS est démarré</li>
							<li>L'URL est correcte (http://localhost:3000)</li>
							<li>Les identifiants sont corrects</li>
						</ul>
					</div>
					<Button onClick={handleRetryConnection} className='gap-2'>
						<LogIn className='h-4 w-4' />
						Réessayer la connexion
					</Button>
				</div>
			</div>
		)
	}

	// Affichage normal une fois connecté
	return (
		<div className='flex h-full min-h-0'>
			{/* Sidebar Catégories (visible uniquement sur l'onglet produits) */}
			{activeTab === 'products' && (
				<div className='w-64 border-r bg-muted/30 flex-shrink-0'>
					<CategoryTreeAppPos
						categories={categories || []}
						isLoading={categoriesLoading}
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
							<div className='w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center'>
								<Database className='h-6 w-6 text-orange-500' />
							</div>
							<div className='flex-1'>
								<div className='flex items-center gap-2'>
									<h1 className='text-3xl font-bold'>Stock</h1>
									<Badge
										variant='outline'
										className='text-orange-600 border-orange-300'
									>
										AppPOS API
									</Badge>
									<Badge variant='default' className='bg-green-500'>
										Connecté
									</Badge>
								</div>
								<p className='text-muted-foreground'>
									Données depuis l'API AppPOS (http://localhost:3000)
								</p>
							</div>
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

						{/* Affichage erreur si présente */}
						{productsError && (
							<div className='bg-red-50 border border-red-200 rounded-lg p-4 mb-4'>
								<p className='text-red-800 text-sm'>
									<strong>Erreur:</strong> {(productsError as Error).message}
								</p>
							</div>
						)}
					</div>

					{/* Onglets */}
					<Tabs value={activeTab} onValueChange={setActiveTab}>
						<TabsList className='mb-6'>
							<TabsTrigger value='products' className='gap-2'>
								<Package className='h-4 w-4' />
								Produits
								{!productsLoading && (
									<Badge variant='secondary' className='ml-1'>
										{products.length}
									</Badge>
								)}
							</TabsTrigger>
							<TabsTrigger value='brands' className='gap-2'>
								<Building2 className='h-4 w-4' />
								Marques
								{!brandsLoading && brands && (
									<Badge variant='secondary' className='ml-1'>
										{brands.length}
									</Badge>
								)}
							</TabsTrigger>
							<TabsTrigger value='suppliers' className='gap-2'>
								<Truck className='h-4 w-4' />
								Fournisseurs
								{!suppliersLoading && suppliers && (
									<Badge variant='secondary' className='ml-1'>
										{suppliers.length}
									</Badge>
								)}
							</TabsTrigger>
						</TabsList>

						{/* Onglet Produits */}
						<TabsContent value='products' className='space-y-4'>
							<div className='flex items-center gap-4'>
								<div className='flex-1 max-w-md'>
									<Input
										placeholder='Rechercher un produit (nom, SKU, code-barres)...'
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
									/>
								</div>
								{/* Bouton désactivé car on est en lecture seule depuis AppPOS */}
								<Button disabled title='Mode lecture seule depuis AppPOS'>
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
									<RefreshCw className='h-6 w-6 animate-spin mx-auto mb-2' />
									Chargement depuis AppPOS...
								</div>
							) : products.length === 0 ? (
								<div className='text-center py-12 text-muted-foreground'>
									{selectedCategory
										? `Aucun produit dans "${selectedCategory.name}"`
										: searchTerm
											? 'Aucun produit trouvé'
											: 'Aucun produit dans AppPOS'}
								</div>
							) : (
								<ProductTable data={products as ProductWithExpand[]} />
							)}
						</TabsContent>

						{/* Onglet Marques */}
						<TabsContent value='brands'>
							<BrandListAppPos
								brands={brands || []}
								isLoading={brandsLoading}
							/>
						</TabsContent>

						{/* Onglet Fournisseurs */}
						<TabsContent value='suppliers'>
							<SupplierListAppPos
								suppliers={suppliers || []}
								isLoading={suppliersLoading}
							/>
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	)
}
