// frontend/modules/cash/components/terminal/products/ProductsPanel.tsx
//
// Desktop : liste tabulaire (existant)
// < tablet : grille de cards avec grande image (style maquette Stitch)

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { prixPromoActif } from '@/lib/pricing/promo-price'
import { useJourServeur } from '@/lib/pricing/use-jour-serveur'
import { Search } from 'lucide-react'
import type * as React from 'react'
import type { PosProduct } from '../types/cart'

interface ProductsPanelProps {
	productSearch: string
	onProductSearchChange: (v: string) => void
	searchInputRef: React.RefObject<HTMLInputElement>
	products: PosProduct[]
	onAddToCart: (p: PosProduct) => void
	onCreateProductClick: () => void
}

// Ce qu'un résultat doit dire AVANT d'être ajouté : une remise ou une unité B
// qui ne se voit qu'une fois au panier fait facturer à l'aveugle
// (10 septembre 2026). La règle de la promo est celle du panier
// (`prixPromoActif`), pas une copie.
function etiquettes(p: PosProduct) {
	const stockB = Number(p.stock_b ?? 0)
	return {
		stockB,
		operation:
			p.sale_state === 'sale'
				? 'Soldé'
				: p.sale_state === 'promo'
					? 'Promo'
					: null,
	}
}

function Badges({ p }: { p: PosProduct }) {
	const { operation, stockB } = etiquettes(p)
	if (!operation && stockB <= 0) return null
	return (
		<span className='flex flex-wrap gap-1'>
			{operation && (
				<span className='rounded bg-rose-100 px-1.5 py-px text-[10px] font-semibold text-rose-700'>
					{operation}
				</span>
			)}
			{stockB > 0 && (
				<span className='rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-800'>
					Stock B · {stockB}
				</span>
			)}
		</span>
	)
}

function Prix({ p, className }: { p: PosProduct; className: string }) {
	// Même règle ET même jour que le panier : ce qui s'affiche ici est ce qui
	// sera remisé à l'ajout.
	const promo = prixPromoActif(p, useJourServeur())
	const prix = (p.price_ttc ?? 0).toFixed(2)
	if (promo === null) return <span className={className}>{prix} €</span>
	return (
		<span className='flex flex-col items-end leading-tight'>
			<span className='text-[10px] text-muted-foreground line-through'>
				{prix} €
			</span>
			<span className={`${className} text-rose-700`}>{promo.toFixed(2)} €</span>
		</span>
	)
}

