// frontend/components/PeriodSelector.tsx

import { CalendarIcon } from 'lucide-react'

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { PERIOD_LABELS, type Period } from '@/lib/hooks/usePeriodFilter'

const PERIOD_OPTIONS: Period[] = [
	'all',
	'this_week',
	'last_week',
	'this_month',
	'last_month',
	'this_quarter',
	'this_year',
]

interface PeriodSelectorProps {
	period: Period
	onPeriodChange: (period: Period) => void
	className?: string
}

export function PeriodSelector({
	period,
	onPeriodChange,
	className,
}: PeriodSelectorProps) {
	return (
		<Select value={period} onValueChange={(v) => onPeriodChange(v as Period)}>
			<SelectTrigger className={`w-[200px] h-9 ${className ?? ''}`}>
				<CalendarIcon className='h-4 w-4 mr-2 text-muted-foreground shrink-0' />
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{PERIOD_OPTIONS.map((p) => (
					<SelectItem key={p} value={p}>
						{PERIOD_LABELS[p]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
