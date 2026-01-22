import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { usePaymentMethods } from '@/lib/queries/payment-methods'
import {
	ArrowRightLeft,
	Banknote,
	CreditCard,
	Receipt,
	Settings,
} from 'lucide-react'
// frontend/modules/cash/components/infos/PaymentMethodsCard.tsx
import * as React from 'react'
import { PaymentMethodsManager } from '../payment-methods/PaymentMethodsManager'

/**
 * Carte affichant les moyens de paiement disponibles
 */
export function PaymentMethodsCard() {
	const { activeCompanyId } = useActiveCompany()
	const { paymentMethods, isLoading } = usePaymentMethods(activeCompanyId)
	const [showManager, setShowManager] = React.useState(false)

	// Mapping des icônes
	const iconMap: Record<string, React.ComponentType<any>> = {
		CreditCard,
		Banknote,
		Receipt,
		ArrowRightLeft,
	}

	if (isLoading) {
		return (
			<Card className='border-slate-200 md:col-span-2 xl:col-span-1'>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-sm'>
						<CreditCard className='h-4 w-4 text-slate-500' />
						Moyens de paiement
					</CardTitle>
					<CardDescription>
						Activez les types d&apos;encaissement disponibles en caisse.
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-3 text-sm'>
					<div className='text-sm text-muted-foreground'>Chargement...</div>
				</CardContent>
			</Card>
		)
	}

	return (
		<>
			<Card className='border-slate-200 md:col-span-2 xl:col-span-1'>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-sm'>
						<CreditCard className='h-4 w-4 text-slate-500' />
						Moyens de paiement
					</CardTitle>
					<CardDescription>
						Activez les types d&apos;encaissement disponibles en caisse.
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-3 text-sm'>
					{paymentMethods?.map((method) => {
						const IconComponent = iconMap[method.icon] || Receipt

						return (
							<div
								key={method.id}
								className={`flex items-center justify-between rounded-md border px-3 py-2 ${
									method.enabled ? 'bg-slate-50' : ''
								}`}
							>
								<div className='flex items-center gap-2'>
									<div
										className={`flex h-7 w-7 items-center justify-center rounded-md`}
										style={{
											backgroundColor: method.color,
											color: method.text_color,
										}}
									>
										<IconComponent className='h-3.5 w-3.5' />
									</div>
									<div>
										<div className='flex items-center gap-2'>
											<span className='text-sm font-medium'>{method.name}</span>
											{method.type === 'custom' && (
												<Badge
													variant='outline'
													className='text-[10px] bg-blue-50 text-blue-700 border-0'
												>
													Custom
												</Badge>
											)}
										</div>
										{method.description && (
											<div className='text-xs text-muted-foreground'>
												{method.description}
											</div>
										)}
									</div>
								</div>
								<Badge
									variant='outline'
									className={`border-0 text-[11px] ${
										method.enabled
											? 'bg-emerald-50 text-emerald-700'
											: 'bg-slate-50 text-slate-500'
									}`}
								>
									{method.enabled ? 'Activé' : 'Désactivé'}
								</Badge>
							</div>
						)
					})}

					{paymentMethods && paymentMethods.length === 0 && (
						<div className='text-sm text-muted-foreground text-center py-4'>
							Aucun moyen de paiement configuré
						</div>
					)}

					<Button
						variant='ghost'
						size='sm'
						className='mt-1 w-full justify-start gap-2 text-xs text-muted-foreground'
						onClick={() => setShowManager(true)}
					>
						<Settings className='h-3.5 w-3.5' />
						Configurer les moyens de paiement
					</Button>
				</CardContent>
			</Card>

			{/* Dialog de gestion */}
			<PaymentMethodsManager open={showManager} onOpenChange={setShowManager} />
		</>
	)
}
