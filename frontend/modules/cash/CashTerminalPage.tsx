import { Search } from 'lucide-react'
// frontend/modules/cash/CashTerminalPage.tsx
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { manifest } from './index'

type CategoryId = 'all' | 'audio' | 'cable' | 'accessory'

interface Product {
	id: number
	name: string
	reference: string
	price: number
	stock: number
	category: CategoryId
}

interface CartItem {
	id: number
	name: string
	unitPrice: number
	quantity: number
}

const PRODUCTS: Product[] = [
	{
		id: 1,
		name: 'Câble XLR 3m',
		reference: 'REF-XLR-3M',
		price: 12.9,
		stock: 42,
		category: 'audio',
	},
	{
		id: 2,
		name: 'Jeu de cordes guitare',
		reference: 'CORD-GTR-10',
		price: 8.5,
		stock: 15,
		category: 'accessory',
	},
]

export function CashTerminalPage() {
	const Icon = manifest.icon

	const [search, setSearch] = React.useState('')
	const [category, setCategory] = React.useState<CategoryId>('all')
	const [sort, setSort] = React.useState<'name' | 'price'>('name')

	const [cart, setCart] = React.useState<CartItem[]>([])
	const [discountPercent, setDiscountPercent] = React.useState<number>(0)

	const filteredProducts = React.useMemo(() => {
		let list = PRODUCTS.filter((p) => {
			const query = search.trim().toLowerCase()
			const bySearch =
				!query ||
				p.name.toLowerCase().includes(query) ||
				p.reference.toLowerCase().includes(query)
			const byCategory = category === 'all' || p.category === category
			return bySearch && byCategory
		})

		if (sort === 'name') {
			list = [...list].sort((a, b) => a.name.localeCompare(b.name))
		} else if (sort === 'price') {
			list = [...list].sort((a, b) => a.price - b.price)
		}

		return list
	}, [search, category, sort])

	const addToCart = (product: Product) => {
		setCart((prev) => {
			const existing = prev.find((i) => i.id === product.id)
			if (existing) {
				return prev.map((i) =>
					i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
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

	const clearCart = () => {
		setCart([])
		setDiscountPercent(0)
	}

	const subtotal = cart.reduce(
		(sum, item) => sum + item.unitPrice * item.quantity,
		0,
	)

	const discountAmount = subtotal * (Math.max(0, discountPercent) / 100)

	const totalAfterDiscount = Math.max(subtotal - discountAmount, 0)

	const tax = totalAfterDiscount * 0.2
	const totalTtc = totalAfterDiscount + 0

	const handleChangeDiscount = (e: React.ChangeEvent<HTMLInputElement>) => {
		const raw = e.target.value
		const value = Number(raw)
		if (Number.isNaN(value)) {
			setDiscountPercent(0)
		} else {
			setDiscountPercent(Math.max(0, value))
		}
	}

	const handlePay = (mode: 'card' | 'cash' | 'other') => {
		console.log('Encaissement', mode, totalTtc)
		// TODO: plus tard => encaissement réel via Go/PocketBase
	}

	const today = new Date().toLocaleDateString('fr-FR')

	return (
		<div className='container mx-auto flex flex-col gap-6 px-6 py-8'>
			{/* Header */}
			<header className='flex items-center justify-between gap-4'>
				<div className='flex items-center gap-3'>
					<div className='flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100'>
						<Icon className='h-5 w-5 text-blue-600' />
					</div>
					<div>
						<h1 className='text-2xl font-semibold tracking-tight'>Caisse</h1>
						<p className='text-sm text-muted-foreground'>
							Enregistrez les ventes et encaissez vos clients.
						</p>
					</div>
				</div>

				<div className='flex items-center gap-4 text-xs text-muted-foreground'>
					<div className='flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1'>
						<span className='h-2 w-2 rounded-full bg-emerald-500' />
						<span className='font-medium text-emerald-700'>Caisse ouverte</span>
					</div>
					<span>Axe Musique — {today}</span>
				</div>
			</header>

			{/* Layout 50/50 */}
			<main className='flex min-h-[520px] flex-1 flex-col gap-4 lg:flex-row'>
				{/* PRODUITS – moitié gauche */}
				<section className='flex flex-1 flex-col gap-3'>
					<Card className='flex flex-1 flex-col'>
						{/* Recherche & filtres */}
						<div className='flex flex-wrap items-center gap-3 border-b px-4 py-3'>
							<div className='relative min-w-[220px] flex-1'>
								<Search
									className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400'
									size={16}
								/>
								<Input
									type='text'
									placeholder='Rechercher un produit…'
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									className='h-9 w-full bg-slate-50 pl-8 text-sm'
								/>
							</div>

							<div className='flex items-center gap-2 text-xs'>
								<select
									className='h-9 rounded-md border bg-slate-50 px-2 text-xs'
									value={category}
									onChange={(e) => setCategory(e.target.value as CategoryId)}
								>
									<option value='all'>Catégorie : toutes</option>
									<option value='audio'>Audio</option>
									<option value='cable'>Câbles</option>
									<option value='accessory'>Accessoires</option>
								</select>

								<select
									className='h-9 rounded-md border bg-slate-50 px-2 text-xs'
									value={sort}
									onChange={(e) => setSort(e.target.value as 'name' | 'price')}
								>
									<option value='name'>Trier par : nom</option>
									<option value='price'>Prix croissant</option>
								</select>
							</div>
						</div>

						{/* Liste produits */}
						<div className='flex flex-1 flex-col'>
							<div className='flex items-center border-b px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500'>
								<div className='flex-1'>Produit</div>
								<div className='w-24 text-right'>Prix TTC</div>
								<div className='w-24 text-right'>Stock</div>
							</div>

							<div className='h-[340px] overflow-auto text-sm'>
								{filteredProducts.map((p) => (
									<button
										key={p.id}
										type='button'
										onClick={() => addToCart(p)}
										className='flex w-full cursor-pointer items-center border-b px-4 py-2 text-left hover:bg-slate-50'
									>
										<div className='flex-1'>
											<div className='font-medium'>{p.name}</div>
											<div className='text-xs text-slate-500'>
												{p.reference} •{' '}
												{p.category === 'audio'
													? 'Audio'
													: p.category === 'cable'
														? 'Câbles'
														: 'Accessoires'}
											</div>
										</div>
										<div className='w-24 text-right text-sm font-semibold'>
											{p.price.toFixed(2)} €
										</div>
										<div className='w-24 text-right text-xs text-slate-500'>
											{p.stock} en stock
										</div>
									</button>
								))}

								{!filteredProducts.length && (
									<div className='px-4 py-6 text-center text-xs text-slate-400'>
										Aucun produit ne correspond à la recherche.
									</div>
								)}

								<div className='px-4 py-6 text-center text-xs text-slate-400'>
									Résultats paginés — 25 produits par page sur ~2000.
								</div>
							</div>

							{/* Pagination */}
							<div className='flex items-center justify-between border-t px-4 py-2 text-xs text-slate-500'>
								<span>Page 1 sur 80</span>
								<div className='flex items-center gap-1'>
									<Button
										type='button'
										variant='outline'
										size='sm'
										className='h-7 px-2 text-xs'
									>
										Précédent
									</Button>
									<Button
										type='button'
										variant='outline'
										size='sm'
										className='h-7 px-2 text-xs'
									>
										Suivant
									</Button>
								</div>
							</div>
						</div>
					</Card>
				</section>

				{/* PANEL CAISSE – moitié droite */}
				<aside className='flex flex-1 flex-col gap-3'>
					{/* Ticket + totaux + paiement */}
					<Card className='flex h-full flex-col'>
						<CardHeader className='flex flex-row items-center justify-between border-b px-4 py-3'>
							<div>
								<CardTitle className='text-base'>Ticket</CardTitle>
								<CardDescription className='text-xs'>
									Lignes en cours d&apos;encaissement.
								</CardDescription>
							</div>
							<Button
								type='button'
								variant='ghost'
								size='sm'
								className='h-7 px-2 text-xs text-red-500 hover:text-red-600'
								onClick={clearCart}
							>
								Vider
							</Button>
						</CardHeader>

						{/* Lignes ticket */}
						<CardContent className='flex-1 overflow-auto px-4 py-2 text-sm'>
							{cart.length === 0 ? (
								<div className='flex h-full items-center justify-center text-xs text-slate-400'>
									Aucun article pour le moment.
								</div>
							) : (
								<div className='divide-y'>
									{cart.map((item) => (
										<div
											key={item.id}
											className='flex items-center justify-between py-2'
										>
											<div>
												<div className='font-medium'>{item.name}</div>
												<div className='text-xs text-slate-500'>
													{item.quantity} × {item.unitPrice.toFixed(2)} €
												</div>
											</div>
											<span className='font-semibold'>
												{(item.unitPrice * item.quantity).toFixed(2)} €
											</span>
										</div>
									))}
								</div>
							)}
						</CardContent>

						{/* Totaux */}
						<div className='border-t px-4 py-4 text-sm'>
							<div className='flex items-center justify-between'>
								<span>Sous-total</span>
								<span>{subtotal.toFixed(2)} €</span>
							</div>

							<div className='mt-2 flex items-center justify-between'>
								<span>Remise</span>
								<div className='flex items-center gap-1'>
									<Input
										type='number'
										className='h-8 w-20 bg-slate-50 text-right text-sm'
										value={discountPercent.toString()}
										onChange={handleChangeDiscount}
										placeholder='0'
									/>
									<span className='text-xs text-slate-500'>%</span>
								</div>
							</div>

							<div className='mt-2 flex items-center justify-between text-xs text-slate-500'>
								<span>TVA (20 %)</span>
								<span>{tax.toFixed(2)} €</span>
							</div>

							<Separator className='my-2' />

							<div className='flex items-center justify-between pt-1 text-base font-semibold'>
								<span>Total TTC</span>
								<span>{totalTtc.toFixed(2)} €</span>
							</div>
						</div>

						{/* Paiement */}
						<div className='border-t px-4 py-4'>
							<div className='mb-3 grid grid-cols-3 gap-2 text-xs'>
								<Button
									type='button'
									variant='outline'
									className='h-10'
									onClick={() => handlePay('card')}
								>
									CB
								</Button>
								<Button
									type='button'
									variant='outline'
									className='h-10'
									onClick={() => handlePay('cash')}
								>
									Espèces
								</Button>
								<Button
									type='button'
									variant='outline'
									className='h-10'
									onClick={() => handlePay('other')}
								>
									Autre
								</Button>
							</div>

							<Button
								type='button'
								className='h-11 w-full text-sm font-semibold'
								disabled={totalTtc <= 0}
								onClick={() => handlePay('card')}
							>
								Encaisser {totalTtc > 0 ? `${totalTtc.toFixed(2)} €` : ''}
							</Button>
						</div>
					</Card>

					{/* Pad numérique */}
					<Card>
						<CardContent className='grid grid-cols-3 gap-3 p-4 text-xl font-semibold select-none'>
							<Button type='button' variant='outline' className='h-12'>
								7
							</Button>
							<Button type='button' variant='outline' className='h-12'>
								8
							</Button>
							<Button type='button' variant='outline' className='h-12'>
								9
							</Button>

							<Button type='button' variant='outline' className='h-12'>
								4
							</Button>
							<Button type='button' variant='outline' className='h-12'>
								5
							</Button>
							<Button type='button' variant='outline' className='h-12'>
								6
							</Button>

							<Button type='button' variant='outline' className='h-12'>
								1
							</Button>
							<Button type='button' variant='outline' className='h-12'>
								2
							</Button>
							<Button type='button' variant='outline' className='h-12'>
								3
							</Button>

							<Button
								type='button'
								variant='outline'
								className='col-span-2 h-12'
							>
								0
							</Button>
							<Button type='button' variant='outline' className='h-12'>
								⌫
							</Button>
						</CardContent>
					</Card>
				</aside>
			</main>
		</div>
	)
}
