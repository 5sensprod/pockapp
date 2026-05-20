// frontend/modules/cash/components/reports/components/CashMovementsCard.tsx

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { MovementDetail } from '@/lib/types/cash.types'
import {
	ArrowDownLeft,
	ArrowUpRight,
	Banknote,
	RefreshCw,
	Vault,
} from 'lucide-react'
import { formatCurrency, formatDateTime } from '../utils'

interface CashMovementsCardProps {
	cashIn: number
	cashOut: number
	safeDrop: number
	total: number
	details?: MovementDetail[]
}

const MOVEMENT_CONFIG = {
	cash_in: {
		label: 'Entrée',
		icon: ArrowUpRight,
		color: 'text-emerald-600',
		bg: 'bg-emerald-50',
		sign: '+',
	},
	cash_out: {
		label: 'Sortie',
		icon: ArrowDownLeft,
		color: 'text-red-600',
		bg: 'bg-red-50',
		sign: '-',
	},
	refund_out: {
		label: 'Remboursement',
		icon: RefreshCw,
		color: 'text-red-600',
		bg: 'bg-red-50',
		sign: '-',
	},
	safe_drop: {
		label: 'Dépôt coffre',
		icon: Vault,
		color: 'text-blue-600',
		bg: 'bg-blue-50',
		sign: '-',
	},
	adjustment: {
		label: 'Ajustement',
		icon: Banknote,
		color: 'text-amber-600',
		bg: 'bg-amber-50',
		sign: '',
	},
} as const

export function CashMovementsCard({
	cashIn,
	cashOut,
	safeDrop,
	total,
	details,
}: CashMovementsCardProps) {
	const hasDetails = details && details.length > 0

	return (
		<div className='space-y-3'>
			{/* Totaux résumés */}
			<Card>
				<CardContent className='pt-6 space-y-2 text-sm'>
					<div className='flex justify-between'>
						<span className='text-muted-foreground'>Entrées espèces :</span>
						<span className='text-emerald-600 font-medium'>
							+{formatCurrency(cashIn)}
						</span>
					</div>
					<div className='flex justify-between'>
						<span className='text-muted-foreground'>Sorties espèces :</span>
						<span className='text-red-600 font-medium'>
							-{formatCurrency(cashOut)}
						</span>
					</div>
					<div className='flex justify-between'>
						<span className='text-muted-foreground'>Dépôts en coffre :</span>
						<span className='text-blue-600 font-medium'>
							-{formatCurrency(safeDrop)}
						</span>
					</div>
					<Separator />
					<div className='flex justify-between font-semibold'>
						<span>Total mouvements :</span>
						<span>{formatCurrency(total)}</span>
					</div>
				</CardContent>
			</Card>

			{/* Journal ligne par ligne */}
			{hasDetails && (
				<Card>
					<CardContent className='pt-4 pb-3'>
						<p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3'>
							Journal de caisse
						</p>
						<div className='space-y-1'>
							{details.map((mov) => {
								const cfg =
									MOVEMENT_CONFIG[
										mov.movement_type as keyof typeof MOVEMENT_CONFIG
									] ?? MOVEMENT_CONFIG.cash_in
								const Icon = cfg.icon
								const isOut = cfg.sign === '-'

								return (
									<div
										key={mov.id}
										className='flex items-center gap-3 py-2 border-b border-border/40 last:border-0'
									>
										<div
											className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${cfg.bg}`}
										>
											<Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
										</div>
										<div className='flex-1 min-w-0'>
											<p className='text-sm font-medium leading-tight truncate'>
												{mov.reason || cfg.label}
											</p>
											<p className='text-xs text-muted-foreground'>
												{formatDateTime(mov.created_at)}
												{mov.movement_type && (
													<Badge
														variant='outline'
														className='ml-2 text-xs px-1 py-0 h-4'
													>
														{cfg.label}
													</Badge>
												)}
											</p>
										</div>
										<span
											className={`text-sm font-semibold tabular-nums ${isOut ? 'text-red-600' : 'text-emerald-600'}`}
										>
											{cfg.sign}
											{formatCurrency(Math.abs(mov.amount))}
										</span>
									</div>
								)
							})}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
