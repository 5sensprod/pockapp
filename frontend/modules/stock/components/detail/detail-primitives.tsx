import { HelpCircle, Pencil } from 'lucide-react'
import { useEffect, useRef } from 'react'

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

export function EditableDetailCard({
	title,
	banner,
	children,
	editing,
	dirty,
	onEdit,
	className,
	contentClassName,
	headerRight,
}: {
	title: string
	banner: string
	children: React.ReactNode
	editing: boolean
	dirty: boolean
	onEdit: () => void
	className?: string
	contentClassName?: string
	headerRight?: React.ReactNode
}) {
	const cardRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!editing) return
		const frame = requestAnimationFrame(() => {
			const firstField = cardRef.current?.querySelector<HTMLElement>(
				'input:not([disabled]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]',
			)
			firstField?.focus()
		})
		return () => cancelAnimationFrame(frame)
	}, [editing])

	const openFromEvent = (target: EventTarget | null) => {
		if (editing) return
		if (target instanceof Element) {
			const interactive = target.closest('button, a, [role="button"]')
			if (interactive && interactive !== cardRef.current) return
		}
		onEdit()
	}

	return (
		<Card
			ref={cardRef}
			data-editable-card
			role={editing ? undefined : 'button'}
			tabIndex={editing ? undefined : 0}
			aria-label={editing ? undefined : `Modifier ${title}`}
			onClick={(event) => openFromEvent(event.target)}
			onKeyDown={(event) => {
				if (editing || (event.key !== 'Enter' && event.key !== ' ')) return
				event.preventDefault()
				onEdit()
			}}
			className={cn(
				'group relative overflow-hidden shadow-sm transition-all duration-200',
				editing
					? '-translate-y-0.5 cursor-default border-primary/60 shadow-[0_0_0_3px_hsl(var(--primary)/0.06),0_14px_32px_hsl(var(--foreground)/0.08)]'
					: 'cursor-pointer hover:-translate-y-px hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
				className,
			)}
		>
			{dirty && (
				<span
					aria-hidden
					className='absolute top-5 left-0 z-10 h-8 w-[3px] rounded-r bg-amber-500'
				/>
			)}
			<CardHeader
				className={cn(
					'flex min-h-16 flex-row items-center justify-between gap-4 border-b px-6 py-4 transition-colors',
					editing ? 'border-primary/15 bg-primary/[0.035]' : 'bg-background',
				)}
			>
				<div className='min-w-0'>
					<CardTitle className='font-semibold text-base text-primary/90 tracking-tight'>
						{title}
					</CardTitle>
				</div>
				<div className='flex shrink-0 items-center gap-2'>
					{headerRight}
					<span
						title={editing ? 'En édition' : 'Modifier'}
						aria-hidden
						className={cn(
							'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
							editing
								? 'bg-primary/10 text-primary'
								: 'text-muted-foreground/60 group-hover:bg-primary/10 group-hover:text-primary',
						)}
					>
						<Pencil className='h-3.5 w-3.5' />
					</span>
				</div>
			</CardHeader>
			<CardContent
				className={cn(
					'p-6 [&_input]:h-11 [&_label]:font-semibold [&_label]:text-muted-foreground [&_label]:text-xs [&_select]:h-11',
					contentClassName,
				)}
			>
				<div
					className={cn(
						'grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-200',
						editing
							? 'mb-5 grid-rows-[1fr] opacity-100'
							: 'mb-0 grid-rows-[0fr] opacity-0',
					)}
				>
					<div className='min-h-0'>
						<p className='rounded-lg bg-primary/[0.07] px-3 py-2 text-primary text-[11px] font-medium'>
							{banner}
						</p>
					</div>
				</div>
				{children}
			</CardContent>
		</Card>
	)
}

export function DetailStatusCard({
	title,
	children,
	headerRight,
	muted = false,
	dirty = false,
}: {
	title: string
	children: React.ReactNode
	headerRight: React.ReactNode
	muted?: boolean
	dirty?: boolean
}) {
	return (
		<Card className='relative overflow-hidden shadow-sm'>
			{dirty && (
				<span
					aria-hidden
					className='absolute top-4 left-0 z-10 h-8 w-[3px] rounded-r bg-amber-500'
				/>
			)}
			<CardHeader className='flex min-h-16 flex-row items-center justify-between gap-4 border-b bg-background px-6 py-4'>
				<CardTitle className='font-semibold text-base text-primary/90 tracking-tight'>
					{title}
				</CardTitle>
				{headerRight}
			</CardHeader>
			<CardContent
				className={cn(
					'p-6 transition-[background-color,opacity,filter] duration-200',
					muted && 'bg-muted/35 opacity-55 grayscale',
				)}
			>
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
	valueClassName,
}: {
	label: string
	value?: React.ReactNode
	wide?: boolean
	valueClassName?: string
}) {
	const displayValue =
		value === null || value === undefined || value === '' ? '—' : value

	return (
		<div className={wide ? 'sm:col-span-2' : undefined}>
			<p className='font-medium text-muted-foreground text-xs'>{label}</p>
			<div
				className={cn(
					'mt-1 min-h-5 font-medium text-foreground/90 text-sm',
					valueClassName,
				)}
			>
				{displayValue}
			</div>
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
