// frontend/modules/cash/components/infos/PaymentMethodsCard.tsx
import { ModuleCard, StatusBadge } from '@/components/module-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { usePaymentMethods } from '@/lib/queries/payment-methods'
import {
	ArrowRightLeft,
	Banknote,
	CreditCard,
	Receipt,
	Settings,
} from 'lucide-react'
import * as React from 'react'
import { PaymentMethodsManager } from '../payment-methods/PaymentMethodsManager'

export function PaymentMethodsCard() {
	const { activeCompanyId } = useActiveCompany()
	const { paymentMethods, isLoading } = usePaymentMethods(activeCompanyId)
	const [showManager, setShowManager] = React.useState(false)

	const iconMap: Record<string, React.ComponentType<any>> = {
		CreditCard,
		Banknote,
		Receipt,
		ArrowRightLeft,
	}

	return (
		<>
			<ModuleCard
				icon={CreditCard}
				title='Moyens de paiement'
				className='md:col-span-2 xl:col-span-1'
			>
				<div className='space-y-3 text-sm'>
					{isLoading ? (
						<div className='text-sm text-muted-foreground'>Chargement...</div>
					) : (
						<>
							{paymentMethods?.map((method) => {
								const IconComponent = iconMap[method.icon] || Receipt

								return (
									<div
										key={method.id}
										className='flex items-center justify-between rounded-md border border-border/40 px-3 py-2 bg-muted/20'
									>
										<div className='flex items-center gap-2'>
											<div
												className='flex h-7 w-7 items-center justify-center rounded-md shrink-0'
												style={{
													backgroundColor: method.color,
													color: method.text_color,
												}}
											>
												<IconComponent className='h-3.5 w-3.5' />
											</div>
											<div>
												<div className='flex items-center gap-2'>
													<span className='text-sm font-medium'>
														{method.name}
													</span>
													{method.type === 'custom' && (
														<Badge
															variant='outline'
															className='text-[10px] bg-primary/5 text-primary border-0'
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
										<StatusBadge
											label={method.enabled ? 'Activé' : 'Désactivé'}
											variant={method.enabled ? 'open' : 'closed'}
										/>
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
								className='w-full justify-start gap-2 text-xs text-muted-foreground'
								onClick={() => setShowManager(true)}
							>
								<Settings className='h-3.5 w-3.5' />
								Configurer les moyens de paiement
							</Button>
						</>
					)}
				</div>
			</ModuleCard>

			<PaymentMethodsManager open={showManager} onOpenChange={setShowManager} />
		</>
	)
}
