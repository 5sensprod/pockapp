// frontend/modules/cash/components/terminal/cart/CartPanel.tsx
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
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
	getEffectiveUnitTtc: (item: CartItem) => number
	getLineTotalTtc: (item: CartItem) => number
	setLineDiscountMode: (itemId: string, mode: LineDiscountMode) => void
	setLineDiscountValue: (itemId: string, raw: string) => void
	clearLineDiscount: (itemId: string) => void
	toggleItemDisplayMode: (itemId: string) => void
	editingLineId: string | null
	setEditingLineId: (id: string | null) => void
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
	getEffectiveUnitTtc,
	getLineTotalTtc,
	setLineDiscountMode,
	setLineDiscountValue,
	clearLineDiscount,
	toggleItemDisplayMode,
	editingLineId,
	setEditingLineId,
}: CartPanelProps) {
	return (
		<Card className='flex h-full flex-col'>
			<CardHeader className='flex flex-row items-center justify-between border-b px-4 py-3'>
				<div>
					<CardTitle className='text-base'>Ticket</CardTitle>
					<CardDescription className='text-xs'>
						Lignes en cours d&apos;encaissement.
					</CardDescription>
				</div>
				<div className='flex gap-2'>
					<Button
						type='button'
						variant='outline'
						size='sm'
						className='h-7 px-2 text-xs'
						onClick={onParkCart}
						disabled={cart.length === 0}
					>
						Mettre en attente
					</Button>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						className='h-7 px-2 text-xs text-red-500 hover:text-red-600'
						onClick={onClearCart}
					>
						Vider
					</Button>
				</div>
			</CardHeader>

			<CardContent className='flex-1 overflow-auto px-4 py-2 text-sm'>
				{cart.length === 0 ? (
					<div className='flex h-full items-center justify-center text-xs text-slate-400'>
						Aucun article pour le moment.
					</div>
				) : (
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
							/>
						))}
					</div>
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
			/>
		</Card>
	)
}
