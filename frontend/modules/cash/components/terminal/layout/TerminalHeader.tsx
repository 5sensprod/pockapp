// frontend/modules/cash/components/terminal/layout/TerminalHeader.tsx
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

interface TerminalHeaderProps {
	registerName: string
	sessionIdShort: string
	today: string
	onBack: () => void
}

export function TerminalHeader({
	registerName,
	sessionIdShort,
	today,
	onBack,
}: TerminalHeaderProps) {
	return (
		<header className='flex items-center justify-between gap-4'>
			<div className='flex items-center gap-3'>
				<Button variant='ghost' size='sm' onClick={onBack}>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour
				</Button>
				<div>
					<h1 className='text-2xl font-semibold tracking-tight'>
						{registerName}
					</h1>
					<p className='text-sm text-muted-foreground'>
						Session {sessionIdShort} — {today}
					</p>
				</div>
			</div>

			<div className='flex items-center gap-4 text-xs text-muted-foreground'>
				<div className='flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1'>
					<span className='h-2 w-2 rounded-full bg-emerald-500' />
					<span className='font-medium text-emerald-700'>Session ouverte</span>
				</div>
			</div>
		</header>
	)
}
