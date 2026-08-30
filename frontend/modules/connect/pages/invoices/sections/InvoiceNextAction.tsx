// frontend/modules/connect/pages/invoices/sections/InvoiceNextAction.tsx
//
// « Que dois-je faire maintenant ? » — la réponse, en un bouton.
//
// La résolution vient de `resolveNextAction` : ce composant ne décide de rien,
// il associe un identifiant d'action à un geste. C'est ce qui permet de tester
// les treize états sans DOM.
//
// Trois règles tenues ici, et visibles :
//
//  - un seul rang primaire, et il ne va jamais à « PDF » ;
//  - une action indisponible n'est pas escamotée : elle est grisée avec sa
//    cause et sa levée, ou remplacée par un message ;
//  - quand il n'y a rien à faire, on le DIT.
//
// L'encaissement est gouverné ici, et nulle part ailleurs : la synthèse ne
// porte aucune action (§16-3 et §16-4).

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type {
	InvoiceActionId,
	NextActionResolution,
	ResolvedAction,
} from '@/lib/invoices/next-action'
import { MoreHorizontal } from 'lucide-react'

interface Props {
	resolution: NextActionResolution
	/** Un geste par identifiant. Une action sans geste est ignorée. */
	onAction: (id: InvoiceActionId) => void
	enCours?: boolean
}

function titreIndisponible(action: ResolvedAction) {
	return action.disabledReason ?? undefined
}

export function InvoiceNextAction({ resolution, onAction, enCours }: Props) {
	const { primary, absenceReason, secondary, menu } = resolution

	return (
		<Card>
			<CardContent className='p-4 flex flex-wrap items-center gap-2'>
				{primary ? (
					<Button
						size='sm'
						disabled={primary.disabled || enCours}
						title={titreIndisponible(primary)}
						onClick={() => onAction(primary.id)}
					>
						{primary.label}
					</Button>
				) : (
					// Jamais d'écran muet : s'il n'y a rien à faire, la raison
					// prend la place du bouton.
					<p className='text-sm text-muted-foreground'>{absenceReason}</p>
				)}

				{secondary.map((a) => (
					<Button
						key={a.id}
						size='sm'
						variant='outline'
						disabled={a.disabled}
						title={titreIndisponible(a)}
						onClick={() => onAction(a.id)}
					>
						{a.label}
					</Button>
				))}

				{menu.length > 0 && (
					<div className='ml-auto'>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant='ghost' size='icon' aria-label='Autres actions'>
									<MoreHorizontal className='h-4 w-4' />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align='end' className='w-72'>
								{menu.map((a) => (
									<DropdownMenuItem
										key={a.id}
										disabled={a.disabled}
										className={a.destructive ? 'text-red-600' : undefined}
										onClick={() => !a.disabled && onAction(a.id)}
									>
										<div className='flex flex-col gap-0.5'>
											<span>{a.label}</span>
											{/* La cause ET la levée, à la place de l'action —
											    plutôt qu'une entrée qui disparaît sans un mot. */}
											{a.disabledReason && (
												<span className='text-xs text-muted-foreground whitespace-normal'>
													{a.disabledReason}
												</span>
											)}
										</div>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
