// frontend/components/PeriodFilterCard.tsx

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
	PRESET_PERIODS,
	type Period,
	type PresetPeriod,
} from '@/lib/hooks/usePeriodFilter'
import { cn } from '@/lib/utils'
import { type ReactNode, useId } from 'react'

interface PeriodFilterCardProps {
	period: Period
	from: string
	to: string
	onPeriodChange: (period: PresetPeriod) => void
	onFromChange: (from: string) => void
	onToChange: (to: string) => void
	filters?: ReactNode
	className?: string
}

export function PeriodFilterCard({
	period,
	from,
	to,
	onPeriodChange,
	onFromChange,
	onToChange,
	filters,
	className,
}: PeriodFilterCardProps) {
	const id = useId()

	return (
		<Card className={cn('shadow-sm border-muted/60', className)}>
			<CardContent className='p-5 h-full flex items-center'>
				<div className='flex w-full flex-wrap items-end gap-4'>
					<div className='flex flex-wrap gap-2'>
						{PRESET_PERIODS.map(([value, label]) => (
							<Button
								key={value}
								type='button'
								size='sm'
								variant={period === value ? 'default' : 'outline'}
								className='h-10 px-3'
								onClick={() => onPeriodChange(value)}
							>
								{label}
							</Button>
						))}
					</div>

					<Separator orientation='vertical' className='hidden sm:block h-10' />

					<div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
						<div className='space-y-1'>
							<Label htmlFor={`${id}-from`} className='text-xs'>
								Du
							</Label>
							<Input
								id={`${id}-from`}
								type='date'
								value={from}
								max={to || undefined}
								className='w-40'
								onChange={(event) => onFromChange(event.target.value)}
							/>
						</div>
						<div className='space-y-1'>
							<Label htmlFor={`${id}-to`} className='text-xs'>
								Au
							</Label>
							<Input
								id={`${id}-to`}
								type='date'
								value={to}
								min={from || undefined}
								className='w-40'
								onChange={(event) => onToChange(event.target.value)}
							/>
						</div>
					</div>

					{filters && (
						<>
							<Separator
								orientation='vertical'
								className='hidden xl:block h-10'
							/>
							<div className='ml-auto flex min-w-[280px] flex-1 flex-wrap items-center justify-end gap-2'>
								{filters}
							</div>
						</>
					)}
				</div>
			</CardContent>
		</Card>
	)
}
