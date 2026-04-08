// frontend/modules/cash/components/terminal/payment/PaymentDialog.tsx
// ✅ VERSION MULTIPAIEMENT - Montant libre par moyen de paiement

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
	Plus,
	Receipt,
	Ticket,
	Trash2,
} from 'lucide-react'
import * as React from 'react'
import type { PaymentEntry, PaymentMethod } from '../types/payment'

interface PaymentDialogProps {
	totalTtc: number
	// Multipaiement : liste des lignes déjà saisies
	paymentEntries: PaymentEntry[]
	onPaymentEntriesChange: (entries: PaymentEntry[]) => void
	// Rétrocompat : moyen sélectionné pour le 1er ajout depuis PaymentButtons
	initialMethod?: PaymentMethod | null
	isProcessing: boolean
	onCancel: () => void
	onConfirm: (entries: PaymentEntry[]) => void | Promise<void>
	onPreviewReceipt?: () => void | Promise<void>
}

// Mapping des icônes
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
	Banknote,
	CreditCard,
	Receipt,
	ArrowRightLeft,
	DollarSign,
	Gift,
	Ticket,
}

function round2(v: number) {
	return Math.round(v * 100) / 100
}

export function PaymentDialog({
	totalTtc,
	paymentEntries,
	onPaymentEntriesChange,
	initialMethod,
	isProcessing,
	onCancel,
	onConfirm,
	onPreviewReceipt,
}: PaymentDialogProps) {
	const { activeCompanyId } = useActiveCompany()
	const { paymentMethods, isLoading } = usePaymentMethods(activeCompanyId)

	// Méthode actuellement sélectionnée dans le sélecteur (pour ajouter une nouvelle ligne)
	const [pendingMethod, setPendingMethod] =
		React.useState<PaymentMethod | null>(initialMethod ?? null)
	// Montant pour la ligne en cours de saisie
	const [pendingAmount, setPendingAmount] = React.useState<string>('')

	const enabledMethods =
		paymentMethods
			?.filter((m) => m.enabled)
			.sort((a, b) => a.display_order - b.display_order) ?? []

	// Montant déjà couvert par les lignes validées
	const paidSoFar = round2(paymentEntries.reduce((sum, e) => sum + e.amount, 0))
	const remaining = round2(totalTtc - paidSoFar)

	// Quand on sélectionne un moyen, pré-remplir le montant restant
	const handleSelectMethod = (m: PaymentMethod) => {
		setPendingMethod(m)
		// Pré-remplir avec le restant si aucun montant saisi
		if (pendingAmount === '' || pendingAmount === '0') {
			setPendingAmount(remaining > 0 ? remaining.toFixed(2) : '')
		}
	}

	// Initialiser le montant quand initialMethod change (ouverture depuis PaymentButtons)
	React.useEffect(() => {
		if (initialMethod && paymentEntries.length === 0) {
			setPendingMethod(initialMethod)
			setPendingAmount(totalTtc.toFixed(2))
		}
	}, [initialMethod, totalTtc, paymentEntries.length])

	// Ajouter la ligne en cours à la liste
	const handleAddEntry = () => {
		if (!pendingMethod) return
		const amount = round2(Number.parseFloat(pendingAmount) || 0)
		if (amount <= 0) return

		onPaymentEntriesChange([
			...paymentEntries,
			{
				method: pendingMethod,
				amount,
			},
		])

		// Préparer la prochaine ligne : montant restant
		const newRemaining = round2(remaining - amount)
		setPendingAmount(newRemaining > 0 ? newRemaining.toFixed(2) : '')
		setPendingMethod(null)
	}

	// Supprimer une ligne validée
	const handleRemoveEntry = (index: number) => {
		onPaymentEntriesChange(paymentEntries.filter((_, i) => i !== index))
	}

	const pendingIsCash = pendingMethod?.accounting_category === 'cash'
	const pendingAmountNum = round2(Number.parseFloat(pendingAmount) || 0)

	// Monnaie à rendre = excédent total si au moins une ligne espèces impliquée
	const cashChange = React.useMemo(() => {
		const hasCash =
			pendingIsCash ||
			paymentEntries.some((e) => e.method.accounting_category === 'cash')
		if (!hasCash) return 0
		const totalPaidIfConfirmed = round2(
			paidSoFar +
				(pendingMethod && pendingAmountNum > 0 ? pendingAmountNum : 0),
		)
		return round2(Math.max(0, totalPaidIfConfirmed - totalTtc))
	}, [
		paymentEntries,
		pendingIsCash,
		pendingAmountNum,
		paidSoFar,
		totalTtc,
		pendingMethod,
	])

	// La commande est confirmable si le total couvert >= totalTtc
	// On permet aussi de confirmer avec la ligne "en cours" si elle couvre le reste
	const totalIfConfirmed = round2(
		paidSoFar + (pendingMethod && pendingAmountNum > 0 ? pendingAmountNum : 0),
	)
	const canConfirm =
		!isProcessing &&
		(paymentEntries.length > 0 || pendingMethod !== null) &&
		totalIfConfirmed >= totalTtc - 0.005

	// Auto-valider la ligne en cours si elle couvre exactement le reste et qu'on confirme
	const handleConfirm = async () => {
		const finalEntries: PaymentEntry[] =
			pendingMethod && pendingAmountNum > 0
				? [
						...paymentEntries,
						{ method: pendingMethod, amount: pendingAmountNum },
					]
				: [...paymentEntries]
		onPaymentEntriesChange(finalEntries)
		await onConfirm(finalEntries)
	}

	return (
		<Dialog open={true} onOpenChange={onCancel}>
			<DialogContent
				className='sm:max-w-lg'
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Paiement</DialogTitle>
					<DialogDescription>
						Total à encaisser :{' '}
						<span className='font-semibold text-foreground'>
							{totalTtc.toFixed(2)} €
						</span>
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-4'>
					{/* Lignes de paiement déjà ajoutées */}
					{paymentEntries.length > 0 && (
						<div className='space-y-1.5'>
							{paymentEntries.map((entry, i) => {
								const IconComponent =
									iconMap[entry.method.icon || 'Receipt'] || Receipt
								return (
									<div
										key={`entry-${i}-${entry.method.id}`}
										className='flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-2'
									>
										<div
											className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded'
											style={{
												backgroundColor: entry.method.color || '#f8fafc',
												color: entry.method.text_color || '#475569',
											}}
										>
											<IconComponent className='h-4 w-4' />
										</div>
										<span className='flex-1 text-sm font-medium'>
											{entry.method.name}
										</span>
										<span className='text-sm font-semibold tabular-nums'>
											{entry.amount.toFixed(2)} €
										</span>
										<Button
											type='button'
											variant='ghost'
											size='icon'
											className='h-7 w-7 text-muted-foreground hover:text-destructive'
											onClick={() => handleRemoveEntry(i)}
										>
											<Trash2 className='h-3.5 w-3.5' />
										</Button>
									</div>
								)
							})}

							{/* Résumé solde */}
							<div className='flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 text-sm'>
								<span className='text-muted-foreground'>
									{remaining > 0.005
										? 'Reste à payer'
										: remaining < -0.005
											? 'Monnaie à rendre'
											: 'Soldé ✓'}
								</span>
								<span
									className={`font-semibold tabular-nums ${
										remaining > 0.005
											? 'text-destructive'
											: remaining < -0.005
												? 'text-emerald-600'
												: 'text-emerald-600'
									}`}
								>
									{Math.abs(remaining).toFixed(2)} €
								</span>
							</div>
						</div>
					)}

					{/* Sélecteur de moyen pour la prochaine ligne */}
					{(remaining > 0.005 || paymentEntries.length === 0) && (
						<div className='space-y-3'>
							{isLoading ? (
								<div className='flex items-center justify-center py-6'>
									<Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
								</div>
							) : (
								<div className='grid grid-cols-3 gap-2'>
									{enabledMethods.map((method) => {
										const IconComponent =
											iconMap[method.icon || 'Receipt'] || Receipt
										const isSelected = pendingMethod?.id === method.id
										const isDefaultColor =
											!method.color ||
											method.color === '#f8fafc' ||
											method.color === '#ffffff'

										return (
											<button
												key={method.id}
												type='button'
												onClick={() => handleSelectMethod(method)}
												style={
													isSelected
														? {
																backgroundColor: isDefaultColor
																	? 'hsl(var(--primary))'
																	: method.color,
																borderColor: isDefaultColor
																	? 'hsl(var(--primary))'
																	: method.color,
																color: isDefaultColor
																	? 'hsl(var(--primary-foreground))'
																	: method.text_color ||
																		'hsl(var(--primary-foreground))',
																borderWidth: '2px',
																borderStyle: 'solid',
															}
														: {
																backgroundColor: 'transparent',
																borderColor: 'hsl(var(--border))',
																color: 'hsl(var(--foreground))',
																borderWidth: '1px',
																borderStyle: 'solid',
															}
												}
												className='h-16 w-full flex flex-col items-center justify-center gap-1 rounded-md text-sm font-medium transition-colors cursor-pointer'
											>
												<IconComponent className='h-4 w-4' />
												<span className='text-[11px] leading-tight text-center'>
													{method.name}
												</span>
											</button>
										)
									})}
								</div>
							)}

							{/* Input montant pour la ligne en cours */}
							{pendingMethod && (
								<div className='space-y-2'>
									<div className='flex gap-2'>
										<Input
											type='number'
											step='0.01'
											min='0.01'
											value={pendingAmount}
											onChange={(e) => setPendingAmount(e.target.value)}
											className='text-lg h-12 text-right flex-1'
											placeholder='Montant'
											onKeyDown={(e) => {
												if (e.key === 'Enter') {
													e.preventDefault()
													// Si c'est la seule ligne et couvre le total → confirmer direct
													if (
														paymentEntries.length === 0 &&
														round2(Number.parseFloat(pendingAmount) || 0) >=
															totalTtc - 0.005
													) {
														handleConfirm()
													} else {
														handleAddEntry()
													}
												}
											}}
										/>
										{/* Bouton "Ajouter" uniquement si d'autres lignes existent déjà ou si le montant ne couvre pas tout */}
										{(paymentEntries.length > 0 ||
											(pendingAmountNum > 0 &&
												pendingAmountNum < totalTtc - 0.005)) && (
											<Button
												type='button'
												variant='outline'
												className='h-12 px-3'
												onClick={handleAddEntry}
												disabled={pendingAmountNum <= 0}
											>
												<Plus className='h-4 w-4 mr-1' />
												Ajouter
											</Button>
										)}
									</div>

									{/* Monnaie à rendre si espèces */}
									{pendingIsCash && cashChange > 0 && (
										<div className='flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2'>
											<span className='text-sm text-muted-foreground'>
												Monnaie à rendre
											</span>
											<span className='text-xl font-bold text-primary tabular-nums'>
												{cashChange.toFixed(2)} €
											</span>
										</div>
									)}
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

					<Button onClick={handleConfirm} disabled={!canConfirm}>
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
