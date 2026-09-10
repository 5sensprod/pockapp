import { cn } from '@/lib/utils'
import type {
	KeyboardEventHandler,
	MouseEventHandler,
	PointerEventHandler,
} from 'react'

interface ResizableExplorerHandleProps {
	label: string
	value: number
	min: number
	max: number
	onPointerDown: PointerEventHandler<HTMLHRElement>
	onPointerMove: PointerEventHandler<HTMLHRElement>
	onPointerUp: PointerEventHandler<HTMLHRElement>
	onPointerCancel: PointerEventHandler<HTMLHRElement>
	onDoubleClick: MouseEventHandler<HTMLHRElement>
	onKeyDown: KeyboardEventHandler<HTMLHRElement>
	className?: string
}

export function ResizableExplorerHandle({
	label,
	value,
	min,
	max,
	className,
	...handlers
}: ResizableExplorerHandleProps) {
	return (
		<hr
			aria-orientation='vertical'
			aria-label={label}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={value}
			tabIndex={0}
			draggable={false}
			title='Faire glisser pour modifier la largeur · double-clic pour réinitialiser'
			onDragStart={(event) => event.preventDefault()}
			className={cn(
				'relative m-0 hidden h-auto cursor-col-resize touch-none border-0 bg-transparent after:absolute after:inset-y-2 after:left-1/2 after:w-px after:-translate-x-1/2 after:rounded-full after:bg-border after:transition-[width,background-color] hover:after:w-1 hover:after:bg-primary/35 active:after:w-1 active:after:bg-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:block',
				className,
			)}
			{...handlers}
		/>
	)
}
