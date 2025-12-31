// frontend/modules/cash/components/reports/components/ReportHeader.tsx

import { Button } from '@/components/ui/button'
import { ArrowLeft, Download, Printer } from 'lucide-react'

interface ReportHeaderProps {
	title: string
	subtitle?: string
	onBack?: () => void
	onPrint?: () => void
	onExport?: () => void
	showActions?: boolean
}

/**
 * En-tête commun pour les pages de rapports
 */
export function ReportHeader({
	title,
	subtitle,
	onBack,
	onPrint,
	onExport,
	showActions = false,
}: ReportHeaderProps) {
	return (
		<div className='flex items-center justify-between mb-6'>
			<div className='flex items-center gap-3'>
				{onBack && (
					<Button variant='ghost' size='icon' onClick={onBack}>
						<ArrowLeft className='h-5 w-5' />
					</Button>
				)}
				<div>
					<h1 className='text-2xl font-semibold'>{title}</h1>
					{subtitle && (
						<p className='text-sm text-muted-foreground'>{subtitle}</p>
					)}
				</div>
			</div>

			{showActions && (onPrint || onExport) && (
				<div className='flex gap-2'>
					{onPrint && (
						<Button variant='outline' size='sm' onClick={onPrint}>
							<Printer className='h-4 w-4 mr-2' />
							Imprimer
						</Button>
					)}
					{onExport && (
						<Button variant='outline' size='sm' onClick={onExport}>
							<Download className='h-4 w-4 mr-2' />
							Export PDF
						</Button>
					)}
				</div>
			)}
		</div>
	)
}
