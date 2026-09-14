// frontend/modules/site/components/CatalogPendingBadge.tsx
//
// La pastille posée sur « Catalogue en ligne », dans la barre latérale. Elle
// ne calcule rien : `useCataloguePending` compte, elle affiche — et elle
// s'efface complètement quand il n'y a rien, plutôt que d'afficher un zéro.
//
// Son infobulle est la moitié du travail : un chiffre seul dans un menu
// n'apprend pas quoi faire, et ces deux états-là ne se réparent pas de la même
// façon — l'un s'envoie, l'autre ne se retire pas encore.

import { cn } from '@/lib/utils'

import { useCataloguePending } from '../hooks/use-catalog-pending'

export function CatalogPendingBadge({ className }: { className?: string }) {
	const pending = useCataloguePending()

	if (!pending.mesure || pending.total === 0) return null

	const lignes = [
		pending.jamaisEnvoyes > 0
			? `${pending.jamaisEnvoyes} fiche(s) publiée(s) ici mais jamais envoyée(s) au site — la première mise en ligne se fait à la main.`
			: null,
		pending.disparus > 0
			? `${pending.disparus} fiche(s) encore en ligne n'existe(nt) plus ici — leur page reste visible, le retrait n'est pas automatisé.`
			: null,
		'Les fiches simplement modifiées ne sont pas comptées ici : ouvrez Catalogue en ligne pour l’état complet.',
	].filter(Boolean)

	return (
		<span
			title={lignes.join('\n')}
			aria-label={lignes.join(' ')}
			className={cn(
				'ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 py-0.5 font-semibold text-[10px] text-amber-500 tabular-nums',
				className,
			)}
		>
			{pending.total > 99 ? '99+' : pending.total}
		</span>
	)
}
