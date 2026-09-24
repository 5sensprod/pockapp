import { PlaySquare } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'

import { ProductWebLinksCard } from './ProductWebLinksCard'
import type { ProductDetailValues } from './product-detail-form'

// « Liens et vidéos », dans la modale « Fiche du site » (`ProductSheetStudio`),
// sous la description : les liens font partie de la fiche web. Aucun
// interrupteur ni aide — la liste et son champ d'ajout parlent d'eux-mêmes ;
// pas de lien, pas de ligne.
export function ProductWebLinksSection({
	form,
}: {
	form: UseFormReturn<ProductDetailValues>
}) {
	return (
		<section className='grid gap-3'>
			<h3 className='flex items-center gap-2 font-semibold text-sm'>
				<PlaySquare className='h-4 w-4 text-purple-600 dark:text-purple-400' />
				Liens et vidéos
			</h3>
			<ProductWebLinksCard form={form} />
		</section>
	)
}
