import {
	Coffee,
	Grid,
	Plus,
	Search,
	ShoppingBag,
	Utensils,
	Zap,
} from 'lucide-react'
// frontend/modules/cash/CashTerminalPage.tsx
import * as React from 'react'

import {
	type CashCartItem,
	CashCheckoutPanel,
} from './components/CashCheckoutPanel'
import { manifest } from './index'

type CategoryId = 'all' | 'coffee' | 'bakery' | 'cold' | 'merch'

interface Product {
	id: number
	name: string
	price: number
	category: CategoryId
	color: string
}

const CATEGORIES: {
	id: CategoryId
	name: string
	icon: React.ComponentType<any>
}[] = [
	{ id: 'all', name: 'Tout', icon: Grid },
	{ id: 'coffee', name: 'Cafés', icon: Coffee },
	{ id: 'bakery', name: 'Boulangerie', icon: Utensils },
	{ id: 'cold', name: 'Boissons fraîches', icon: Zap },
	{ id: 'merch', name: 'Merch', icon: ShoppingBag },
]

// Mock produits (à remplacer par API)
const PRODUCTS: Product[] = [
	{
		id: 1,
		name: 'Espresso',
		price: 2.5,
		category: 'coffee',
		color: 'bg-amber-100',
	},
	{
		id: 2,
		name: 'Double Espresso',
		price: 3.5,
		category: 'coffee',
		color: 'bg-amber-100',
	},
	{
		id: 3,
		name: 'Cappuccino',
		price: 4.2,
		category: 'coffee',
		color: 'bg-orange-100',
	},
	{
		id: 4,
		name: 'Latte Macchiato',
		price: 4.5,
		category: 'coffee',
		color: 'bg-orange-100',
	},
	{
		id: 5,
		name: 'Croissant beurre',
		price: 1.8,
		category: 'bakery',
		color: 'bg-yellow-100',
	},
	{
		id: 6,
		name: 'Pain au chocolat',
		price: 2.0,
		category: 'bakery',
		color: 'bg-yellow-100',
	},
	{
		id: 7,
		name: 'Muffin myrtille',
		price: 3.5,
		category: 'bakery',
		color: 'bg-purple-100',
	},
	{
		id: 8,
		name: 'Cookie choco',
		price: 2.9,
		category: 'bakery',
		color: 'bg-stone-100',
	},
	{
		id: 9,
		name: 'Cola bio',
		price: 3.0,
		category: 'cold',
		color: 'bg-red-100',
	},
	{
		id: 10,
		name: 'Limonade maison',
		price: 3.5,
		category: 'cold',
		color: 'bg-lime-100',
	},
]

