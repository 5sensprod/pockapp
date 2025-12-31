// frontend/modules/cash/components/infos/PaymentMethodsCard.tsx
import { Banknote, CreditCard, Receipt, Settings } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'

/**
 * Carte affichant les moyens de paiement disponibles
 * ⚠️ MOCK : Toutes les données sont actuellement en dur
 * TODO: Connecter au backend pour récupérer les moyens de paiement configurés
 * TODO: Permettre l'activation/désactivation des moyens de paiement
 */
export function PaymentMethodsCard() {
	// TODO: Récupérer depuis le backend
	const paymentMethods = [
		{
			id: 'card',
			name: 'Carte bancaire',
			description: 'Terminal CB connecté',
			icon: CreditCard,
			enabled: true,
			color: 'bg-slate-900',
			textColor: 'text-white',
		},
		{
			id: 'cash',
			name: 'Espèces',
			description: 'Rendue monnaie calculée automatiquement',
			icon: Banknote,
			enabled: true,
			color: 'bg-slate-100',
			textColor: 'text-slate-700',
		},
		{
			id: 'other',
			name: 'Autres',
			description: 'Chèques, avoirs, etc.',
			icon: Receipt,
			enabled: false, // Partiel
			color: 'bg-slate-100',
			textColor: 'text-slate-700',
			partialEnabled: true,
		},
	]

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
				{paymentMethods.map((method) => {
					const Icon = method.icon
					return (
						<div
							key={method.id}
							className={`flex items-center justify-between rounded-md border px-3 py-2 ${
								method.enabled && !method.partialEnabled ? 'bg-slate-50' : ''
							}`}
						>
							<div className='flex items-center gap-2'>
								<div
									className={`flex h-7 w-7 items-center justify-center rounded-md ${method.color} ${method.textColor}`}
								>
									<Icon className='h-3.5 w-3.5' />
								</div>
								<div>
									<div className='text-sm font-medium'>{method.name}</div>
									<div className='text-xs text-muted-foreground'>
										{method.description}
									</div>
								</div>
							</div>
							<Badge
								variant='outline'
								className={`border-0 text-[11px] ${
									method.enabled && !method.partialEnabled
										? 'bg-emerald-50 text-emerald-700'
										: 'bg-slate-50'
								}`}
							>
								{method.partialEnabled ? 'Partiel' : method.enabled ? 'Activé' : 'Désactivé'}
							</Badge>
						</div>
					)
				})}

				<Button
					variant='ghost'
					size='sm'
					className='mt-1 w-full justify-start gap-2 text-xs text-muted-foreground'
				>
					<Settings className='h-3.5 w-3.5' />
					Configurer les moyens de paiement
				</Button>
			</CardContent>
		</Card>
	)
}
