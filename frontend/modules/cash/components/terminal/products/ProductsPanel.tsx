import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
// frontend/modules/cash/components/terminal/products/ProductsPanel.tsx
import type * as React from 'react'
import type { AppPosProduct } from '../types/cart'
import { getImageUrl } from '../utils/imageUtils'

interface ProductsPanelProps {
	productSearch: string
	onProductSearchChange: (v: string) => void
	searchInputRef: React.RefObject<HTMLInputElement>
	isAppPosConnected: boolean
	products: AppPosProduct[]
	onAddToCart: (p: AppPosProduct) => void
	onCreateProductClick: () => void
}

export function ProductsPanel({
	productSearch,
	onProductSearchChange,
	searchInputRef,
	isAppPosConnected,
	products,
	onAddToCart,
	onCreateProductClick,
}: ProductsPanelProps) {
	return (
		<Card className='flex flex-1 flex-col'>
			<div className='flex flex-wrap items-center gap-3 border-b px-4 py-3'>
				<div className='relative min-w-[220px] flex-1'>
					<Search
						className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400'
						size={16}
					/>
					<Input
						ref={searchInputRef}
						type='text'
						placeholder='Rechercher un produit ou scanner un code-barres…'
						value={productSearch}
						onChange={(e) => onProductSearchChange(e.target.value)}
						className='h-9 w-full bg-slate-50 pl-8 text-sm'
						autoFocus
					/>
				</div>
				<div className='flex items-center gap-2 text-xs text-muted-foreground'>
					<div className='h-2 w-2 rounded-full bg-emerald-500' />
					<span>Scanette active</span>
				</div>
			</div>

			<div className='flex items-center border-b px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500'>
				<div className='flex-1'>Produit</div>
				<div className='w-24 text-right'>Prix TTC</div>
				<div className='w-24 text-right'>Stock</div>
			</div>

			<div className='h-[340px] overflow-auto text-sm'>
				{products.length === 0 ? (
					<div className='flex h-full flex-col items-center justify-center gap-4 px-4 py-6'>
						{isAppPosConnected ? (
							productSearch.length > 0 ? (
								<>
									<div className='text-center'>
										<div className='mb-2 text-sm font-medium text-slate-700'>
											Aucun produit trouvé
										</div>
										<div className='text-xs text-slate-500'>
											Recherche : "{productSearch}"
										</div>
									</div>

									<Button
										type='button'
										variant='outline'
										size='sm'
										onClick={onCreateProductClick}
										className='gap-2'
									>
										<span className='text-lg'>+</span>
										Créer ce produit
									</Button>
								</>
							) : (
								<div className='text-center text-xs text-slate-400'>
									Scannez un code-barres ou recherchez un produit
								</div>
							)
						) : (
							<div className='text-center text-xs text-slate-400'>
								Connexion à AppPOS en cours ou échouée
							</div>
						)}
					</div>
				) : (
					<>
						{products.slice(0, 50).map((p) => {
							const imageUrl = getImageUrl(p.images)

							return (
								<button
									key={p.id}
									type='button'
									onClick={() => onAddToCart(p)}
									className='flex w-full cursor-pointer items-center gap-3 border-b px-4 py-2 text-left hover:bg-slate-50'
								>
									{imageUrl ? (
										<img
											src={imageUrl}
											alt={p.name}
											className='h-10 w-10 rounded-md object-cover border border-slate-200'
											onError={(e) => {
												e.currentTarget.style.display = 'none'
											}}
										/>
									) : (
										<div className='h-10 w-10 rounded-md bg-slate-100 flex items-center justify-center'>
											<span className='text-xs text-slate-400'>?</span>
										</div>
									)}

									<div className='flex-1'>
										<div className='font-medium'>{p.name}</div>
										<div className='text-xs text-slate-500'>
											{p.sku || p.barcode || 'N/A'}
										</div>
									</div>
									<div className='w-24 text-right text-sm font-semibold'>
										{(p.price_ttc ?? 0).toFixed(2)} €
									</div>
									<div className='w-24 text-right text-xs text-slate-500'>
										{p.stock_quantity ?? '?'} en stock
									</div>
								</button>
							)
						})}
					</>
				)}
			</div>
		</Card>
	)
}
