import {
	Banknote,
	CreditCard,
	Minus,
	MoreVertical,
	Plus,
	ShoppingBag,
	Trash2,
	User,
} from 'lucide-react'
// frontend/modules/cash/components/CashCheckoutPanel.tsx
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

export interface CashCartItem {
	id: string | number
	name: string
	unitPrice: number
	quantity: number
}

interface CashCheckoutPanelProps {
	cart: CashCartItem[]
	onIncrement: (id: CashCartItem['id']) => void
	onDecrement: (id: CashCartItem['id']) => void
	onRemove: (id: CashCartItem['id']) => void
	onPayCash?: (total: number) => void
	onPayCard?: (total: number) => void
}

export const CashCheckoutPanel: React.FC<CashCheckoutPanelProps> = ({
	cart,
	onIncrement,
	onDecrement,
	onRemove,
	onPayCash,
	onPayCard,
}) => {
	const totals = React.useMemo(() => {
		const subtotal = cart.reduce(
			(sum, item) => sum + item.unitPrice * item.quantity,
			0,
		)
		const tax = subtotal * 0.2
		const total = subtotal // garde ta logique actuelle
		return { subtotal, tax, total }
	}, [cart])

	const handlePayCash = () => {
		if (onPayCash) onPayCash(totals.total)
	}

	const handlePayCard = () => {
		if (onPayCard) onPayCard(totals.total)
	}

	return (
		<div className='flex h-full w-full flex-col bg-white shadow-xl'>
			{/* Header client */}
			<div className='flex h-16 items-center justify-between border-b border-slate-200 bg-slate-50/50 px-5'>
				<Button
					variant='ghost'
					className='flex w-auto cursor-pointer items-center gap-3 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-200'
				>
					<div className='flex h-8 w-8 items-center justify-center rounded-full bg-slate-200'>
						<User size={16} />
					</div>

					<div className='flex flex-col'>
						<span className='text-sm font-bold'>Client standard</span>
						<span className='text-xs text-slate-500'>Ajouter client</span>
					</div>
				</Button>
				<Button
					variant='ghost'
					size='icon'
					className='text-slate-400 hover:text-slate-900'
				>
					<MoreVertical size={20} />
				</Button>
			</div>

			{/* Liste panier */}
			<ScrollArea className='flex-1 p-4'>
				<div className='space-y-3'>
					{cart.length === 0 ? (
						<div className='flex h-full flex-col items-center justify-center text-slate-400 opacity-60'>
							<ShoppingBag size={48} className='mb-2' />
							<p>Panier vide</p>
						</div>
					) : (
						cart.map((item) => (
							<div
								key={item.id}
								className='group flex items-center gap-3 rounded-lg border border-transparent bg-slate-50 p-3 transition-all hover:border-slate-200'
							>
								<div className='flex flex-col items-center gap-1'>
									<Button
										type='button'
										variant='outline'
										size='icon'
										onClick={() => onIncrement(item.id)}
										className='h-6 w-6'
									>
										<Plus size={12} />
									</Button>

									<span className='w-6 text-center text-sm font-bold'>
										{item.quantity}
									</span>

									<Button
										type='button'
										variant='outline'
										size='icon'
										onClick={() => onDecrement(item.id)}
										className='h-6 w-6'
									>
										<Minus size={12} />
									</Button>
								</div>

								<div className='flex-1'>
									<div className='text-sm font-medium text-slate-800'>
										{item.name}
									</div>
									<div className='text-xs text-slate-500'>
										{item.unitPrice.toFixed(2)} € / unité
									</div>
								</div>

								<div className='flex flex-col items-end gap-1'>
									<div className='text-sm font-bold text-slate-900'>
										{(item.unitPrice * item.quantity).toFixed(2)} €
									</div>
									<Button
										type='button'
										variant='ghost'
										size='icon'
										onClick={() => onRemove(item.id)}
										className='text-slate-300 hover:text-rose-500'
									>
										<Trash2 size={16} />
									</Button>
								</div>
							</div>
						))
					)}
				</div>
			</ScrollArea>

			{/* Totaux */}
			<div className='shrink-0 space-y-3 border-t border-slate-200 bg-slate-50 p-5 text-sm'>
				<div className='flex justify-between text-slate-500'>
					<span>Sous-total</span>
					<span>{totals.subtotal.toFixed(2)} €</span>
				</div>
				<div className='flex justify-between text-slate-500'>
					<span>TVA (20 %)</span>
					<span>{totals.tax.toFixed(2)} €</span>
				</div>
				<div className='flex justify-between text-slate-500'>
					<span>Remise</span>
					<span>0,00 €</span>
				</div>
				<div className='flex items-end justify-between border-t border-slate-200 pt-3'>
					<span className='text-xl font-bold text-slate-900'>Total</span>
					<span className='text-3xl font-black text-slate-900'>
						{totals.total.toFixed(2)} €
					</span>
				</div>
			</div>

			{/* Paiement */}
			<div className='grid shrink-0 grid-cols-2 gap-3 border-t border-slate-200 bg-white p-4'>
				<Button
					type='button'
					variant='outline'
					onClick={handlePayCash}
					className='col-span-1 flex flex-col items-center justify-center gap-1 rounded-xl py-4 font-bold text-slate-700'
				>
					<Banknote size={20} />
					<span className='text-xs'>Espèces</span>
				</Button>

				<Button
					type='button'
					onClick={handlePayCard}
					className='col-span-1 flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-900 py-4 font-bold text-white shadow-lg shadow-slate-200 transition-transform hover:bg-slate-800 active:scale-95'
				>
					<CreditCard size={20} />
					<span className='text-sm'>
						Payer {totals.total > 0 ? `${totals.total.toFixed(2)} €` : ''}
					</span>
				</Button>
			</div>
		</div>
	)
}
