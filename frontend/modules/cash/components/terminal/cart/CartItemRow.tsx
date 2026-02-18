// frontend/modules/cash/components/terminal/cart/CartItemRow.tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import type { CartItem, DisplayMode, LineDiscountMode } from '../types/cart'

interface CartItemRowProps {
	item: CartItem
	isEditing: boolean
	onUpdateQuantity: (itemId: string, quantity: number) => void
	onToggleEdit: (itemId: string | null) => void
	onSetLineDiscountMode: (itemId: string, mode: LineDiscountMode) => void
	onSetLineDiscountValue: (itemId: string, raw: string) => void
	onClearLineDiscount: (itemId: string) => void
	onSetDisplayMode: (itemId: string, mode: DisplayMode) => void
	getEffectiveUnitTtc: (item: CartItem) => number
	getLineTotalTtc: (item: CartItem) => number
	onSetUnitPrice: (itemId: string, raw: string) => void
	onClearUnitPrice: (itemId: string) => void
}

export function CartItemRow({
	item,
	isEditing,
	onUpdateQuantity,
	onToggleEdit,
	onSetLineDiscountMode,
	onSetLineDiscountValue,
	onClearLineDiscount,
	onSetDisplayMode,
	getEffectiveUnitTtc,
	getLineTotalTtc,
	onSetUnitPrice,
	onClearUnitPrice,
}: CartItemRowProps) {
	const hasPriceOverride =
		item.originalUnitPrice != null && item.unitPrice !== item.originalUnitPrice

	const hasActiveLineDiscount =
		!!item.lineDiscountMode &&
		item.lineDiscountValue != null &&
		(item.lineDiscountMode === 'percent'
			? item.lineDiscountValue > 0
			: item.lineDiscountValue < item.unitPrice)

	const getDisplayText = () => {
		if (item.displayMode === 'designation') {
			return item.designation || item.name
		}
		if (item.displayMode === 'sku') {
			return item.sku || item.name
		}
		return item.name
	}

	const isDisplayModeAvailable = (mode: DisplayMode) => {
		switch (mode) {
			case 'name':
				return true
			case 'designation':
				return !!(item.designation && item.designation !== item.name)
			case 'sku':
				return !!(item.sku && item.sku !== item.name && item.sku !== '')
			default:
				return false
		}
	}

	const mode: LineDiscountMode = item.lineDiscountMode ?? 'percent'
	const value = item.lineDiscountRaw || ''
	const currentDisplayMode = item.displayMode || 'name'

	return (
		<div className='py-2'>
			<div className='flex items-start gap-3'>
				{item.image ? (
					<img
						src={item.image}
						alt={getDisplayText()}
						className='h-12 w-12 rounded-md object-cover border border-slate-200 flex-shrink-0'
						onError={(e) => {
							e.currentTarget.style.display = 'none'
							const placeholder = e.currentTarget
								.nextElementSibling as HTMLElement
							if (placeholder) placeholder.style.display = 'flex'
						}}
					/>
				) : null}
				<div
					className='h-12 w-12 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0'
					style={{ display: item.image ? 'none' : 'flex' }}
				>
					<span className='text-xs text-slate-400'>?</span>
				</div>

				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-2'>
						<div className='flex-1 font-medium truncate'>
							{getDisplayText()}
						</div>

						{(isDisplayModeAvailable('designation') ||
							isDisplayModeAvailable('sku')) && (
							<Select
								value={currentDisplayMode}
								onValueChange={(v) =>
									onSetDisplayMode(item.id, v as DisplayMode)
								}
							>
								<SelectTrigger className='h-6 w-[120px] text-xs flex-shrink-0'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='name'>Nom</SelectItem>

									{isDisplayModeAvailable('designation') && (
										<SelectItem value='designation'>Désignation</SelectItem>
									)}

									{isDisplayModeAvailable('sku') && (
										<SelectItem value='sku'>SKU</SelectItem>
									)}
								</SelectContent>
							</Select>
						)}
					</div>

					<div className='mt-1 flex items-center gap-2 text-xs text-slate-500'>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							className='h-5 w-5 p-0'
							onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
						>
							−
						</Button>
						<span>
							{item.quantity} ×{' '}
							{hasPriceOverride ? (
								<>
									<span className='line-through text-slate-400 mr-1'>
										{(item.originalUnitPrice ?? item.unitPrice).toFixed(2)}
									</span>
									<span className='text-blue-600 font-medium'>
										{item.unitPrice.toFixed(2)} €
									</span>
								</>
							) : (
								<>{item.unitPrice.toFixed(2)} €</>
							)}
						</span>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							className='h-5 w-5 p-0'
							onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
						>
							+
						</Button>

						<Button
							type='button'
							variant='ghost'
							size='sm'
							className={`h-6 px-2 text-[11px] ${hasPriceOverride ? 'text-blue-600' : ''}`}
							onClick={() => onToggleEdit(isEditing ? null : item.id)}
						>
							{hasPriceOverride || hasActiveLineDiscount
								? 'Modifier'
								: 'Prix / Remise'}
						</Button>

						{hasPriceOverride && (
							<span className='inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700'>
								<span className='h-1.5 w-1.5 rounded-full bg-blue-500' />
								Prix modifié
							</span>
						)}

						{hasActiveLineDiscount && (
							<span className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700'>
								<span className='h-1.5 w-1.5 rounded-full bg-emerald-500' />
								{item.lineDiscountMode === 'percent'
									? `-${item.lineDiscountValue}%`
									: `-${(item.unitPrice - getEffectiveUnitTtc(item)).toFixed(2)}€`}
							</span>
						)}
					</div>

					{isEditing && (
						<div className='mt-2 space-y-2'>
							{/* Correction du prix */}
							<div className='flex items-center gap-2 rounded-lg bg-blue-50 p-2'>
								<span className='text-xs text-slate-600 whitespace-nowrap'>
									Prix TTC :
								</span>
								<Input
									type='text'
									inputMode='decimal'
									className='h-8 flex-1'
									placeholder={(
										item.originalUnitPrice ?? item.unitPrice
									).toFixed(2)}
									value={item.unitPriceRaw ?? ''}
									onChange={(e) => onSetUnitPrice(item.id, e.target.value)}
								/>
								{hasPriceOverride && (
									<Button
										type='button'
										variant='ghost'
										size='sm'
										className='h-8 px-2 text-[11px]'
										onClick={() => onClearUnitPrice(item.id)}
									>
										Reset prix
									</Button>
								)}
							</div>

							{/* Remise */}
							<div className='flex items-center gap-2 rounded-lg bg-slate-50 p-2'>
								<div className='w-28'>
									<Select
										value={mode}
										onValueChange={(v) =>
											onSetLineDiscountMode(item.id, v as LineDiscountMode)
										}
									>
										<SelectTrigger className='h-8'>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='percent'>%</SelectItem>
											<SelectItem value='unit'>Prix unit.</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<Input
									type='text'
									inputMode='decimal'
									className='h-8 flex-1'
									placeholder={mode === 'unit' ? 'Prix TTC' : '%'}
									value={value}
									onChange={(e) =>
										onSetLineDiscountValue(item.id, e.target.value)
									}
								/>
								<div className='text-xs text-slate-600 w-28 text-right'>
									{getEffectiveUnitTtc(item).toFixed(2)} €
								</div>
								<Button
									type='button'
									variant='ghost'
									size='sm'
									className='h-8 px-2 text-[11px]'
									onClick={() => onClearLineDiscount(item.id)}
								>
									Reset
								</Button>
							</div>
						</div>
					)}
				</div>

				<span className='font-semibold'>
					{getLineTotalTtc(item).toFixed(2)} €
				</span>
			</div>
		</div>
	)
}
