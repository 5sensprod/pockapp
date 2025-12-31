// frontend/modules/cash/components/terminal/cart/PaymentButtons.tsx
import { Button } from '@/components/ui/button'
import { Banknote, CreditCard, DollarSign } from 'lucide-react'
import type { PaymentMethod } from '../types/payment'

interface PaymentButtonsProps {
	totalTtc: number
	cartLength: number
	onPaymentClick: (method: PaymentMethod) => void
}

export function PaymentButtons({
	totalTtc,
	cartLength,
	onPaymentClick,
}: PaymentButtonsProps) {
	const isDisabled = totalTtc <= 0 || cartLength === 0

	return (
		<div className='border-t px-4 py-4'>
			<div className='mb-3 grid grid-cols-3 gap-2 text-xs'>
				<Button
					type='button'
					variant='outline'
					className='h-10'
					onClick={() => onPaymentClick('cb')}
					disabled={isDisabled}
				>
					<CreditCard className='h-4 w-4 mr-1' />
					CB
				</Button>
				<Button
					type='button'
					variant='outline'
					className='h-10'
					onClick={() => onPaymentClick('especes')}
					disabled={isDisabled}
				>
					<Banknote className='h-4 w-4 mr-1' />
					Espèces
				</Button>
				<Button
					type='button'
					variant='outline'
					className='h-10'
					onClick={() => onPaymentClick('virement')}
					disabled={isDisabled}
				>
					<DollarSign className='h-4 w-4 mr-1' />
					Autre
				</Button>
			</div>

			<Button
				type='button'
				className='h-11 w-full text-sm font-semibold'
				disabled={isDisabled}
				onClick={() => onPaymentClick('cb')}
			>
				Encaisser {totalTtc > 0 ? `${totalTtc.toFixed(2)} €` : ''}
			</Button>
		</div>
	)
}
