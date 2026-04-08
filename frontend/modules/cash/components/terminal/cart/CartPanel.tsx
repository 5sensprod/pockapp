// frontend/modules/cash/components/terminal/cart/CartPanel.tsx
//
// Desktop : card avec header actions icône+texte
// Mobile  : version épurée (utilisé dans l'onglet Panier)

import { EmptyState } from '@/components/module-ui/EmptyState' // ✅ Ajout de l'import
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Clock, ShoppingCart, Trash2 } from 'lucide-react' // ✅ Ajout de ShoppingCart
import type { CartItem, LineDiscountMode, VatBreakdown } from '../types/cart'
import type { PaymentMethod } from '../types/payment'
import { CartItemRow } from './CartItemRow'
import { CartTotals } from './CartTotals'
import { PaymentButtons } from './PaymentButtons'

interface CartPanelProps {
	cart: CartItem[]
	onClearCart: () => void
	onParkCart: () => void
	onUpdateQuantity: (itemId: string, newQuantity: number) => void
	subtotalTtc: number
	totalVat: number
	totalTtc: number
	vatBreakdown: VatBreakdown[]
	cartDiscountMode: 'percent' | 'amount'
	cartDiscountRaw: string
	discountAmount: number
	onCartDiscountModeChange: (mode: 'percent' | 'amount') => void
	onCartDiscountChange: (raw: string) => void
	onPaymentClick: (method: PaymentMethod) => void
	hideMethodButtons?: boolean
	getEffectiveUnitTtc: (item: CartItem) => number
	getLineTotalTtc: (item: CartItem) => number
	setLineDiscountMode: (itemId: string, mode: LineDiscountMode) => void
	setLineDiscountValue: (itemId: string, raw: string) => void
	clearLineDiscount: (itemId: string) => void
	toggleItemDisplayMode: (itemId: string) => void
	editingLineId: string | null
	setEditingLineId: (id: string | null) => void
	setUnitPrice: (itemId: string, raw: string) => void
	clearUnitPrice: (itemId: string) => void
}

export function CartPanel({
	cart,
	onClearCart,
	onParkCart,
	onUpdateQuantity,
	subtotalTtc,
	totalVat,
	totalTtc,
	vatBreakdown,
	cartDiscountMode,
	cartDiscountRaw,
	discountAmount,
	onCartDiscountModeChange,
	onCartDiscountChange,
	onPaymentClick,
	hideMethodButtons = false,
	getEffectiveUnitTtc,
	getLineTotalTtc,
	setLineDiscountMode,
	setLineDiscountValue,
	clearLineDiscount,
	toggleItemDisplayMode,
	editingLineId,
	setEditingLineId,
	setUnitPrice,
	clearUnitPrice,
}: CartPanelProps) {
	const cartItems = (
		<div className='divide-y'>
			{cart.map((item) => (
				<CartItemRow
					key={item.id}
					item={item}
					isEditing={editingLineId === item.id}
					onUpdateQuantity={onUpdateQuantity}
					onToggleEdit={setEditingLineId}
					onSetLineDiscountMode={setLineDiscountMode}
					onSetLineDiscountValue={setLineDiscountValue}
					onClearLineDiscount={clearLineDiscount}
					onSetDisplayMode={toggleItemDisplayMode}
					getEffectiveUnitTtc={getEffectiveUnitTtc}
					getLineTotalTtc={getLineTotalTtc}
					onSetUnitPrice={setUnitPrice}
					onClearUnitPrice={clearUnitPrice}
				/>
			))}
		</div>
	)

	return (
		<Card className='flex h-full flex-col'>
			<CardHeader className='flex flex-row items-center justify-between border-b px-4 py-3 shrink-0'>
				<div>
					<CardTitle className='text-base'>Ticket</CardTitle>
					<CardDescription className='text-xs'>
						Lignes en cours d&apos;encaissement.
					</CardDescription>
				</div>

				{/* Actions avec icônes — tactile-friendly */}
				<div className='flex gap-1'>
					<Button
						type='button'
						variant='outline'
						size='sm'
						className='h-9 px-3 gap-1.5 text-xs'
						onClick={onParkCart}
						disabled={cart.length === 0}
						title='Mettre en attente'
					>
						<Clock className='h-3.5 w-3.5 shrink-0' />
						<span className='hidden desktop:inline'>Attente</span>
					</Button>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						className='h-9 px-3 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10'
						onClick={onClearCart}
						disabled={cart.length === 0}
						title='Vider le panier'
					>
						<Trash2 className='h-3.5 w-3.5 shrink-0' />
						<span className='hidden desktop:inline'>Vider</span>
					</Button>
				</div>
			</CardHeader>

			{/* ✅ Modification ici : ajout de flex-col si le panier est vide pour que l'EmptyState prenne toute la hauteur */}
			<CardContent
				className={`flex-1 overflow-auto px-4 py-2 text-sm ${
					cart.length === 0 ? 'flex flex-col' : ''
				}`}
			>
				{cart.length === 0 ? (
					<EmptyState
						icon={ShoppingCart}
						title='Panier vide'
						description="Aucun article n'a été ajouté au ticket pour le moment."
						fullPage
					/>
				) : (
					cartItems
				)}
			</CardContent>

			<CartTotals
				subtotalTtc={subtotalTtc}
				totalVat={totalVat}
				totalTtc={totalTtc}
				vatBreakdown={vatBreakdown}
				cartDiscountMode={cartDiscountMode}
				cartDiscountRaw={cartDiscountRaw}
				discountAmount={discountAmount}
				onCartDiscountModeChange={onCartDiscountModeChange}
				onCartDiscountChange={onCartDiscountChange}
			/>

			<PaymentButtons
				totalTtc={totalTtc}
				cartLength={cart.length}
				onPaymentClick={onPaymentClick}
				hideMethodButtons={hideMethodButtons}
			/>
		</Card>
	)
}
