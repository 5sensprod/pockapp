'use client'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import type { RapportX } from '@/lib/types/cash.types'
import { FileText, Loader2, Printer } from 'lucide-react'
import {
	CashMovementsCard,
	ExpectedCashCard,
	RefundsCard,
	SalesCard,
	SessionInfoCard,
	formatDateTime,
	usePrintReport,
} from './index'

interface RapportXDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	rapport: RapportX | undefined
	isLoading?: boolean
}

export function RapportXDialog({
	open,
	onOpenChange,
	rapport,
	isLoading,
}: RapportXDialogProps) {
	const { handlePrint } = usePrintReport()

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
				<DialogHeader>
					<div className='flex items-center justify-between'>
						<div>
							<DialogTitle className='flex items-center gap-2'>
								<FileText className='h-5 w-5' />
								Rapport X - Lecture Intermédiaire
							</DialogTitle>
							{rapport && (
								<DialogDescription>
									Session ouverte le {formatDateTime(rapport.session.opened_at)}
								</DialogDescription>
							)}
						</div>
						{rapport && (
							<Button variant='outline' size='sm' onClick={handlePrint}>
								<Printer className='mr-2 h-4 w-4' />
								Imprimer
							</Button>
						)}
					</div>
				</DialogHeader>

				{isLoading ? (
					<div className='flex items-center justify-center py-12'>
						<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
					</div>
				) : !rapport ? (
					<div className='text-center py-12 text-muted-foreground'>
						Aucune donnée disponible
					</div>
				) : (
					<div className='space-y-6'>
						{/* Informations session */}
						<SessionInfoCard
							cashRegister={rapport.session.cash_register}
							generatedAt={rapport.generated_at}
							openedAt={rapport.session.opened_at}
							status='open'
						/>

						<Separator />

						{/* Ventes */}
						<div>
							<h4 className='font-semibold mb-3'>Ventes</h4>
							<SalesCard
								invoiceCount={rapport.sales.invoice_count}
								totalTTC={rapport.sales.total_ttc}
								byMethod={rapport.sales.by_method}
								netByMethod={rapport.sales.net_by_method}
							/>
						</div>

						<Separator />

						{/* Remboursements */}
						<div>
							<h4 className='font-semibold mb-3'>Remboursements</h4>
							<RefundsCard
								creditNotesCount={rapport.refunds?.credit_notes_count ?? 0}
								totalTTC={rapport.refunds?.total_ttc ?? 0}
								byMethod={rapport.refunds?.by_method}
							/>
						</div>

						<Separator />

						{/* Mouvements de caisse */}
						<div>
							<h4 className='font-semibold mb-3'>Mouvements de caisse</h4>
							<CashMovementsCard
								cashIn={rapport.movements.cash_in}
								cashOut={rapport.movements.cash_out}
								safeDrop={rapport.movements.safe_drop}
								total={rapport.movements.total}
							/>
						</div>

						<Separator />

						{/* Espèces attendues en caisse */}
						<div>
							<h4 className='font-semibold mb-3'>
								Espèces attendues en caisse
							</h4>
							<ExpectedCashCard
								openingFloat={rapport.expected_cash.opening_float}
								movements={rapport.expected_cash.movements}
								total={rapport.expected_cash.total}
								salesCash={rapport.expected_cash.sales_cash}
								showSalesInfo={true}
							/>
						</div>

						{/* Note */}
						<div className='text-center'>
							<p className='text-sm text-muted-foreground italic'>
								{rapport.note}
							</p>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
