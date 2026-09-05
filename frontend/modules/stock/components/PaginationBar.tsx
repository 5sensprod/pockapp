// frontend/modules/stock/components/PaginationBar.tsx
//
// La pagination du catalogue, sous la table (5 septembre 2026).
//
// Elle vivait dans la barre de commande, en haut : deux flèches et un « Page 7
// / 120 ». Elle y était parce que le bas de la table n'était nulle part — la
// page défilait, et le pied de tableau se trouvait à 3000 pixels sous l'œil.
// Le cadre à hauteur fixe lui rend une place naturelle : juste sous la
// dernière ligne, toujours visible.
//
// Les NUMÉROS sont ce qui change vraiment. Deux flèches ne disent pas où l'on
// est dans 120 pages et ne permettent pas d'y sauter. Les 120 boutons non
// plus : ils ne tiennent pas, et personne ne vise la page 73 dans une rangée
// de 120. D'où une fenêtre — les bornes, les voisines, la courante — qui garde
// la rangée d'une largeur constante quelle que soit la position.

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Ce que la rangée affiche : des numéros de page, et des trous. */
export type EntreePagination = number | 'trou-gauche' | 'trou-droite'

/**
 * La fenêtre de numéros autour de la page courante.
 *
 * Invariants, et ils sont la raison d'être de la fonction :
 *   • la première et la dernière page sont TOUJOURS là — ce sont les deux
 *     seules destinations qu'on vise sans réfléchir ;
 *   • la largeur de la rangée ne varie pas selon la position, sinon les
 *     boutons se déplaceraient sous le curseur d'un clic à l'autre ;
 *   • un trou d'UNE seule page n'est pas un trou : afficher « … » à la place
 *     du 4 quand on saute de 3 à 5 coûte un clic pour rien.
 */
export function pagesAffichees(
	page: number,
	totalPages: number,
	voisines = 1,
): EntreePagination[] {
	if (totalPages <= 1) return [1]

	// Largeur constante : 1 + dernière + la courante + ses voisines des deux
	// côtés + les deux trous. Près d'un bord, le côté qui manque est reversé à
	// l'autre — sans quoi la rangée rétrécirait en pages 1 et 2.
	const largeur = 2 * voisines + 5
	if (totalPages <= largeur)
		return Array.from({ length: totalPages }, (_, index) => index + 1)

	const interieur = largeur - 2 // ce qui reste entre la première et la dernière
	let debut = page - voisines
	let fin = page + voisines

	if (debut <= 3) {
		debut = 2
		fin = interieur
	} else if (fin >= totalPages - 2) {
		fin = totalPages - 1
		debut = totalPages - interieur + 1
	}

	const entrees: EntreePagination[] = [1]
	if (debut > 2) entrees.push('trou-gauche')
	for (let numero = debut; numero <= fin; numero++) entrees.push(numero)
	if (fin < totalPages - 1) entrees.push('trou-droite')
	entrees.push(totalPages)
	return entrees
}

interface PaginationBarProps {
	page: number
	totalPages: number
	/** Nombre total de lignes, toutes pages confondues — pour dire « 151–175 sur
	 *  2 999 ». Il vient du serveur : la table n'en voit que 25. */
	total: number
	perPage: number
	/** Une requête est en vol : les sauts sont fermés le temps qu'elle revienne,
	 *  sinon deux clics rapides envoient deux pages et la dernière arrivée
	 *  gagne, qui n'est pas forcément la dernière demandée. */
	disabled?: boolean
	onChange: (page: number) => void
}

export function PaginationBar({
	page,
	totalPages,
	total,
	perPage,
	disabled = false,
	onChange,
}: PaginationBarProps) {
	const pages = Math.max(totalPages, 1)
	const premier = total === 0 ? 0 : (page - 1) * perPage + 1
	const dernier = Math.min(page * perPage, total)

	const aller = (numero: number) => {
		const cible = Math.min(Math.max(numero, 1), pages)
		if (cible !== page) onChange(cible)
	}

	return (
		<nav
			aria-label='Pagination du catalogue'
			className='flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t bg-muted/30 px-3 py-2'
		>
			<span className='whitespace-nowrap text-muted-foreground text-xs tabular-nums'>
				{total === 0
					? 'Aucun produit'
					: `${premier}–${dernier} sur ${total} produit${total > 1 ? 's' : ''}`}
			</span>

			<div className='flex min-w-0 flex-wrap items-center justify-end gap-0.5'>
				<Button
					variant='ghost'
					size='icon'
					className='h-8 w-8 text-primary hover:bg-background hover:text-primary dark:text-foreground'
					aria-label='Page précédente'
					disabled={disabled || page <= 1}
					onClick={() => aller(page - 1)}
				>
					<ChevronLeft className='h-4 w-4' />
				</Button>

				{pagesAffichees(page, pages).map((entree) =>
					typeof entree === 'number' ? (
						<button
							key={entree}
							type='button'
							onClick={() => aller(entree)}
							disabled={disabled}
							aria-label={`Page ${entree}`}
							// `aria-current` et non `aria-pressed` : ce n'est pas un
							// interrupteur, c'est la position dans une liste.
							aria-current={entree === page ? 'page' : undefined}
							className={cn(
								'h-8 min-w-8 rounded-md px-2 font-medium text-primary text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:text-foreground',
								entree === page
									? // Le même bleu nuit que le statut actif de la barre de
										// commande : dans cet écran, « ceci est la sélection » se
										// dit d'une seule façon.
										'bg-primary text-primary-foreground shadow-sm dark:text-primary-foreground'
									: 'hover:bg-background',
							)}
						>
							{entree}
						</button>
					) : (
						<span
							key={entree}
							aria-hidden='true'
							className='px-1 text-muted-foreground text-xs'
						>
							…
						</span>
					),
				)}

				<Button
					variant='ghost'
					size='icon'
					className='h-8 w-8 text-primary hover:bg-background hover:text-primary dark:text-foreground'
					aria-label='Page suivante'
					disabled={disabled || page >= pages}
					onClick={() => aller(page + 1)}
				>
					<ChevronRight className='h-4 w-4' />
				</Button>
			</div>
		</nav>
	)
}
