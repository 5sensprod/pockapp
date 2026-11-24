// frontend/components/layout/QuickActions.tsx
// Raccourcis de la barre du haut : la caisse en un clic, et un menu « Créer »
// pour les documents et fiches qu'on ouvre le plus. Chaque entrée porte la
// couleur de SON module (icône) ; le bouton lui-même suit le thème
// (`bg-primary`), donc il change avec Indigo / Bleu nuit / Vert sapin.

import { Link } from '@tanstack/react-router'
import {
	ClipboardList,
	FilePen,
	Package,
	Plus,
	Receipt,
	ShoppingCart,
	UserPlus,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Couleurs de module = celles des manifestes (`modules/*/manifest.ts`) :
// PocketConnect et PocketCash en bleu, PocketStock en orange.
const BLEU = 'text-blue-600'
const ORANGE = 'text-orange-600'

type Raccourci = {
	label: string
	to: string
	icon: typeof Plus
	couleur: string
	module: string
}

const CREER: Raccourci[] = [
	{
		label: 'Bon de commande',
		to: '/connect/orders/new',
		icon: ClipboardList,
		couleur: BLEU,
		module: 'PocketConnect',
	},
	{
		label: 'Facture',
		to: '/connect/invoices/new',
		icon: Receipt,
		couleur: BLEU,
		module: 'PocketConnect',
	},
	{
		label: 'Devis',
		to: '/connect/quotes/new',
		icon: FilePen,
		couleur: BLEU,
		module: 'PocketConnect',
	},
	{
		label: 'Client',
		to: '/connect/customers/new',
		icon: UserPlus,
		couleur: BLEU,
		module: 'PocketConnect',
	},
	{
		label: 'Produit',
		to: '/stock/produits/nouveau',
		icon: Package,
		couleur: ORANGE,
		module: 'PocketStock',
	},
]

export function QuickActions() {
	return (
		<div className='hidden items-center gap-2 tablet:flex'>
			<Button
				asChild
				size='sm'
				className='h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90'
			>
				<Link to='/cash/terminal' title='Ouvrir la caisse'>
					<ShoppingCart className='h-4 w-4' />
					<span className='hidden desktop:inline'>Caisse</span>
				</Link>
			</Button>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant='outline'
						size='sm'
						className='h-9 gap-1.5 border-border bg-card text-foreground hover:bg-accent'
						title='Créer un document ou une fiche'
					>
						<Plus className='h-4 w-4' />
						<span className='hidden desktop:inline'>Créer</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align='start' className='w-60'>
					<DropdownMenuLabel>Créer</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{CREER.map(({ label, to, icon: Icon, couleur, module }) => (
						<DropdownMenuItem key={to} asChild className='cursor-pointer'>
							<Link to={to}>
								<Icon className={`mr-2 h-4 w-4 ${couleur}`} />
								<span className='flex-1'>{label}</span>
								<span className='text-[10px] text-muted-foreground'>
									{module}
								</span>
							</Link>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
