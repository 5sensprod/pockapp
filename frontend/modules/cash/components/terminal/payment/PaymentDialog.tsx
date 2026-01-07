// frontend/modules/cash/components/terminal/payment/PaymentDialog.tsx
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
	Banknote,
	CreditCard,
	DollarSign,
	Loader2,
	Receipt,
} from 'lucide-react'
import type { PaymentMethod } from '../types/payment'

interface PaymentDialogProps {
	totalTtc: number
	selectedPaymentMethod: PaymentMethod
	onSelectedPaymentMethodChange: (m: PaymentMethod) => void
	amountReceived: string
	onAmountReceivedChange: (v: string) => void
	change: number
	isProcessing: boolean
	onCancel: () => void
	onConfirm: () => void | Promise<void>

	// ✅ AJOUT
	onPreviewReceipt?: () => void | Promise<void>
}

export function PaymentDialog({
	totalTtc,
	selectedPaymentMethod,
	onSelectedPaymentMethodChange,
	amountReceived,
	onAmountReceivedChange,
	change,
	isProcessing,
	onCancel,
	onConfirm,
	onPreviewReceipt,
}: PaymentDialogProps) {
	return (
		<Dialog open={true} onOpenChange={onCancel}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Paiement</DialogTitle>
					<DialogDescription>
						Montant à encaisser : {totalTtc.toFixed(2)} €
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-4'>
					<div>
						<div className='grid grid-cols-3 gap-2 mt-2'>
							<Button
								type='button'
								variant={
									selectedPaymentMethod === 'especes' ? 'default' : 'outline'
								}
								className='h-20'
								onClick={() => onSelectedPaymentMethodChange('especes')}
							>
								<div className='flex flex-col items-center gap-1'>
									<Banknote className='h-5 w-5' />
									<span className='text-xs'>Espèces</span>
								</div>
							</Button>
							<Button
								type='button'
								variant={selectedPaymentMethod === 'cb' ? 'default' : 'outline'}
								className='h-20'
								onClick={() => onSelectedPaymentMethodChange('cb')}
							>
								<div className='flex flex-col items-center gap-1'>
									<CreditCard className='h-5 w-5' />
									<span className='text-xs'>CB</span>
								</div>
							</Button>
							<Button
								type='button'
								variant={
									selectedPaymentMethod === 'virement' ? 'default' : 'outline'
								}
								className='h-20'
								onClick={() => onSelectedPaymentMethodChange('virement')}
							>
								<div className='flex flex-col items-center gap-1'>
									<DollarSign className='h-5 w-5' />
									<span className='text-xs'>Virement</span>
								</div>
							</Button>
						</div>
					</div>

					{selectedPaymentMethod === 'especes' && (
						<div>
							<Input
								type='number'
								step='0.01'
								value={amountReceived}
								onChange={(e) => onAmountReceivedChange(e.target.value)}
								className='text-xl h-14 text-right'
								placeholder='Montant reçu'
								autoFocus
							/>

							{change >= 0 && amountReceived !== '' && (
								<div className='mt-3 p-3 bg-slate-100 rounded-lg'>
									<p className='text-sm text-muted-foreground'>
										Monnaie à rendre
									</p>
									<p className='text-2xl font-bold text-primary'>
										{change.toFixed(2)} €
									</p>
								</div>
							)}
						</div>
					)}
				</div>

				<DialogFooter className='flex gap-2 sm:gap-2 sm:justify-between'>
					<div className='flex gap-2'>
						<Button
							variant='outline'
							onClick={onCancel}
							disabled={isProcessing}
						>
							Annuler
						</Button>

						{onPreviewReceipt && (
							<Button
								type='button'
								variant='outline'
								onClick={onPreviewReceipt}
								disabled={isProcessing}
							>
								Aperçu
							</Button>
						)}
					</div>

					<Button
						onClick={onConfirm}
						disabled={
							isProcessing ||
							(selectedPaymentMethod === 'especes' &&
								(Number.parseFloat(amountReceived) || 0) < totalTtc)
						}
					>
						{isProcessing ? (
							<>
								<Loader2 className='h-4 w-4 mr-2 animate-spin' />
								Traitement...
							</>
						) : (
							<>
								<Receipt className='h-4 w-4 mr-2' />
								Confirmer
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
