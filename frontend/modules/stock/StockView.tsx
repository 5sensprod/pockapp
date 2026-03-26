// frontend/modules/stock/StockView.tsx
//
// Composant PRESENTATIONAL — zéro logique métier, zéro hook.
// Le bouton Inventaire a été retiré → il est dans le sidebarMenu (index.ts).
// Le header module est géré par ModulePageShell.
// Les états de connexion sont gérés ici car ils font partie de la vue.

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
	Building2,
	Database,
	LogIn,
	Package,
	RefreshCw,
	Tags,
	Truck,
	X,
} from 'lucide-react'

import { BrandListAppPos } from './components/BrandListAppPos'
import { CategoryTreeAppPos } from './components/CategoryTreeAppPos'
import { ProductTable } from './components/ProductTable'
import { SupplierListAppPos } from './components/SupplierListAppPos'
import type { PanelType, StockModuleData } from './useStockModule'

type StockViewProps = StockModuleData

export function StockView({
	// Connexion
	isConnecting,
	isAppPosConnected,
	connectionError,
	handleRetryConnection,

	// Recherche & filtres
	searchTerm,
	setSearchTerm,
	activePanel,
	togglePanel,
	selectedCategory,
	setSelectedCategory,
	selectedBrand,
	setSelectedBrand,
	selectedSupplier,
	setSelectedSupplier,
	activeFilters,
	hasFilters,
	handleClearAllFilters,

	// Données
	filteredProducts,
	productsLoading,
	productsError,
	categories,
	categoriesLoading,
	brandsData,
	brandsLoading,
	suppliersData,
	suppliersLoading,

	// Actions
	handleRefresh,
}: StockViewProps) {

	// ── État : connexion en cours ────────────────────────────────────────────
	if (isConnecting) {
		return (
			<div className='flex items-center justify-center h-full min-h-[400px]'>
				<div className='text-center'>
					<RefreshCw className='h-8 w-8 animate-spin mx-auto mb-4 text-orange-500' />
					<h2 className='text-base font-medium'>Connexion à AppPOS...</h2>
					<p className='text-sm text-muted-foreground mt-1'>http://localhost:3000</p>
				</div>
			</div>
		)
	}

	// ── État : connexion échouée ─────────────────────────────────────────────
	if (connectionError || !isAppPosConnected) {
		return (
			<div className='flex items-center justify-center h-full min-h-[400px]'>
				<div className='text-center max-w-md'>
					<div className='w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4'>
						<Database className='h-8 w-8 text-destructive' />
					</div>
					<h2 className='text-base font-medium text-destructive mb-2'>
						Connexion à AppPOS échouée
					</h2>
					<p className='text-sm text-muted-foreground mb-4'>
						{connectionError || "Impossible de se connecter à l'API AppPOS"}
					</p>
					<Button onClick={handleRetryConnection} className='gap-2'>
						<LogIn className='h-4 w-4' />
						Réessayer la connexion
					</Button>
				</div>
			</div>
		)
	}

	// ── Items du rail interne (catégories / marques / fournisseurs) ──────────
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

	// ── Vue principale ───────────────────────────────────────────────────────
	return (
		<div className='flex h-full min-h-0 overflow-hidden -m-6'>

			{/* Rail filtres interne — distinct du rail Sidebar global */}
			<div className='w-14 bg-muted flex flex-col items-center py-4 gap-2 shrink-0'>
				{railItems.map((item) => (
					<div key={item.id} className='relative'>
						<button
							type='button'
							onClick={() => togglePanel(item.id)}
							className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors
								${activePanel === item.id
									? 'bg-primary/15 text-primary'
									: 'text-muted-foreground hover:bg-accent hover:text-foreground'
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

			{/* Panneau latéral filtres coulissant */}
			<div
				className={`transition-[width] duration-200 ease-in-out overflow-hidden border-r bg-background shrink-0 ${
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
							onClose={() => togglePanel('categories')}
						/>
					)}
					{activePanel === 'brands' && (
						<BrandListAppPos
							brands={brandsData || []}
							isLoading={brandsLoading}
							selectedId={selectedBrand?.id ?? null}
							onSelect={setSelectedBrand}
							onClose={() => togglePanel('brands')}
						/>
					)}
					{activePanel === 'suppliers' && (
						<SupplierListAppPos
							suppliers={suppliersData || []}
							isLoading={suppliersLoading}
							selectedId={selectedSupplier?.id ?? null}
							onSelect={setSelectedSupplier}
							onClose={() => togglePanel('suppliers')}
						/>
					)}
				</div>
			</div>

			{/* Contenu principal */}
			<div className='flex-1 overflow-auto'>
				<div className='px-6 py-6 flex flex-col gap-4'>

					{/* Erreur produits */}
					{productsError && (
						<div className='bg-destructive/10 border border-destructive/20 rounded-lg p-4'>
							<p className='text-destructive text-sm'>
								<strong>Erreur :</strong> {(productsError as Error).message}
							</p>
						</div>
					)}

					{/* Barre de recherche + compteur + rafraîchir */}
					<div className='flex items-center gap-3'>
						<div className='flex-1 max-w-md'>
							<Input
								placeholder='Rechercher un produit (nom, SKU, code-barres)...'
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
						</div>
						<Badge variant='secondary' className='shrink-0'>
							<Package className='h-3.5 w-3.5 mr-1' />
							{filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''}
						</Badge>
						<Button
							variant='outline'
							size='sm'
							onClick={handleRefresh}
							className='gap-2 shrink-0'
						>
							<RefreshCw className='h-4 w-4' />
							Rafraîchir
						</Button>
					</div>

					{/* Tags filtres actifs */}
					{activeFilters.length > 0 && (
						<div className='flex flex-wrap items-center gap-2'>
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
									onClick={handleClearAllFilters}
									className='text-xs text-muted-foreground hover:text-foreground underline'
								>
									Tout effacer
								</button>
							)}
						</div>
					)}

					{/* Contenu : chargement / vide / table */}
					{productsLoading ? (
						<div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
							<RefreshCw className='h-6 w-6 animate-spin mb-3' />
							<p className='text-sm'>Chargement depuis AppPOS...</p>
						</div>
					) : filteredProducts.length === 0 ? (
						<div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
							<Package className='h-10 w-10 mb-3 opacity-30' />
							<p className='font-medium mb-1'>Aucun produit trouvé</p>
							{hasFilters && (
								<>
									<p className='text-sm mb-3'>
										Des filtres sont actifs — essayez de les supprimer.
									</p>
									<Button
										variant='outline'
										size='sm'
										onClick={handleClearAllFilters}
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
