import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Search, X } from 'lucide-react'
import { forwardRef } from 'react'

interface DocumentSearchInputProps {
	value: string
	onValueChange: (value: string) => void
	placeholder: string
	onClear?: () => void
	className?: string
}

export const DocumentSearchInput = forwardRef<
	HTMLInputElement,
	DocumentSearchInputProps
>(function DocumentSearchInput(
	{ value, onValueChange, placeholder, onClear, className },
	ref,
) {
	return (
		<div className={cn('relative min-w-[260px] flex-1', className)}>
			<Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
			<Input
				ref={ref}
				value={value}
				placeholder={placeholder}
				className='h-10 pl-9 pr-9'
				onChange={(event) => onValueChange(event.target.value)}
			/>
			{value && (
				<button
					type='button'
					aria-label='Effacer la recherche'
					className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground'
					onClick={() => (onClear ? onClear() : onValueChange(''))}
				>
					<X className='h-4 w-4' />
				</button>
			)}
		</div>
	)
})
