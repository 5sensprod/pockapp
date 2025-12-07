import { Link } from '@tanstack/react-router'
import {
	Banknote,
	CalendarDays,
	Clock3,
	CreditCard,
	Receipt,
	Settings,
	Store,
} from 'lucide-react'
// frontend/modules/cash/CashPage.tsx
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { manifest } from './index'

export function CashPage() {
	const Icon = manifest.icon

	const [isSessionOpen, setIsSessionOpen] = React.useState(true)
	const [selectedStore] = React.useState('Axe Musique — Centre-ville')

	const today = new Date().toLocaleDateString('fr-FR', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
	})

	const handleToggleSession = () => {
		// TODO: appel API / Go pour ouvrir / fermer la session
		setIsSessionOpen((prev) => !prev)
	}

	return (
		<div className='container mx-auto flex flex-col gap-6 px-6 py-8'>
			{/* Header module */}
			<header className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
				<div className='flex items-center gap-3'>
					<div className='flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white'>
						<Icon className='h-5 w-5' />
					</div>
					<div>
						<h1 className='text-2xl font-semibold tracking-tight'>
							{manifest.name}
						</h1>
						<p className='text-sm text-muted-foreground'>
							Configuration de la caisse, des sessions et du point de vente.
						</p>
					</div>
				</div>

				<div className='flex flex-wrap items-center gap-3 text-xs'>
					<div className='flex items-center gap-2 rounded-full bg-emerald-500/5 px-3 py-1'>
						<span
							className={`h-2 w-2 rounded-full ${
								isSessionOpen ? 'bg-emerald-500' : 'bg-slate-400'
							}`}
						/>
						<span
							className={`font-medium ${
								isSessionOpen ? 'text-emerald-700' : 'text-slate-600'
							}`}
						>
							{isSessionOpen ? 'Session en cours' : 'Aucune session ouverte'}
						</span>
					</div>

					<div className='flex items-center gap-2 text-muted-foreground'>
						<CalendarDays className='h-3.5 w-3.5' />
						<span className='font-medium'>{today}</span>
					</div>
				</div>
			</header>

			{/* Ligne de cartes principales */}
			<section className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
				{/* Session de caisse */}
				<Card className='border-slate-200'>
					<CardHeader className='pb-3'>
						<CardTitle className='flex items-center gap-2 text-sm'>
							<Clock3 className='h-4 w-4 text-slate-500' />
							Session de caisse
						</CardTitle>
						<CardDescription>
							Gérez l&apos;ouverture, la fermeture et le fond de caisse.
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-4 text-sm'>
						<div className='flex items-center justify-between'>
							<div className='space-y-1'>
								<div className='text-xs text-muted-foreground'>
									Caisse active
								</div>
								<div className='font-medium text-slate-900'>
									Caisse principale
								</div>
								<div className='text-xs text-muted-foreground'>
									{isSessionOpen
										? 'Ouverte à 09:02 • fond 150,00 €'
										: 'Aucune session ouverte'}
								</div>
							</div>
							<Badge
								variant='outline'
								className='border-0 bg-slate-100 text-[11px]'
							>
								{selectedStore}
							</Badge>
						</div>

						<Separator />

						<div className='flex items-center justify-between text-xs text-muted-foreground'>
							<span>Fond de caisse (espèces)</span>
							<span className='font-medium text-slate-900'>150,00 €</span>
						</div>
						<div className='flex items-center justify-between text-xs text-muted-foreground'>
							<span>Espèces théoriques en caisse</span>
							<span className='font-medium text-slate-900'>482,30 €</span>
						</div>

						<Button
							variant={isSessionOpen ? 'outline' : 'default'}
							size='sm'
							className='mt-2 w-full'
							onClick={handleToggleSession}
						>
							{isSessionOpen ? 'Clôturer la session' : 'Ouvrir une session'}
						</Button>
					</CardContent>
				</Card>

				{/* Point de vente */}
				<Card className='border-slate-200'>
					<CardHeader className='pb-3'>
						<CardTitle className='flex items-center gap-2 text-sm'>
							<Store className='h-4 w-4 text-slate-500' />
							Point de vente
						</CardTitle>
						<CardDescription>
							Sélectionnez le magasin et paramétrez ses options.
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-4 text-sm'>
						<div className='space-y-1'>
							<div className='text-xs text-muted-foreground'>
								Magasin sélectionné
							</div>
							<div className='font-medium text-slate-900'>{selectedStore}</div>
							<div className='text-xs text-muted-foreground'>
								ID interne : POS-001 • multi-caisses activé
							</div>
						</div>

						<Separator />

						<div className='grid grid-cols-2 gap-2 text-xs text-muted-foreground'>
							<div>
								<div className='font-medium text-slate-900'>Profil fiscal</div>
								<div>France • TVA 20 %</div>
							</div>
							<div>
								<div className='font-medium text-slate-900'>
									Ticket par défaut
								</div>
								<div>Format simplifié</div>
							</div>
						</div>

						<div className='flex gap-2 pt-1'>
							<Button variant='outline' size='sm' className='flex-1'>
								Gérer les magasins
							</Button>
							<Button variant='outline' size='sm' className='flex-1'>
								Paramètres POS
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Moyens de paiement */}
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
						<div className='flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2'>
							<div className='flex items-center gap-2'>
								<div className='flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white'>
									<CreditCard className='h-3.5 w-3.5' />
								</div>
								<div>
									<div className='text-sm font-medium'>Carte bancaire</div>
									<div className='text-xs text-muted-foreground'>
										Terminal CB connecté
									</div>
								</div>
							</div>
							<Badge
								variant='outline'
								className='border-0 bg-emerald-50 text-[11px] text-emerald-700'
							>
								Activé
							</Badge>
						</div>

						<div className='flex items-center justify-between rounded-md border px-3 py-2'>
							<div className='flex items-center gap-2'>
								<div className='flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700'>
									<Banknote className='h-3.5 w-3.5' />
								</div>
								<div>
									<div className='text-sm font-medium'>Espèces</div>
									<div className='text-xs text-muted-foreground'>
										Rendue monnaie calculée automatiquement
									</div>
								</div>
							</div>
							<Badge
								variant='outline'
								className='border-0 bg-slate-50 text-[11px]'
							>
								Activé
							</Badge>
						</div>

						<div className='flex items-center justify-between rounded-md border px-3 py-2'>
							<div className='flex items-center gap-2'>
								<div className='flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700'>
									<Receipt className='h-3.5 w-3.5' />
								</div>
								<div>
									<div className='text-sm font-medium'>Autres</div>
									<div className='text-xs text-muted-foreground'>
										Chèques, avoirs, etc.
									</div>
								</div>
							</div>
							<Badge
								variant='outline'
								className='border-0 bg-slate-50 text-[11px]'
							>
								Partiel
							</Badge>
						</div>

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
			</section>

			{/* Raccourcis caisse */}
			<section className='grid gap-4 lg:grid-cols-3'>
				<Card className='border-slate-200 lg:col-span-2'>
					<CardHeader className='pb-3'>
						<CardTitle className='text-sm'>Raccourcis caisse</CardTitle>
						<CardDescription>
							Actions fréquentes liées aux ventes et tickets.
						</CardDescription>
					</CardHeader>
					<CardContent className='grid gap-2 text-sm md:grid-cols-3'>
						{/* Interface de caisse */}
						<Button
							asChild
							variant='outline'
							size='sm'
							className='flex w-full items-center justify-between'
						>
							<Link to='/cash/terminal'>
								<span className='flex items-center gap-2'>
									<Receipt className='h-4 w-4' />
									Ouvrir l&apos;interface de caisse
								</span>
							</Link>
						</Button>

						{/* Tickets */}
						<Button
							asChild
							variant='outline'
							size='sm'
							className='flex w-full items-center justify-between'
						>
							<Link to='/cash/tickets'>
								<span className='flex items-center gap-2'>
									<Receipt className='h-4 w-4' />
									Derniers tickets
								</span>
							</Link>
						</Button>

						{/* Catalogue produits */}
						<Button
							asChild
							variant='outline'
							size='sm'
							className='flex w-full items-center justify-between'
						>
							<Link to='/cash/products'>
								<span className='flex items-center gap-2'>
									<Store className='h-4 w-4' />
									Catalogue produits
								</span>
							</Link>
						</Button>
					</CardContent>
				</Card>

				{/* Journal rapide */}
				<Card className='border-slate-200'>
					<CardHeader className='pb-3'>
						<CardTitle className='text-sm'>Journal rapide</CardTitle>
						<CardDescription>
							Dernières actions liées à la caisse.
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-2 text-xs text-muted-foreground'>
						<div>
							<span className='font-medium text-slate-900'>09:02</span> —
							Session ouverte par <span>Alexis</span>.
						</div>
						<div>
							<span className='font-medium text-slate-900'>08:59</span> — Fond
							de caisse déclaré : 150,00 €.
						</div>
						<div>
							<span className='font-medium text-slate-900'>Hier</span> — Session
							clôturée avec écart de 0,20 €.
						</div>
					</CardContent>
				</Card>
			</section>
		</div>
	)
}
