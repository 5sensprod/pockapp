import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

export interface CashCartItem {
	id: string | number
	name: string
	unitPrice: number
	quantity: number
	// 🆕 optionnel : remise par ligne (en %)
	discountPercent?: number
}

export interface HeldTicketSummary {
	id: string | number
	label: string
	total: number
}

type NumpadMode = 'qty' | 'discount' | 'amount'

export interface CashCheckoutPanelProps {
	cart: CashCartItem[]
	onIncrement: (id: CashCartItem['id']) => void
	onDecrement: (id: CashCartItem['id']) => void
	onRemove: (id: CashCartItem['id']) => void

	// 🆕 callbacks optionnels pour remises / ticket en attente
	onApplyItemDiscount?: (
		id: CashCartItem['id'],
		value: number,
		mode: 'percent' | 'amount',
	) => void
	onApplyTicketDiscount?: (value: number, mode: 'percent' | 'amount') => void

	onHoldTicket?: () => void
	onRecallTicket?: (ticketId: HeldTicketSummary['id']) => void
	heldTickets?: HeldTicketSummary[]

	// 🆕 callback si tu veux exploiter le numpad côté parent
	onNumpadValidate?: (mode: NumpadMode, value: number) => void

	onPayCash?: (total: number) => void
	onPayCard?: (total: number) => void
}

