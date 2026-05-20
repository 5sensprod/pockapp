// frontend/modules/cash/components/reports/RapportXDialog.tsx

'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { type RapportX, aggregateEreporting } from '@/lib/types/cash.types'
import {
	FileText,
	Loader2,
	Printer,
	Receipt,
	TrendingUp,
	Wallet,
} from 'lucide-react'
import {
	CashMovementsCard,
	ExpectedCashCard,
	RefundsCard,
	SalesCard,
	SessionInfoCard,
	VATBreakdownTable,
	formatCurrency,
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
								Rapport X — Lecture intermédiaire
							</DialogTitle>
							{rapport && (
								<DialogDescription>
									Session{' '}
									{rapport.session.status === 'open' ? 'ouverte' : 'fermée'} le{' '}
									{formatDateTime(rapport.session.opened_at)}
								</DialogDescription>
							)}
						</div>
						<div className='flex items-center gap-2'>
							{rapport?.session.status === 'open' && (
								<Badge
									variant='outline'
									className='text-emerald-700 border-emerald-200 gap-1'
								>
									<span className='w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block' />
									Session ouverte
								</Badge>
							)}
							{rapport && (
								<Button variant='outline' size='sm' onClick={handlePrint}>
									<Printer className='mr-2 h-4 w-4' />
									Imprimer
								</Button>
							)}
						</div>
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
							status={rapport.session.status}
						/>

						<Separator />

						{/* Ventes avec ventilation B2C/B2B */}
						<Section icon={TrendingUp} title='Ventes'>
							<SalesCard
								invoiceCount={rapport.sales.invoice_count}
								totalTTC={rapport.sales.total_ttc}
								netTTC={rapport.sales.net_ttc}
								byMethod={rapport.sales.by_method}
								netByMethod={rapport.sales.net_by_method}
								byMethodLabels={rapport.sales.by_method_labels}
								byCustomerType={rapport.sales.by_customer_type}
								depositsCount={rapport.sales.deposits_count}
								depositsTTC={rapport.sales.deposits_ttc}
							/>
						</Section>

						<Separator />

						{/* TVA ventilée */}
						{rapport.sales.vat_by_rate &&
							Object.keys(rapport.sales.vat_by_rate).length > 0 && (
								<>
									<Section icon={Receipt} title='TVA collectée'>
										<VATBreakdownTable vatByRate={rapport.sales.vat_by_rate} />
									</Section>
									<Separator />
								</>
							)}

						{/* Remboursements */}
						{(rapport.refunds?.credit_notes_count ?? 0) > 0 && (
							<>
								<Section icon={Receipt} title='Remboursements'>
									<RefundsCard
										creditNotesCount={rapport.refunds?.credit_notes_count ?? 0}
										totalTTC={rapport.refunds?.total_ttc ?? 0}
										byMethod={rapport.refunds?.by_method}
										byMethodLabels={rapport.refunds?.by_method_labels}
									/>
								</Section>
								<Separator />
							</>
						)}

						{/* Mouvements de caisse avec journal */}
						<Section icon={Wallet} title='Mouvements de caisse'>
							<CashMovementsCard
								cashIn={rapport.movements.cash_in}
								cashOut={rapport.movements.cash_out}
								safeDrop={rapport.movements.safe_drop}
								total={rapport.movements.total}
								details={rapport.movements.details}
							/>
						</Section>

						<Separator />

						{/* Espèces attendues */}
						<Section title='Espèces attendues en caisse'>
							<ExpectedCashCard
								openingFloat={rapport.expected_cash.opening_float}
								movements={rapport.expected_cash.movements}
								total={rapport.expected_cash.total}
								salesCash={rapport.expected_cash.sales_cash}
								showSalesInfo={true}
							/>
						</Section>

						{/* Bloc e-reporting */}
						{rapport.sales.by_customer_type &&
							Object.keys(rapport.sales.by_customer_type).length > 0 && (
								<>
									<Separator />
									<EreportingBlock rapport={rapport} />
								</>
							)}

						{/* Note */}
						<p className='text-sm text-muted-foreground italic text-center pb-2'>
							{rapport.note}
						</p>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

// ─── Sous-composants internes ─────────────────────────────────────────────────

function Section({
	icon: Icon,
	title,
	children,
}: {
	icon?: React.ElementType
	title: string
	children: React.ReactNode
}) {
	return (
		<div>
			<h4 className='font-semibold mb-3 flex items-center gap-2 text-sm'>
				{Icon && <Icon className='h-4 w-4 text-muted-foreground' />}
				{title}
			</h4>
			{children}
		</div>
	)
}

function EreportingBlock({ rapport }: { rapport: RapportX }) {
	const { b2c, b2b } = aggregateEreporting(rapport.sales.by_customer_type ?? {})
	const hasB2C = b2c.count > 0
	const hasB2B = b2b.count > 0

	if (!hasB2C && !hasB2B) return null

	return (
		<div className='rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3'>
			<div className='flex items-center gap-2'>
				<FileText className='h-4 w-4 text-blue-600' />
				<p className='text-sm font-medium text-blue-900'>
					Données e-reporting (obligatoire sept. 2027)
				</p>
			</div>

			<div className='grid grid-cols-2 gap-3'>
				{hasB2C && (
					<div className='bg-white rounded-md p-3 border border-blue-100'>
						<div className='flex items-center gap-1.5 mb-2'>
							<Badge
								variant='outline'
								className='text-xs px-1.5 py-0 text-blue-700 border-blue-200'
							>
								B2C
							</Badge>
							<span className='text-xs text-muted-foreground'>
								Particuliers
							</span>
						</div>
						<p className='text-base font-semibold'>
							{formatCurrency(b2c.total_ttc)}
						</p>
						<p className='text-xs text-muted-foreground'>
							TVA : {formatCurrency(b2c.total_tva)} · {b2c.count} doc.
						</p>
					</div>
				)}
				{hasB2B && (
					<div className='bg-white rounded-md p-3 border border-blue-100'>
						<div className='flex items-center gap-1.5 mb-2'>
							<Badge
								variant='outline'
								className='text-xs px-1.5 py-0 text-violet-700 border-violet-200'
							>
								B2B
							</Badge>
							<span className='text-xs text-muted-foreground'>
								Professionnels
							</span>
						</div>
						<p className='text-base font-semibold'>
							{formatCurrency(b2b.total_ttc)}
						</p>
						<p className='text-xs text-muted-foreground'>
							TVA : {formatCurrency(b2b.total_tva)} · {b2b.count} doc.
						</p>
					</div>
				)}
			</div>

			<p className='text-xs text-blue-700'>
				Ces données alimenteront le ticket Z pour transmission à votre PDP.
			</p>
		</div>
	)
}
