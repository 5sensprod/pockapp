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
		if (item.displayMode === 'designation') return item.designation || item.name
		if (item.displayMode === 'sku') return item.sku || item.name
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

	const hasDisplayChoice =
		isDisplayModeAvailable('designation') || isDisplayModeAvailable('sku')
	const mode: LineDiscountMode = item.lineDiscountMode ?? 'percent'
	const value = item.lineDiscountRaw || ''
	const currentDisplayMode = item.displayMode || 'name'

	return (
		<div className='py-2.5'>
			{/* ── Ligne principale ──────────────────────────────────────── */}
			<div className='flex items-center gap-2.5'>
				{/* Photo */}
				<div className='shrink-0'>
					{item.image ? (
						<img
							src={item.image}
							alt={getDisplayText()}
							className='h-10 w-10 rounded-md object-cover border border-border/40'
							onError={(e) => {
								e.currentTarget.style.display = 'none'
								const next = e.currentTarget.nextElementSibling as HTMLElement
								if (next) next.style.display = 'flex'
							}}
						/>
					) : null}
					<div
						className='h-10 w-10 rounded-md bg-muted flex items-center justify-center'
						style={{ display: item.image ? 'none' : 'flex' }}
					>
						<span className='text-xs text-muted-foreground'>?</span>
					</div>
				</div>

				{/* Nom — prend tout l'espace disponible */}
				<div className='flex-1 min-w-0'>
					<p className='text-sm font-medium truncate leading-tight'>
						{getDisplayText()}
					</p>
					{hasPriceOverride && (
						<span className='text-[10px] text-blue-600 font-medium'>
							Prix modifié
						</span>
					)}
					{hasActiveLineDiscount && !hasPriceOverride && (
						<span className='text-[10px] text-emerald-600 font-medium'>
							{item.lineDiscountMode === 'percent'
								? `-${item.lineDiscountValue}%`
								: `-${(item.unitPrice - getEffectiveUnitTtc(item)).toFixed(2)}€`}
						</span>
					)}
				</div>

				{/* Total ligne */}
				<span className='shrink-0 text-sm font-semibold tabular-nums'>
					{getLineTotalTtc(item).toFixed(2)} €
				</span>
			</div>

			{/* ── Ligne actions ─────────────────────────────────────────── */}
			<div className='mt-1.5 ml-12 flex items-center gap-1.5 flex-wrap'>
				{/* Contrôle quantité */}
				<div className='flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1 py-0.5'>
					<button
						type='button'
						onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
						className='h-6 w-6 rounded flex items-center justify-center text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors'
					>
						−
					</button>
					<span className='text-xs tabular-nums min-w-[48px] text-center text-foreground'>
						{item.quantity} × {item.unitPrice.toFixed(2)} €
					</span>
					<button
						type='button'
						onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
						className='h-6 w-6 rounded flex items-center justify-center text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors'
					>
						+
					</button>
				</div>

				{/* Bouton Remise / Modifier */}
				<button
					type='button'
					onClick={() => onToggleEdit(isEditing ? null : item.id)}
					className={`h-7 px-2.5 rounded-md text-[11px] font-medium border transition-colors ${
						isEditing || hasPriceOverride || hasActiveLineDiscount
							? 'border-primary/30 bg-primary/5 text-primary'
							: 'border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:border-border'
					}`}
				>
					{hasPriceOverride
						? 'Prix modifié'
						: hasActiveLineDiscount
							? 'Remise active'
							: 'Remise'}
				</button>

				{/* Dropdown affichage — discret, en ligne */}
				{hasDisplayChoice && (
					<Select
						value={currentDisplayMode}
						onValueChange={(v) => onSetDisplayMode(item.id, v as DisplayMode)}
					>
						<SelectTrigger className='h-7 w-auto min-w-[70px] text-[11px] border-border/40 bg-transparent text-muted-foreground px-2'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='name' className='text-xs'>
								Nom
							</SelectItem>
							{isDisplayModeAvailable('designation') && (
								<SelectItem value='designation' className='text-xs'>
									Désignation
								</SelectItem>
							)}
							{isDisplayModeAvailable('sku') && (
								<SelectItem value='sku' className='text-xs'>
									SKU
								</SelectItem>
							)}
						</SelectContent>
					</Select>
				)}
			</div>

			{/* ── Zone édition dépliable ────────────────────────────────── */}
			{isEditing && (
				<div className='mt-2 ml-12 space-y-2'>
					{/* Prix TTC */}
					<div className='flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2'>
						<span className='text-xs text-muted-foreground whitespace-nowrap'>
							Prix TTC :
						</span>
						<Input
							type='text'
							inputMode='decimal'
							className='h-7 flex-1 text-xs'
							placeholder={(item.originalUnitPrice ?? item.unitPrice).toFixed(
								2,
							)}
							value={item.unitPriceRaw ?? ''}
							onChange={(e) => onSetUnitPrice(item.id, e.target.value)}
						/>
						{hasPriceOverride && (
							<Button
								type='button'
								variant='ghost'
								size='sm'
								className='h-7 px-2 text-[11px] text-muted-foreground'
								onClick={() => onClearUnitPrice(item.id)}
							>
								Reset
							</Button>
						)}
					</div>

					{/* Remise ligne */}
					<div className='flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2'>
						<Select
							value={mode}
							onValueChange={(v) =>
								onSetLineDiscountMode(item.id, v as LineDiscountMode)
							}
						>
							<SelectTrigger className='h-7 w-20 text-xs'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='percent' className='text-xs'>
									%
								</SelectItem>
								<SelectItem value='unit' className='text-xs'>
									Prix unit.
								</SelectItem>
							</SelectContent>
						</Select>
						<Input
							type='text'
							inputMode='decimal'
							className='h-7 flex-1 text-xs'
							placeholder={mode === 'unit' ? 'Prix TTC' : '%'}
							value={value}
							onChange={(e) => onSetLineDiscountValue(item.id, e.target.value)}
						/>
						<span className='text-xs text-muted-foreground tabular-nums whitespace-nowrap'>
							→ {getEffectiveUnitTtc(item).toFixed(2)} €
						</span>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							className='h-7 px-2 text-[11px] text-muted-foreground'
							onClick={() => onClearLineDiscount(item.id)}
						>
							Reset
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
