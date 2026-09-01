import { HelpCircle } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function DetailCard({
	title,
	children,
	className,
	contentClassName,
}: {
	title: string
	children: React.ReactNode
	className?: string
	contentClassName?: string
}) {
	return (
		<Card className={cn('overflow-hidden shadow-sm', className)}>
			<CardHeader className='border-b bg-muted/20 px-4 py-2.5'>
				<CardTitle className='font-semibold text-sm'>{title}</CardTitle>
			</CardHeader>
			<CardContent className={cn('p-4', contentClassName)}>
				{children}
			</CardContent>
		</Card>
	)
}

export function DetailSection({
	title,
	children,
}: {
	title: string
	children: React.ReactNode
}) {
	return (
		<section className='px-4 py-3.5'>
			<h3 className='mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide'>
				{title}
			</h3>
			{children}
		</section>
	)
}

export function ReadValue({
	label,
	value,
	wide = false,
}: { label: string; value?: React.ReactNode; wide?: boolean }) {
	const displayValue =
		value === null || value === undefined || value === '' ? '—' : value

	return (
		<div className={wide ? 'sm:col-span-2' : undefined}>
			<p className='text-muted-foreground text-xs'>{label}</p>
			<div className='mt-0.5 min-h-5 text-sm'>{displayValue}</div>
		</div>
	)
}

export function HelpTooltip({ text }: { text: string }) {
	return (
		<TooltipProvider delayDuration={100} skipDelayDuration={0}>
			<Tooltip delayDuration={100}>
				<TooltipTrigger asChild>
					<button
						type='button'
						aria-label='Plus d’informations'
						className='ml-1 inline-flex text-muted-foreground'
					>
						<HelpCircle className='h-3.5 w-3.5' />
					</button>
				</TooltipTrigger>
				<TooltipContent className='max-w-72'>{text}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}

export function NativeSelect(
	props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
	return (
		<select
			{...props}
			className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
		/>
	)
}
