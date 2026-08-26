import { HelpCircle } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'

export function DetailCard({
	title,
	children,
}: { title: string; children: React.ReactNode }) {
	return (
		<Card>
			<CardHeader className='pb-3'>
				<CardTitle className='text-base'>{title}</CardTitle>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	)
}

export function ReadValue({
	label,
	value,
	wide = false,
}: { label: string; value?: React.ReactNode; wide?: boolean }) {
	return (
		<div className={wide ? 'sm:col-span-2' : undefined}>
			<p className='text-muted-foreground text-xs'>{label}</p>
			<div className='mt-0.5 min-h-5 text-sm'>{value || '—'}</div>
		</div>
	)
}

export function HelpTooltip({ text }: { text: string }) {
	return (
		<TooltipProvider>
			<Tooltip>
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
