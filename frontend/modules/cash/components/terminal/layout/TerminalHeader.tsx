// frontend/modules/cash/components/terminal/layout/TerminalHeader.tsx
import { Button } from '@/components/ui/button'
import { useOpenCashDrawerMutation } from '@/lib/pos/printerQueries'
import { Loader2, Vault } from 'lucide-react'
import { CashPageHeader } from '../../layout/CashPageHeader'

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
	// onBack,
}: TerminalHeaderProps) {
	const openDrawer = useOpenCashDrawerMutation()

	const handleOpenDrawer = () => {
		openDrawer.mutate()
	}

	return (
		<CashPageHeader
			title={registerName}
			subtitle={`Session ${sessionIdShort} — ${today}`}
			// onBack={onBack}
			actions={
				<>
					<Button
						variant='outline'
						size='sm'
						onClick={handleOpenDrawer}
						disabled={openDrawer.isPending}
						className='h-8'
					>
						{openDrawer.isPending ? (
							<>
								<Loader2 className='h-3.5 w-3.5 mr-2 animate-spin' />
								Ouverture...
							</>
						) : (
							<>
								<Vault className='h-3.5 w-3.5 mr-2' />
								Ouvrir tiroir
							</>
						)}
					</Button>
					<div className='flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1'>
						<span className='h-2 w-2 rounded-full bg-emerald-500' />
						<span className='font-medium text-emerald-700'>
							Session ouverte
						</span>
					</div>
				</>
			}
		/>
	)
}
