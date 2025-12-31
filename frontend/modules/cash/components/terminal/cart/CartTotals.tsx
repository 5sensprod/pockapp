// frontend/modules/cash/components/terminal/cart/CartTotals.tsx
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { VatBreakdown } from '../types/cart'

interface CartTotalsProps {
	subtotalTtc: number
	totalVat: number
	totalTtc: number
	vatBreakdown: VatBreakdown[]
	cartDiscountMode: 'percent' | 'amount'
	cartDiscountRaw: string
	discountAmount: number
	onCartDiscountModeChange: (mode: 'percent' | 'amount') => void
	onCartDiscountChange: (raw: string) => void
}

export function CartTotals({
	subtotalTtc,
	totalVat,
	totalTtc,
	vatBreakdown,
	cartDiscountMode,
	cartDiscountRaw,
	discountAmount,
	onCartDiscountModeChange,
	onCartDiscountChange,
}: CartTotalsProps) {
	return (
		<div className='border-t px-4 py-4 text-sm'>
			<div className='flex items-center justify-between'>
				<span>Sous-total</span>
				<span>{subtotalTtc.toFixed(2)} €</span>
			</div>

			<div className='mt-2 flex items-center justify-between gap-2'>
				<span>Remise</span>
				<div className='flex items-center gap-1'>
					<Select
						value={cartDiscountMode}
						onValueChange={onCartDiscountModeChange}
					>
						<SelectTrigger className='h-8 w-20'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='percent'>%</SelectItem>
							<SelectItem value='amount'>€</SelectItem>
						</SelectContent>
					</Select>

					<Input
						type='text'
						inputMode='decimal'
						className='h-8 w-20 bg-slate-50 text-right text-sm'
						value={cartDiscountRaw}
						onChange={(e) => onCartDiscountChange(e.target.value)}
						placeholder='0'
					/>
				</div>
			</div>

			{discountAmount > 0 && (
				<div className='mt-1 flex items-center justify-between text-xs text-slate-500'>
					<span>Montant remise</span>
					<span>-{discountAmount.toFixed(2)} €</span>
				</div>
			)}

			<div className='mt-3 space-y-1'>
				<div className='flex items-center justify-between text-xs font-medium text-slate-600'>
					<span>TVA totale</span>
					<span>{totalVat.toFixed(2)} €</span>
				</div>
				{vatBreakdown.map((vb) => (
					<div
						key={vb.rate}
						className='flex items-center justify-between text-xs text-slate-500 pl-4'
					>
						<span>
							Dont TVA {vb.rate}% sur {vb.base_ht.toFixed(2)} € HT
						</span>
						<span>{vb.vat.toFixed(2)} €</span>
					</div>
				))}
			</div>

			<Separator className='my-2' />

			<div className='flex items-center justify-between pt-1 text-base font-semibold'>
				<span>Total TTC</span>
				<span>{totalTtc.toFixed(2)} €</span>
			</div>
		</div>
	)
}
