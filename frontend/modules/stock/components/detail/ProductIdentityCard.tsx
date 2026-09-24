import type { UseFormReturn } from 'react-hook-form'

import JsBarcode from 'jsbarcode'
import { Barcode, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { formatEAN13, validateEAN13 } from '@/lib/barcode/ean13'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import { generateProductBarcode } from '@/lib/queries/product-barcode'
import { usePocketBase } from '@/lib/use-pocketbase'
import { toast } from 'sonner'

import { DetailCard, HelpTooltip, NativeSelect } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

// L'identité INTERNE du produit : uniquement ce qui permet de le nommer et de
// le retrouver. L'état commercial (neuf / occasion / location) vit ici avec
// le code-barres — l'opération commerciale (plein tarif / soldé / promotion),
// elle, reste avec les prix. Le nom public reste dans la colonne AppSite.
export function ProductIdentityCard({
	form,
	embedded = false,
}: {
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
}) {
	const content = (
		<div className='grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(160px,1fr)]'>
			<TextField
				form={form}
				name='designation'
				label='Désignation'
				emphasis
				help='Ce libellé apparaît sur le ticket de caisse et la facture.'
				placeholder='Libellé court pour le ticket et la facture'
			/>
			<TextField form={form} name='sku' label='Référence' />
			<BarcodeField form={form} />
			<CommercialStateField form={form} />
		</div>
	)

	return embedded ? (
		content
	) : (
		<DetailCard title='Identité du produit'>{content}</DetailCard>
	)
}

function CommercialStateField({
	form,
}: {
	form: UseFormReturn<ProductDetailValues>
}) {
	return (
		<FormField
			control={form.control}
			name='commercial_state'
			render={({ field }) => (
				<FormItem>
					<FormLabel className='flex items-center'>
						État commercial
						<HelpTooltip text='Occasion et location gardent leur rayon habituel : cet état dit comment le produit se vend.' />
					</FormLabel>
					<FormControl>
						<NativeSelect
							{...field}
							onChange={(event) => {
								field.onChange(event)
								// Un produit d'occasion se vend à 0 % de TVA (régime de la
								// marge) : la bascule est immédiate, pour ne pas laisser la
								// fiche afficher un taux qui ne sera plus le sien à
								// l'enregistrement (`useProductDetailEditor.submit` l'impose
								// de toute façon, ceci n'est que le retour visuel).
								if (event.target.value === 'used') {
									form.setValue('tax_rate', 0, {
										shouldDirty: true,
										shouldValidate: true,
									})
								}
							}}
						>
							<option value=''>Neuf</option>
							<option value='used'>Occasion</option>
							<option value='rental'>Location</option>
						</NativeSelect>
					</FormControl>
				</FormItem>
			)}
		/>
	)
}

function BarcodeField({
	form,
}: {
	form: UseFormReturn<ProductDetailValues>
}) {
	const pb = usePocketBase()
	const [generating, setGenerating] = useState(false)

	const generate = async () => {
		if (generating) return
		setGenerating(true)
		try {
			const barcode = await generateProductBarcode(pb)
			form.setValue('barcode', barcode, {
				shouldDirty: true,
				shouldTouch: true,
				shouldValidate: true,
			})
			toast.success('Code-barres EAN-13 généré')
		} catch (error) {
			toast.error(`Génération impossible : ${pocketbaseErrorMessage(error)}`)
		} finally {
			setGenerating(false)
		}
	}

	return (
		<FormField
			control={form.control}
			name='barcode'
			render={({ field }) => {
				const value = field.value?.trim() ?? ''
				const isEAN13 = /^\d{13}$/.test(value)
				const valid = isEAN13 && validateEAN13(value)
				return (
					<FormItem>
						<FormLabel className='flex min-h-6 items-center'>
							Code-barres
						</FormLabel>
						<div className='flex min-w-0 items-center gap-2'>
							<FormControl>
								<Input className='min-w-0 font-mono' {...field} />
							</FormControl>
							<Button
								type='button'
								variant='outline'
								size='icon'
								className='h-10 w-10 shrink-0'
								disabled={generating}
								onClick={generate}
								aria-label='Générer un code-barres EAN-13'
								title='Générer un code-barres EAN-13'
							>
								{generating ? (
									<LoaderCircle className='h-4 w-4 animate-spin' />
								) : (
									<Barcode className='h-4 w-4' />
								)}
							</Button>
						</div>
						{isEAN13 && !valid && (
							<p className='text-destructive text-xs'>
								Clé de contrôle EAN-13 incorrecte.
							</p>
						)}
						{valid && <EAN13Preview value={value} />}
						<FormMessage />
					</FormItem>
				)
			}}
		/>
	)
}

function EAN13Preview({ value }: { value: string }) {
	const ref = useRef<SVGSVGElement>(null)

	useEffect(() => {
		if (!ref.current) return
		JsBarcode(ref.current, value, {
			format: 'EAN13',
			displayValue: true,
			fontSize: 13,
			height: 42,
			margin: 4,
		})
	}, [value])

	return (
		<div className='mt-2 overflow-x-auto rounded-md border bg-white p-2'>
			<svg
				ref={ref}
				role='img'
				aria-label={`Aperçu du code-barres ${formatEAN13(value)}`}
			/>
		</div>
	)
}

function TextField({
	form,
	name,
	label,
	help,
	hint,
	placeholder,
	emphasis,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'designation' | 'sku' | 'barcode'
	label: string
	help?: string
	hint?: string
	placeholder?: string
	emphasis?: boolean
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
						<Input
							placeholder={placeholder}
							className={
								emphasis ? 'font-semibold text-base text-primary' : undefined
							}
							{...field}
						/>
					</FormControl>
					{hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