export const CashCheckoutPanel: React.FC<CashCheckoutPanelProps> = ({
	cart,
	onIncrement,
	onDecrement,
	onRemove,
	onApplyItemDiscount,
	onApplyTicketDiscount,
	onHoldTicket,
	onRecallTicket,
	heldTickets,
	onNumpadValidate,
	onPayCash,
	onPayCard,
}) => {
	// 🧮 remise ticket (interne pour l’instant)
	const [ticketDiscountMode, setTicketDiscountMode] = React.useState<
		'percent' | 'amount'
	>('percent')
	const [ticketDiscountValue, setTicketDiscountValue] =
		React.useState<string>('0')

	// 🧮 numpad
	const [numpadMode, setNumpadMode] = React.useState<NumpadMode>('qty')
	const [numpadValue, setNumpadValue] = React.useState<string>('')

	const handleNumpadPress = (digit: string) => {
		setNumpadValue((prev) => (prev === '0' ? digit : prev + digit))
	}

	const handleNumpadBackspace = () => {
		setNumpadValue((prev) => (prev.length <= 1 ? '' : prev.slice(0, -1)))
	}

	const handleNumpadValidate = () => {
		if (!numpadValue) return
		const numeric = Number(numpadValue.replace(',', '.'))
		if (Number.isNaN(numeric)) return

		onNumpadValidate?.(numpadMode, numeric)
		// plus tard : on pourra décider si ça touche la ligne sélectionnée, la remise, etc.
		setNumpadValue('')
	}

	const totals = React.useMemo(() => {
		const subtotal = cart.reduce((sum, item) => {
			const lineBase = item.unitPrice * item.quantity
			const lineDiscount =
				item.discountPercent && item.discountPercent > 0
					? (lineBase * item.discountPercent) / 100
					: 0
			return sum + (lineBase - lineDiscount)
		}, 0)

		// remise ticket
		const ticketDiscountRaw = Number(
			ticketDiscountValue.replace(',', '.') || '0',
		)
		let ticketDiscountAmount = 0
		if (!Number.isNaN(ticketDiscountRaw) && ticketDiscountRaw > 0) {
			ticketDiscountAmount =
				ticketDiscountMode === 'percent'
					? (subtotal * ticketDiscountRaw) / 100
					: ticketDiscountRaw
		}

		const subtotalAfterTicket = Math.max(subtotal - ticketDiscountAmount, 0)
		const tax = subtotalAfterTicket * 0.2
		const total = subtotalAfterTicket

		return {
			subtotal,
			ticketDiscountAmount,
			tax,
			total,
		}
	}, [cart, ticketDiscountMode, ticketDiscountValue])

	const handlePayCash = () => {
		if (onPayCash) onPayCash(totals.total)
	}

	const handlePayCard = () => {
		if (onPayCard) onPayCard(totals.total)
	}

	const handleTicketDiscountBlur = () => {
		const raw = Number(ticketDiscountValue.replace(',', '.') || '0')
		if (Number.isNaN(raw) || !onApplyTicketDiscount) return
		onApplyTicketDiscount(raw, ticketDiscountMode)
	}

	return (
		<div className='flex h-full w-full flex-col bg-white'>
			{/* Header client & tickets en attente */}
			<div className='flex h-16 items-center justify-between border-b border-slate-200 bg-slate-50/50 px-5'>
				<div className='flex items-center gap-3 rounded-md px-2 py-1 text-slate-700'>
					<div className='flex h-8 w-8 items-center justify-center rounded-full bg-slate-200'>
						<User size={16} />
					</div>
					<div className='flex flex-col'>
						<span className='text-sm font-bold'>Client standard</span>
						<span className='text-xs text-slate-500'>Ajouter client</span>
					</div>
				</div>

				<div className='flex items-center gap-3'>
					{/* Tickets en attente */}
					{heldTickets && heldTickets.length > 0 && onRecallTicket && (
						<div className='flex items-center gap-2'>
							<span className='text-xs text-slate-500'>En attente :</span>
							<div className='flex gap-1'>
								{heldTickets.slice(0, 3).map((t) => (
									<Button
										key={t.id}
										size='sm'
										variant='outline'
										className='h-7 px-2 text-[11px]'
										type='button'
										onClick={() => onRecallTicket(t.id)}
									>
										{t.label}
									</Button>
								))}
								{heldTickets.length > 3 && (
									<Badge variant='outline' className='h-7 px-2 text-[11px]'>
										+{heldTickets.length - 3}
									</Badge>
								)}
							</div>
						</div>
					)}

					<button
						type='button'
						className='text-slate-400 transition-colors hover:text-slate-900'
					>
						<MoreVertical size={20} />
					</button>
				</div>
			</div>

			{/* Liste panier */}
			<div className='flex-1 space-y-3 overflow-y-auto p-4'>
				{cart.length === 0 ? (
					<div className='flex h-full flex-col items-center justify-center text-slate-400 opacity-60'>
						<ShoppingBag size={48} className='mb-2' />
						<p>Panier vide</p>
					</div>
				) : (
					cart.map((item) => (
						<div
							key={item.id}
							className='group flex flex-col gap-2 rounded-lg border border-transparent bg-slate-50 p-3 transition-all hover:border-slate-200'
						>
							<div className='flex items-center gap-3'>
								{/* Quantité */}
								<div className='flex flex-col items-center gap-1'>
									<Button
										type='button'
										size='icon'
										variant='outline'
										className='h-6 w-6'
										onClick={() => onIncrement(item.id)}
									>
										<Plus size={12} />
									</Button>
									<span className='w-6 text-center text-sm font-bold'>
										{item.quantity}
									</span>
									<Button
										type='button'
										size='icon'
										variant='outline'
										className='h-6 w-6'
										onClick={() => onDecrement(item.id)}
									>
										<Minus size={12} />
									</Button>
								</div>

								{/* Infos */}
								<div className='flex-1'>
									<div className='text-sm font-medium text-slate-800'>
										{item.name}
									</div>
									<div className='text-xs text-slate-500'>
										{item.unitPrice.toFixed(2)} € / unité
									</div>
									{item.discountPercent && item.discountPercent > 0 && (
										<div className='text-[11px] text-emerald-600'>
											Remise ligne : {item.discountPercent.toFixed(1)} %
										</div>
									)}
								</div>

								{/* Prix + suppression */}
								<div className='flex flex-col items-end gap-1'>
									<div className='text-sm font-bold text-slate-900'>
										{(
											item.unitPrice *
											item.quantity *
											(1 - (item.discountPercent ?? 0) / 100)
										).toFixed(2)}{' '}
										€
									</div>
									<Button
										type='button'
										variant='ghost'
										size='icon'
										className='h-6 w-6 text-slate-300 hover:text-rose-500'
										onClick={() => onRemove(item.id)}
									>
										<Trash2 size={16} />
									</Button>
								</div>
							</div>

							{/* Ligne remise rapide */}
							{onApplyItemDiscount && (
								<div className='flex items-center justify-between text-[11px] text-slate-500'>
									<span>Remise sur cette ligne</span>
									<div className='flex gap-1'>
										<Button
											type='button'
											variant='outline'
											size='sm'
											className='h-7 px-2 text-[11px]'
											onClick={() =>
												onApplyItemDiscount(item.id, 10, 'percent')
											}
										>
											-10 %
										</Button>
										<Button
											type='button'
											variant='outline'
											size='sm'
											className='h-7 px-2 text-[11px]'
											onClick={() => onApplyItemDiscount(item.id, 5, 'amount')}
										>
											-5 €
										</Button>
									</div>
								</div>
							)}
						</div>
					))
				)}
			</div>

			{/* Totaux + remise ticket */}
			<div className='space-y-3 border-t border-slate-200 bg-slate-50 p-5 text-sm'>
				<div className='flex justify-between text-slate-500'>
					<span>Sous-total (après remises lignes)</span>
					<span>{totals.subtotal.toFixed(2)} €</span>
				</div>

				{/* Remise ticket */}
				<div className='flex items-center justify-between gap-2'>
					<span className='text-slate-500'>Remise ticket</span>
					<div className='flex items-center gap-1'>
						<Input
							className='h-8 w-16 text-right text-xs'
							value={ticketDiscountValue}
							onChange={(e) => setTicketDiscountValue(e.target.value)}
							onBlur={handleTicketDiscountBlur}
							placeholder='0'
						/>
						<Button
							type='button'
							variant={ticketDiscountMode === 'percent' ? 'default' : 'outline'}
							size='sm'
							className='h-8 px-2 text-[11px]'
							onClick={() => setTicketDiscountMode('percent')}
						>
							%
						</Button>
						<Button
							type='button'
							variant={ticketDiscountMode === 'amount' ? 'default' : 'outline'}
							size='sm'
							className='h-8 px-2 text-[11px]'
							onClick={() => setTicketDiscountMode('amount')}
						>
							€
						</Button>
					</div>
				</div>

				{totals.ticketDiscountAmount > 0 && (
					<div className='flex justify-between text-xs text-emerald-600'>
						<span>Remise totale appliquée</span>
						<span>-{totals.ticketDiscountAmount.toFixed(2)} €</span>
					</div>
				)}

				<div className='flex justify-between text-xs text-slate-500'>
					<span>TVA estimée (20 %)</span>
					<span>{totals.tax.toFixed(2)} €</span>
				</div>

				<div className='flex items-end justify-between border-t border-slate-200 pt-3'>
					<span className='text-xl font-bold text-slate-900'>Total</span>
					<span className='text-3xl font-black text-slate-900'>
						{totals.total.toFixed(2)} €
					</span>
				</div>

				{/* Ticket en attente */}
				<div className='mt-1 flex items-center justify-between text-xs'>
					<Button
						type='button'
						size='sm'
						variant='outline'
						className='h-8 px-2 text-[11px]'
						onClick={onHoldTicket}
					>
						Mettre le ticket en attente
					</Button>
					{heldTickets && heldTickets.length > 0 && (
						<span className='text-slate-500'>
							{heldTickets.length} ticket(s) en attente
						</span>
					)}
				</div>
			</div>

			{/* Numpad + paiement */}
			<div className='border-t border-slate-200 bg-white p-4'>
				{/* Numpad */}
				<div className='grid grid-cols-4 gap-2 pb-3'>
					<div className='col-span-4 flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2 text-xs'>
						<div className='flex items-center gap-2'>
							<span className='text-slate-500'>Numpad</span>
							<div className='flex gap-1'>
								<Button
									type='button'
									size='sm'
									variant={numpadMode === 'qty' ? 'default' : 'outline'}
									className='h-7 px-2 text-[11px]'
									onClick={() => setNumpadMode('qty')}
								>
									Qté
								</Button>
								<Button
									type='button'
									size='sm'
									variant={numpadMode === 'discount' ? 'default' : 'outline'}
									className='h-7 px-2 text-[11px]'
									onClick={() => setNumpadMode('discount')}
								>
									Remise
								</Button>
								<Button
									type='button'
									size='sm'
									variant={numpadMode === 'amount' ? 'default' : 'outline'}
									className='h-7 px-2 text-[11px]'
									onClick={() => setNumpadMode('amount')}
								>
									Montant
								</Button>
							</div>
						</div>
						<span className='text-sm font-mono'>{numpadValue || '0'}</span>
					</div>

					{['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((digit) => (
						<Button
							key={digit}
							type='button'
							variant='outline'
							className='h-10 text-base'
							onClick={() => handleNumpadPress(digit)}
						>
							{digit}
						</Button>
					))}
					<Button
						type='button'
						variant='outline'
						className='h-10 text-base'
						onClick={() => handleNumpadPress('0')}
					>
						0
					</Button>
					<Button
						type='button'
						variant='outline'
						className='h-10 text-base'
						onClick={() => handleNumpadPress('.')}
					>
						.
					</Button>
					<Button
						type='button'
						variant='outline'
						className='h-10 text-base'
						onClick={handleNumpadBackspace}
					>
						⌫
					</Button>
					<Button
						type='button'
						className='h-10 text-xs font-semibold'
						onClick={handleNumpadValidate}
					>
						Appliquer
					</Button>
				</div>

				{/* Paiement */}
				<div className='grid grid-cols-2 gap-3'>
					<Button
						type='button'
						onClick={handlePayCash}
						variant='outline'
						className='col-span-1 flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 py-3 font-bold text-slate-700'
					>
						<Banknote size={20} />
						<span className='text-xs'>Espèces</span>
					</Button>
					<Button
						type='button'
						onClick={handlePayCard}
						className='col-span-1 flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-900 py-3 font-bold text-white shadow-lg shadow-slate-200 hover:bg-slate-800 active:scale-95'
					>
						<CreditCard size={20} />
						<span className='text-sm'>
							Payer {totals.total > 0 ? `${totals.total.toFixed(2)} €` : ''}
						</span>
					</Button>
				</div>
			</div>
		</div>
	)
}
