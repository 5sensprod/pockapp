import type { UseFormReturn } from 'react-hook-form'

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { MANUAL_STOCK_REASONS } from '@/lib/queries/stock-adjust'

import { StockBTransferButton } from './StockBTransferButton'
import { DetailCard, HelpTooltip, NativeSelect } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

function ecartDe(valeur: unknown, origine: unknown) {
	const ecart = Number(valeur) - Number(origine ?? 0)
	return Number.isNaN(ecart) ? 0 : ecart
}

export function ProductStockCard({
	productId,
	form,
	embedded = false,
}: {
	productId: string
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
}) {
	const [stock, stockB, reason] = form.watch([
		'stock',
		'stock_b',
		'stock_reason',
	])
	// La valeur d'origine est celle du dernier `reset` : à l'ouverture, après
	// chaque enregistrement, et après un passage en Stock B.
	const origine = form.formState.defaultValues
	const ecart = ecartDe(stock, origine?.stock)
	const ecartB = ecartDe(stockB, origine?.stock_b)

	const content = (
		<div className='grid gap-5'>
			<div className='grid items-end gap-5 sm:grid-cols-2 xl:grid-cols-[150px_150px_180px_minmax(0,1fr)]'>
				<NumberField form={form} name='stock' label='Stock neuf' />
				<NumberField
					form={form}
					name='min_stock'
					label='Stock minimum'
					min='0'
				/>
				<FormField
					control={form.control}
					name='type'
					render={({ field }) => (
						<FormItem>
							<FormLabel>Type</FormLabel>
							<FormControl>
								<NativeSelect {...field}>
									<option value='simple'>Produit</option>
									<option value='service'>Service</option>
								</NativeSelect>
							</FormControl>
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name='manage_stock'
					render={({ field }) => (
						<FormItem className='flex min-h-10 items-center justify-between gap-4 xl:justify-end'>
							<div>
								<FormLabel className='flex items-center text-foreground'>
									Suivi du stock
									<HelpTooltip text='À désactiver pour un service dont la quantité ne doit pas être suivie.' />
								</FormLabel>
								<p className='mt-1 text-muted-foreground text-[10px]'>
									Met à jour automatiquement la disponibilité.
								</p>
							</div>
							<FormControl>
								<Switch
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
						</FormItem>
					)}
				/>
			</div>

			{/* Le Stock B sur sa propre ligne, sous le neuf : quantité, prix, et
			    le passage neuf → B. */}
			<div className='grid items-end gap-5 sm:grid-cols-2 xl:grid-cols-[150px_150px_minmax(0,1fr)]'>
				<NumberField
					form={form}
					name='stock_b'
					label='Stock B'
					min='0'
					help='Unités ouvertes, rayées ou retournées fonctionnelles, vendues à part. Même fiche, même code-barres.'
				/>
				<NumberField
					form={form}
					name='stock_b_price_ttc'
					label='Prix Stock B TTC'
					min='0'
					step='0.01'
					help='Appliqué en remise quand la caisse vend une unité B, le prix TTC restant affiché. Vide : le vendeur fixe la remise.'
				/>
				<div className='flex h-11 items-center sm:col-span-2 xl:col-span-1 xl:justify-end'>
					{productId && (
						<StockBTransferButton productId={productId} form={form} />
					)}
				</div>
			</div>

			{/* Un stock modifié à la main dit POURQUOI : c'est ce qui rend
			    l'historique lisible. Vente et retour ont leur motif automatique. */}
			{(ecart !== 0 || ecartB !== 0) && (
				<div className='grid gap-5 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-4 sm:grid-cols-2'>
					<div className='space-y-1 font-medium text-sm sm:col-span-2'>
						{ecart !== 0 && (
							<Ecart
								label='Stock neuf'
								origine={Number(origine?.stock ?? 0)}
								valeur={stock}
								ecart={ecart}
							/>
						)}
						{ecartB !== 0 && (
							<Ecart
								label='Stock B'
								origine={Number(origine?.stock_b ?? 0)}
								valeur={stockB}
								ecart={ecartB}
							/>
						)}
					</div>
					<FormField
						control={form.control}
						name='stock_reason'
						render={({ field }) => (
							<FormItem>
								<FormLabel>Motif du mouvement *</FormLabel>
								<FormControl>
									<NativeSelect {...field}>
										<option value=''>— Choisir un motif —</option>
										{MANUAL_STOCK_REASONS.map((motif) => (
											<option key={motif.value} value={motif.value}>
												{motif.label}
											</option>
										))}
									</NativeSelect>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name='stock_comment'
						render={({ field }) => (
							<FormItem>
								<FormLabel>
									Commentaire{reason === 'other' ? ' *' : ''}
								</FormLabel>
								<FormControl>
									<Input
										placeholder={
											reason === 'other'
												? 'Précisez le motif'
												: 'Facultatif : n° de bon, fournisseur…'
										}
										maxLength={500}
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
			)}
		</div>
	)

	return embedded ? content : <DetailCard title='Stock'>{content}</DetailCard>
}

function Ecart({
	label,
	origine,
	valeur,
	ecart,
}: {
	label: string
	origine: number
	valeur: unknown
	ecart: number
}) {
	return (
		<p>
			{label} {origine} → {String(valeur)}{' '}
			<span className={ecart > 0 ? 'text-emerald-700' : 'text-destructive'}>
				({ecart > 0 ? '+' : ''}
				{ecart})
			</span>
		</p>
	)
}

function NumberField({
	form,
	name,
	label,
	min,
	step = '1',
	help,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'stock' | 'stock_b' | 'stock_b_price_ttc' | 'min_stock'
	label: string
	min?: string
	step?: string
	help?: string
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
						<Input type='number' step={step} min={min} {...field} />
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
