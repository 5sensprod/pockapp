// frontend/modules/cash/components/navigation/CashShortcutsCard.tsx
import { Link } from '@tanstack/react-router'
import { Receipt, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'

/**
 * Carte affichant les raccourcis vers les différentes fonctionnalités de caisse
 * Les liens sont définis statiquement mais peuvent être configurés dynamiquement
 */
export function CashShortcutsCard() {
	const shortcuts = [
		{
			to: '/cash/terminal',
			icon: Receipt,
			label: 'Ouvrir l\'interface de caisse',
		},
		{
			to: '/cash/tickets',
			icon: Receipt,
			label: 'Derniers tickets',
		},
		{
			to: '/cash/products',
			icon: Store,
			label: 'Catalogue produits',
		},
		{
			to: '/cash/rapport-z',
			icon: Receipt,
			label: 'Rapport Z (Clôture journalière)',
		},
	]

	return (
		<Card className='border-slate-200 lg:col-span-2'>
			<CardHeader className='pb-3'>
				<CardTitle className='text-sm'>Raccourcis caisse</CardTitle>
				<CardDescription>
					Actions fréquentes liées aux ventes et tickets.
				</CardDescription>
			</CardHeader>
			<CardContent className='grid gap-2 text-sm md:grid-cols-3'>
				{shortcuts.map((shortcut) => {
					const Icon = shortcut.icon
					return (
						<Button
							key={shortcut.to}
							asChild
							variant='outline'
							size='sm'
							className='flex w-full items-center justify-between'
						>
							<Link to={shortcut.to}>
								<span className='flex items-center gap-2'>
									<Icon className='h-4 w-4' />
									{shortcut.label}
								</span>
							</Link>
						</Button>
					)
				})}
			</CardContent>
		</Card>
	)
}
