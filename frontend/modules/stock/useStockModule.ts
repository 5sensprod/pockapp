// frontend/modules/stock/useStockModule.ts
//
// Hook CONTAINER — logique de connexion AppPOS + filtres + données produits.
// Aucun JSX, aucun import de composant UI.

import {
	getAppPosToken,
	loginToAppPos,
	useAppPosBrands,
	useAppPosCategories,
	useAppPosProducts,
	useAppPosStockUpdates,
	useAppPosSuppliers,
} from '@/lib/apppos'
import type {
	BrandsResponse,
	CategoriesResponse,
	SuppliersResponse,
} from '@/lib/pocketbase-types'
import { useEffect, useMemo, useState } from 'react'
import type { ProductWithExpand } from './components/ProductTable'

const APPPOS_CREDENTIALS = {
	username: import.meta.env.VITE_APPPOS_USERNAME ?? '',
	password: import.meta.env.VITE_APPPOS_PASSWORD ?? '',
}

export type PanelType = 'categories' | 'brands' | 'suppliers' | null

export function useStockModule() {
	// ── Recherche & filtres ───────────────────────────────────────────────────
	const [searchTerm, setSearchTerm] = useState('')
	const [selectedCategory, setSelectedCategory] = useState<CategoriesResponse | null>(null)
	const [selectedBrand, setSelectedBrand] = useState<BrandsResponse | null>(null)
	const [selectedSupplier, setSelectedSupplier] = useState<SuppliersResponse | null>(null)
	const [activePanel, setActivePanel] = useState<PanelType>(null)

	// ── Connexion AppPOS ──────────────────────────────────────────────────────
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

	// ── Données ───────────────────────────────────────────────────────────────
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

	// ── Normalisation produits ────────────────────────────────────────────────
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
						p.categories_refs?.map((c: any) => ({ id: c.id, name: c.name })) ?? [],
				},
			})) as ProductWithExpand[],
		[productsData],
	)

	// ── Filtrage combiné ──────────────────────────────────────────────────────
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

	// ── Filtres actifs ────────────────────────────────────────────────────────
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

	// ── Handlers ──────────────────────────────────────────────────────────────
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

	const handleClearAllFilters = () => {
		setSelectedCategory(null)
		setSelectedBrand(null)
		setSelectedSupplier(null)
		setSearchTerm('')
	}

	const togglePanel = (panel: PanelType) =>
		setActivePanel((prev) => (prev === panel ? null : panel))

	return {
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
	}
}

export type StockModuleData = ReturnType<typeof useStockModule>
