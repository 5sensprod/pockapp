import type { UseFormReturn } from 'react-hook-form'

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'

import { DetailCard, HelpTooltip, ReadValue } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

// DEUX NOMS, DEUX DESTINATIONS — et les libellés le disent maintenant.
// `name` titre la page publique du produit et donne son adresse ; `designation`
// s'imprime sur le ticket de caisse. Dire « Nom » et « Désignation » ne
// permettait pas de savoir lequel partait où.
export function ProductIdentityCard({
	product,
	editing,
	form,
}: {
	product: CatalogProductShape
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
}) {
	// LE REPLI, RENDU VISIBLE. Il n'agit qu'à L'OUVERTURE du formulaire
	// (`productDetailValues`) : une fiche sans nom en ligne s'ouvre garnie de sa
	// désignation. Enregistrer sans toucher au champ FIXE ce nom — et, si la
	// fiche n'a pas encore d'adresse, l'adresse qu'il donne, qui ne se retouche
	// plus jamais. Le taire, c'est laisser figer une adresse à l'insu.
	const nomReprisDeLaDesignation =
		(product.name ?? '') === '' && (product.designation ?? '') !== ''

	return (
		<DetailCard title='Identité et description'>
			{editing ? (
				<div className='grid gap-4 sm:grid-cols-2'>
					<TextField
						form={form}
						name='name'
						label='Nom de la fiche en ligne *'
						help='Ce nom titre la page du produit sur axemusique.shop, et c’est de lui qu’est dérivée son adresse.'
						placeholder='Guitare folk Alvarez'
						hint={
							nomReprisDeLaDesignation
								? 'Cette fiche n’avait pas de nom en ligne : le nom du ticket a été repris ici. Enregistrer le fixera, et l’adresse du site en découlera.'
								: undefined
						}
					/>
					<TextField
						form={form}
						name='designation'
						label='Nom sur le ticket'
						help='Ce libellé s’imprime sur le ticket de caisse. Il ne part jamais vers le site.'
						placeholder='Libellé court, imprimé sur le ticket'
					/>
					<TextField form={form} name='sku' label='Référence' />
					<TextField form={form} name='barcode' label='Code-barres' />
				</div>
			) : (
				<div className='grid gap-4 sm:grid-cols-2'>
					<ReadValue label='Nom de la fiche en ligne' value={product.name} />
					<ReadValue label='Nom sur le ticket' value={product.designation} />
					<ReadValue label='Référence' value={product.sku} />
					<ReadValue label='Code-barres' value={product.barcode} />
				</div>
			)}
		</DetailCard>
	)
}

function TextField({
	form,
	name,
	label,
	help,
	hint,
	placeholder,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'name' | 'designation' | 'sku' | 'barcode'
	label: string
	help?: string
	hint?: string
	placeholder?: string
}) {
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel className='flex items-center'>
						{label}
						{help && <HelpTooltip text={help} />}
					</FormLabel>
					<FormControl>
						<Input placeholder={placeholder} {...field} />
					</FormControl>
					{hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
