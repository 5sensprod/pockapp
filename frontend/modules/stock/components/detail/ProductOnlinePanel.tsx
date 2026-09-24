import type { UseFormReturn } from 'react-hook-form'

import { productHealth } from '@/lib/queries/catalog-health'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'

import { DetailCard } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

// Ce que la fiche dit d'elle-même : sa note de complétude, et rien d'autre.
// L'état d'envoi (fiche à jour, images à jour) et la vérification des images
// vivent dans PocketSite (`/site`), qui est fait pour ça — les répéter ici
// coûtait un appel à l'inventaire distant à chaque ouverture de fiche, et le
// calcul d'empreinte lisait les octets des images sur demande.
export function ProductOnlinePanel({
	product,
	form,
	embedded = false,
}: {
	product: CatalogProductShape
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
}) {
	const editedHealthValues = form.watch([
		'name',
		'description',
		'categories',
		'price_ttc',
	])
	const health = productHealth({
		...product,
		name: editedHealthValues[0],
		description: editedHealthValues[1],
		categories: editedHealthValues[2],
		price_ttc: editedHealthValues[3],
	})

	const content = (
		<div className='flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-3'>
			<div className='grid h-11 w-11 shrink-0 place-items-center rounded-full bg-background font-extrabold text-emerald-700 text-xs shadow-sm'>
				{health.score}/{health.max}
			</div>
			<div>
				<p className='font-semibold text-sm'>
					{health.missing.length ? 'Fiche à compléter' : 'Fiche complète'}
				</p>
				<p className='mt-0.5 text-emerald-900/65 text-[11px]'>
					{health.missing.length
						? `À compléter : ${health.missing.join(', ')}.`
						: 'Tous les éléments nécessaires au site sont présents.'}
				</p>
			</div>
		</div>
	)

	return embedded ? (
		content
	) : (
		<DetailCard title='En ligne'>{content}</DetailCard>
	)
}
