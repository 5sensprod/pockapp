// frontend/modules/cash/components/terminal/payment/PaymentDialog.tsx
// ✅ NOUVELLE VERSION - Charge les moyens depuis l'API

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
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { usePaymentMethods } from '@/lib/queries/payment-methods'
import {
	ArrowRightLeft,
	Banknote,
	CreditCard,
	DollarSign,
	Gift,
	Loader2,
	Receipt,
	Ticket,
} from 'lucide-react'
import type { PaymentMethod } from '../types/payment'

interface PaymentDialogProps {
	totalTtc: number
	selectedPaymentMethod: PaymentMethod | null
	onSelectedPaymentMethodChange: (m: PaymentMethod) => void
	amountReceived: string
	onAmountReceivedChange: (v: string) => void
	change: number
	isProcessing: boolean
	onCancel: () => void
	onConfirm: () => void | Promise<void>
	onPreviewReceipt?: () => void | Promise<void>
}

// Mapping des icônes
const iconMap: Record<string, any> = {
	Banknote,
	CreditCard,
	Receipt,
	ArrowRightLeft,
	DollarSign,
	Gift,
	Ticket,
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
	const { activeCompanyId } = useActiveCompany()
	const { paymentMethods, isLoading } = usePaymentMethods(activeCompanyId)

	// Filtrer et trier les moyens actifs
	const enabledMethods =
		paymentMethods
			?.filter((m) => m.enabled)
			.sort((a, b) => a.display_order - b.display_order) || []

	// Auto-sélection du premier moyen si aucun n'est sélectionné
	const effectiveMethod = selectedPaymentMethod || enabledMethods[0] || null

	// Vérifier si le moyen actuel nécessite le montant reçu (espèces)
	const needsAmountReceived = effectiveMethod?.accounting_category === 'cash'

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
					{/* Boutons de sélection du moyen */}
					<div>
						{isLoading ? (
							<div className='flex items-center justify-center py-8'>
								<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
							</div>
						) : (
							<div className='grid grid-cols-3 gap-2 mt-2'>
								{enabledMethods.map((method) => {
									const IconComponent =
										iconMap[method.icon || 'Receipt'] || Receipt
									const isSelected = effectiveMethod?.id === method.id

									return (
										<Button
											key={method.id}
											type='button'
											variant={isSelected ? 'default' : 'outline'}
											className='h-20 flex-col gap-1'
											onClick={() => onSelectedPaymentMethodChange(method)}
											style={
												isSelected
													? {
															backgroundColor: method.color || undefined,
															borderColor: method.color || undefined,
															color: method.text_color || undefined,
														}
													: {
															borderColor: method.color || undefined,
														}
											}
										>
											<IconComponent className='h-5 w-5' />
											<span className='text-xs leading-tight text-center'>
												{method.name}
											</span>
										</Button>
									)
								})}
							</div>
						)}
					</div>

					{/* Input montant reçu (espèces uniquement) */}
					{needsAmountReceived && (
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

				<DialogFooter className='flex gap-2 sm:justify-between'>
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
							!effectiveMethod ||
							(needsAmountReceived &&
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