export function ProductsPanel({
	productSearch,
	onProductSearchChange,
	searchInputRef,
	products,
	onAddToCart,
	onCreateProductClick,
}: ProductsPanelProps) {
	const empty = (
		<div className='flex h-full flex-col items-center justify-center gap-4 px-4 py-6'>
			{productSearch.length > 0 ? (
				<>
					<div className='text-center'>
						<div className='mb-2 text-sm font-medium text-foreground'>
							Aucun produit trouvé
						</div>
						<div className='text-xs text-muted-foreground'>
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
				<div className='text-center text-xs text-muted-foreground'>
					Scannez un code-barres ou recherchez un produit
				</div>
			)}
		</div>
	)

	return (
		<Card className='flex flex-1 flex-col overflow-hidden'>
			{/* Barre de recherche — identique desktop/mobile */}
			<div className='flex flex-wrap items-center gap-3 border-b px-4 py-3 shrink-0'>
				<div className='relative min-w-[200px] flex-1'>
					<Search
						className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground'
						size={16}
					/>
					<Input
						ref={searchInputRef}
						type='text'
						placeholder='Rechercher ou scanner…'
						value={productSearch}
						onChange={(e) => onProductSearchChange(e.target.value)}
						className='h-9 w-full bg-muted/40 pl-8 text-sm'
						autoFocus
					/>
				</div>
				<div className='flex items-center gap-2 text-xs text-muted-foreground shrink-0'>
					<div className='h-2 w-2 rounded-full bg-emerald-500' />
					<span className='hidden desktop:inline'>Scanette active</span>
				</div>
			</div>

			{/* ── DESKTOP : liste tabulaire ──────────────────────────────── */}
			<div className='hidden desktop:flex flex-col  flex-1 overflow-hidden'>
				<div className='flex items-center border-b px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground shrink-0'>
					<div className='flex-1'>Produit</div>
					<div className='w-24 text-right'>Prix TTC</div>
					<div className='w-24 text-right'>Stock</div>
				</div>
				<div className='flex-1 overflow-auto text-sm'>
					{products.length === 0
						? empty
						: products.slice(0, 50).map((p) => {
								const imageUrl = p.imageUrl
								const { stockB } = etiquettes(p)
								return (
									<button
										key={p.id}
										type='button'
										onClick={() => onAddToCart(p)}
										className='flex w-full cursor-pointer items-center gap-3 border-b px-4 py-2 text-left hover:bg-muted/40 transition-colors'
									>
										{imageUrl ? (
											<img
												src={imageUrl}
												alt={p.name}
												className='h-10 w-10 rounded-md object-cover border border-border/40'
												onError={(e) => {
													e.currentTarget.style.display = 'none'
												}}
											/>
										) : (
											<div className='h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0'>
												<span className='text-xs text-muted-foreground'>?</span>
											</div>
										)}
										<div className='flex-1 min-w-0'>
											<div className='font-medium truncate'>{p.name}</div>
											<div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
												<span>{p.sku || p.barcode || 'N/A'}</span>
												<Badges p={p} />
											</div>
										</div>
										<div className='w-24 flex justify-end shrink-0'>
											<Prix p={p} className='text-sm font-semibold' />
										</div>
										<div
											className={`w-24 text-right text-xs shrink-0 ${(p.stock ?? 0) <= 0 ? 'text-destructive' : 'text-muted-foreground'}`}
										>
											{p.stock ?? '?'} en stock
											{stockB > 0 && (
												<div className='text-amber-700'>+ {stockB} en B</div>
											)}
										</div>
									</button>
								)
							})}
				</div>
			</div>

			{/* ── MOBILE : grille de cards ───────────────────────────────── */}
			<div className='desktop:hidden flex-1 overflow-auto p-3'>
				{products.length === 0 ? (
					empty
				) : (
					<div className='grid grid-pos-products tablet:grid-cols-4 gap-3'>
						{products.slice(0, 10).map((p) => {
							const imageUrl = p.imageUrl
							const outOfStock = (p.stock ?? 0) <= 0
							return (
								<button
									key={p.id}
									type='button'
									onClick={() => onAddToCart(p)}
									className='flex flex-col rounded-xl bg-card border border-border/30 overflow-hidden text-left active:scale-[0.97] transition-transform shadow-sm'
								>
									{/* Image */}
									<div className='w-full aspect-square bg-muted flex items-center justify-center'>
										{imageUrl ? (
											<img
												src={imageUrl}
												alt={p.name}
												className='w-full h-full object-cover'
												onError={(e) => {
													e.currentTarget.style.display = 'none'
												}}
											/>
										) : (
											<span className='text-2xl text-muted-foreground'>?</span>
										)}
									</div>
									{/* Infos */}
									<div className='p-2.5 flex flex-col gap-1'>
										<div className='text-xs font-semibold text-foreground leading-tight line-clamp-2'>
											{p.name}
										</div>
										<div className='text-[10px] text-muted-foreground'>
											{p.sku || p.barcode}
										</div>
										<Badges p={p} />
										<div className='flex items-center justify-between mt-1'>
											<Prix
												p={p}
												className='text-sm font-bold text-foreground'
											/>
											<span
												className={`text-[10px] font-medium ${outOfStock ? 'text-destructive' : 'text-emerald-600'}`}
											>
												{outOfStock ? '0 stock' : `${p.stock} stock`}
											</span>
										</div>
									</div>
								</button>
							)
						})}
					</div>
				)}
			</div>
		</Card>
	)
}