export function CashTerminalPage() {
	const Icon = manifest.icon

	const [activeCategory, setActiveCategory] = React.useState<CategoryId>('all')
	const [searchQuery, setSearchQuery] = React.useState('')
	const [cart, setCart] = React.useState<CashCartItem[]>([])

	const filteredProducts = React.useMemo(
		() =>
			PRODUCTS.filter((p) => {
				const matchesCategory =
					activeCategory === 'all' || p.category === activeCategory
				const matchesSearch = p.name
					.toLowerCase()
					.includes(searchQuery.toLowerCase())
				return matchesCategory && matchesSearch
			}),
		[activeCategory, searchQuery],
	)

	const addToCart = (product: Product) => {
		setCart((prev) => {
			const existing = prev.find((item) => item.id === product.id)
			if (existing) {
				return prev.map((item) =>
					item.id === product.id
						? { ...item, quantity: item.quantity + 1 }
						: item,
				)
			}
			return [
				...prev,
				{
					id: product.id,
					name: product.name,
					unitPrice: product.price,
					quantity: 1,
				},
			]
		})
	}

	const handleIncrement = (id: CashCartItem['id']) => {
		setCart((prev) =>
			prev.map((item) =>
				item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
			),
		)
	}

	const handleDecrement = (id: CashCartItem['id']) => {
		setCart((prev) =>
			prev
				.map((item) =>
					item.id === id ? { ...item, quantity: item.quantity - 1 } : item,
				)
				.filter((item) => item.quantity > 0),
		)
	}

	const handleRemove = (id: CashCartItem['id']) => {
		setCart((prev) => prev.filter((item) => item.id !== id))
	}

	const handlePayCash = (total: number) => {
		console.log('Encaissement espèces', total)
		// TODO: appel API / Go
		setCart([])
	}

	const handlePayCard = (total: number) => {
		console.log('Encaissement CB', total)
		// TODO: appel API / Go
		setCart([])
	}

	return (
		<div className='flex h-[calc(100vh-56px)] bg-slate-50 text-slate-900'>
			{/* Colonne produits */}
			<div className='flex flex-1 flex-col'>
				{/* Top bar */}
				<div className='flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6'>
					<div className='flex items-center gap-4'>
						<div className='flex items-center gap-2'>
							<div className='flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white'>
								<Icon className='h-4 w-4' />
							</div>
							<div className='flex flex-col'>
								<span className='text-sm font-semibold'>{manifest.name}</span>
								<span className='text-xs text-slate-500'>
									Interface de caisse
								</span>
							</div>
						</div>

						<div className='relative'>
							<Search
								className='absolute left-3 top-2.5 text-slate-400'
								size={18}
							/>
							<input
								type='text'
								placeholder='Rechercher un produit…'
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className='w-64 rounded-lg bg-slate-100 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900'
							/>
						</div>
					</div>

					<div className='text-right text-xs text-slate-500'>
						<div className='font-semibold text-slate-800'>
							Caisse principale
						</div>
						<div className='flex items-center justify-end gap-1 text-emerald-600'>
							<span className='h-2 w-2 rounded-full bg-emerald-500' />
							En ligne
						</div>
					</div>
				</div>

				{/* Catégories */}
				<div className='flex gap-3 overflow-x-auto border-b border-slate-200 bg-white px-6 py-3 scrollbar-hide'>
					{CATEGORIES.map((cat) => {
						const CatIcon = cat.icon
						const isActive = activeCategory === cat.id
						return (
							<button
								key={cat.id}
								type='button'
								onClick={() => setActiveCategory(cat.id)}
								className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-medium transition-all ${
									isActive
										? 'scale-105 bg-slate-900 text-white shadow-md'
										: 'bg-slate-100 text-slate-600 hover:bg-slate-200'
								}`}
							>
								<CatIcon size={16} />
								{cat.name}
							</button>
						)
					})}
				</div>

				{/* Grid produits */}
				<div className='flex-1 overflow-y-auto bg-slate-50 p-6'>
					<div className='grid gap-4 pb-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
						{filteredProducts.map((product) => (
							<button
								key={product.id}
								type='button'
								onClick={() => addToCart(product)}
								className='group relative flex h-40 flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-slate-400 hover:shadow-md'
							>
								<div
									className={`pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-20 ${product.color}`}
								/>
								<div className='z-10 w-3/4 text-lg font-semibold leading-tight text-slate-800'>
									{product.name}
								</div>
								<div className='z-10 mt-auto flex w-full items-end justify-between'>
									<span className='text-lg font-medium text-slate-500'>
										{product.price.toFixed(2)} €
									</span>
									<div className='flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-900 transition-colors group-hover:bg-slate-900 group-hover:text-white'>
										<Plus size={16} />
									</div>
								</div>
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Colonne caisse (panier) */}
			<div className='w-[380px] border-l border-slate-200 bg-white'>
				<CashCheckoutPanel
					cart={cart}
					onIncrement={handleIncrement}
					onDecrement={handleDecrement}
					onRemove={handleRemove}
					onPayCash={handlePayCash}
					onPayCard={handlePayCard}
				/>
			</div>
		</div>
	)
}
