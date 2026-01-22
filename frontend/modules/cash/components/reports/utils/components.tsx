// frontend/modules/cash/components/reports/utils/components.tsx

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import type { VATByRate } from '@/lib/types/cash.types'
import { getVATRateLabel } from '@/lib/types/cash.types'
import { formatCurrency } from './formatting'

interface VATBreakdownTableProps {
	vatByRate: VATByRate
	showTotals?: boolean
}

/**
 * Tableau de ventilation de la TVA par taux
 */
export function VATBreakdownTable({
	vatByRate,
	showTotals = true,
}: VATBreakdownTableProps) {
	const entries = Object.entries(vatByRate).sort(
		([a], [b]) => Number.parseFloat(b) - Number.parseFloat(a),
	)

	if (entries.length === 0) {
		return <p className='text-sm text-muted-foreground'>Aucune TVA collectée</p>
	}

	const totals = showTotals
		? entries.reduce(
				(acc, [, detail]) => ({
					baseHT: acc.baseHT + detail.base_ht,
					vatAmount: acc.vatAmount + detail.vat_amount,
					totalTTC: acc.totalTTC + detail.total_ttc,
				}),
				{ baseHT: 0, vatAmount: 0, totalTTC: 0 },
			)
		: null

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Taux</TableHead>
					<TableHead className='text-right'>Base HT</TableHead>
					<TableHead className='text-right'>TVA</TableHead>
					<TableHead className='text-right'>Total TTC</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{entries.map(([rate, detail]) => (
					<TableRow key={rate}>
						<TableCell className='font-medium'>
							{getVATRateLabel(rate)}
						</TableCell>
						<TableCell className='text-right'>
							{formatCurrency(detail.base_ht)}
						</TableCell>
						<TableCell className='text-right text-blue-600 font-medium'>
							{formatCurrency(detail.vat_amount)}
						</TableCell>
						<TableCell className='text-right'>
							{formatCurrency(detail.total_ttc)}
						</TableCell>
					</TableRow>
				))}
				{showTotals && totals && (
					<TableRow className='bg-slate-50 font-medium'>
						<TableCell>TOTAL</TableCell>
						<TableCell className='text-right'>
							{formatCurrency(totals.baseHT)}
						</TableCell>
						<TableCell className='text-right text-blue-600'>
							{formatCurrency(totals.vatAmount)}
						</TableCell>
						<TableCell className='text-right text-emerald-600'>
							{formatCurrency(totals.totalTTC)}
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	)
}

interface PaymentMethodBreakdownProps {
	byMethod: Record<string, number>
	label?: string
	colorClass?: string
}

/**
 * Affichage de la répartition par mode de paiement
 */
// 1. INTERFACE (ajouter byMethodLabels)
interface PaymentMethodBreakdownProps {
	byMethod: Record<string, number>
	byMethodLabels?: Record<string, string> // 🆕 AJOUTER
	label?: string
	colorClass?: string
}

// 2. FONCTION (ajouter le param et utiliser les labels)
export function PaymentMethodBreakdown({
	byMethod,
	byMethodLabels, // 🆕 AJOUTER
	label = 'Par mode de paiement',
	colorClass = 'font-medium',
}: PaymentMethodBreakdownProps) {
	if (!byMethod || Object.keys(byMethod).length === 0) {
		return null
	}

	return (
		<div className='space-y-2'>
			<div className='text-xs font-medium text-muted-foreground'>{label}</div>
			<div className='space-y-2'>
				{Object.entries(byMethod).map(([method, amount]) => {
					// 🆕 Utiliser le label custom si disponible
					const displayName =
						byMethodLabels?.[method] ||
						(method === 'cb'
							? 'CB'
							: method === 'especes'
								? 'Espèces'
								: method === 'cheque'
									? 'Chèque'
									: method === 'virement'
										? 'Virement'
										: method)

					return (
						<div key={method} className='flex justify-between text-sm'>
							<span className='capitalize'>{displayName}</span>
							<span className={colorClass}>{formatCurrency(amount)}</span>
						</div>
					)
				})}
			</div>
		</div>
	)
}
