// frontend/modules/cash/components/navigation/CashShortcutsCard.tsx

import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { useNavigate } from '@tanstack/react-router'
import {
	AlertCircle,
	BookOpen,
	FileText,
	Receipt,
	TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'

interface CashShortcutsCardProps {
	// État de la session
	isSessionOpen: boolean
	selectedRegisterId?: string

	// Optionnel : nom de la caisse pour les messages
	selectedRegisterName?: string
}

/**
 * Carte des raccourcis de caisse
 * Affiche les liens rapides vers les différentes fonctionnalités
 */
export function CashShortcutsCard({
	isSessionOpen,
	selectedRegisterId,
}: CashShortcutsCardProps) {
	const navigate = useNavigate()

	const handleTerminalClick = () => {
		if (!isSessionOpen) {
			toast.error('Aucune session ouverte', {
				description:
					"Veuillez ouvrir une session de caisse avant d'accéder au terminal.",
			})
			return
		}

		if (!selectedRegisterId) {
			toast.error('Aucune caisse sélectionnée', {
				description: 'Veuillez sélectionner une caisse.',
			})
			return
		}

		navigate({
			to: '/cash/terminal/$cashRegisterId',
			params: { cashRegisterId: selectedRegisterId },
		})
	}

	const shortcuts = [
		{
			onClick: handleTerminalClick,
			icon: Receipt,
			label: "Ouvrir l'interface de caisse",
			description: 'Terminal de point de vente',
			disabled: !isSessionOpen || !selectedRegisterId,
			requiresSession: true,
		},
		{
			to: '/cash/tickets',
			icon: FileText,
			label: 'Gérer les tickets',
			description: 'Consulter et convertir les tickets',
			disabled: false,
			requiresSession: false,
		},
		{
			to: '/cash/reports/z',
			icon: TrendingUp,
			label: 'Rapports Z',
			description: 'Clôture journalière',
			disabled: false,
			requiresSession: false,
		},
		{
			to: '/cash/help',
			icon: BookOpen,
			label: 'Documentation',
			description: "Guide d'utilisation",
			disabled: false,
			requiresSession: false,
		},
	]

	return (
		<Card className='lg:col-span-2'>
			<CardHeader className='pb-3'>
				<CardTitle className='text-sm'>Raccourcis</CardTitle>
				<CardDescription>
					Accès rapides aux fonctionnalités principales
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className='grid gap-3 sm:grid-cols-2'>
					{shortcuts.map((shortcut) => {
						const Icon = shortcut.icon
						const isDisabled = shortcut.disabled

						return (
							<Button
								key={shortcut.label}
								variant='outline'
								className={`h-auto justify-start gap-3 p-4 ${
									isDisabled ? 'opacity-50 cursor-not-allowed' : ''
								}`}
								onClick={
									shortcut.onClick
										? shortcut.onClick
										: () => {
												if (shortcut.to) {
													navigate({ to: shortcut.to as any })
												}
											}
								}
								disabled={isDisabled}
							>
								<div
									className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
										isDisabled ? 'bg-slate-100' : 'bg-slate-900'
									}`}
								>
									<Icon
										className={`h-5 w-5 ${
											isDisabled ? 'text-slate-400' : 'text-white'
										}`}
									/>
								</div>
								<div className='flex flex-col items-start gap-0.5 text-left'>
									<span className='text-sm font-medium'>{shortcut.label}</span>
									<span className='text-xs text-muted-foreground'>
										{shortcut.description}
									</span>
									{isDisabled && shortcut.requiresSession && (
										<div className='mt-1 flex items-center gap-1 text-xs text-amber-600'>
											<AlertCircle className='h-3 w-3' />
											<span>Session requise</span>
										</div>
									)}
								</div>
							</Button>
						)
					})}
				</div>
			</CardContent>
		</Card>
	)
}
