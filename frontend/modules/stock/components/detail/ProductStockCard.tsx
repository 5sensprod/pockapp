import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
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
	const [stock, stockB, stockBPrice, reason, comment, type] = form.watch([
		'stock',
		'stock_b',
		'stock_b_price_ttc',
		'stock_reason',
		'stock_comment',
		'type',
	])
	// Un service n'a pas de stock : `type` le dit, et c'est le serveur qui ne
	// décompte rien (`backend/routes/stock_routes.go`). L'ancien interrupteur
	// « Suivi du stock » doublait ce fait sans que personne le lise ; il est
	// retiré (docs/DECISIONS.md, 2026-09-24).
	const estService = type === 'service'
	const [stockBActif, setStockBActif] = useState(
		() => Number(stockB) > 0 || Number(stockBPrice) > 0,
	)
	const [motifOuvert, setMotifOuvert] = useState(false)
	// La valeur d'origine est celle du dernier `reset` : à l'ouverture, après
	// chaque enregistrement, et après un passage en Stock B.
	const origine = form.formState.defaultValues
	const ecart = ecartDe(stock, origine?.stock)
	const ecartB = ecartDe(stockB, origine?.stock_b)

	const content = (
		<div className='grid gap-5'>
			<div className='grid items-end gap-5 sm:grid-cols-2 xl:grid-cols-[150px_150px_180px]'>
				{!estService && (
					<>
						<NumberField
							form={form}
							name='stock'
							label='Stock neuf'
							onSaisie={() => setMotifOuvert(true)}
						/>
						<NumberField
							form={form}
							name='min_stock'
							label='Stock minimum'
							min='0'
						/>
					</>
				)}
				<FormField
					control={form.control}
					name='type'
					render={({ field }) => (
						<FormItem>
							<FormLabel>Type</FormLabel>
							<FormControl>
								<NativeSelect
									{...field}
									onChange={(event) => {
										field.onChange(event)
										if (event.target.value !== 'service') return
										// Ce qui était saisi sur les quantités ne doit pas partir :
										// le bloc disparaît, et un mouvement invisible serait pire
										// qu'un mouvement refusé.
										form.resetField('stock')
										form.resetField('stock_b')
										form.resetField('stock_reason')
										form.resetField('stock_comment')
										setMotifOuvert(false)
									}}
								>
									<option value='simple'>Produit</option>
									<option value='service'>Service</option>
								</NativeSelect>
							</FormControl>
						</FormItem>
					)}
				/>
				{estService && (
					<p className='text-muted-foreground text-xs sm:col-span-2 xl:col-span-2'>
						Un service n’a pas de stock : la caisse ne décompte aucune quantité.
					</p>
				)}
			</div>

			{/* Le Stock B est une option de la fiche. Replier la carte ne modifie
			    jamais les quantités : l'interrupteur ne pilote que leur affichage. */}
			{!estService && (
				<div className='rounded-lg border p-4'>
					<div className='flex items-center justify-between gap-4'>
						<div className='min-w-0'>
							<p className='flex items-center font-semibold text-sm'>
								Utiliser le Stock B
								<HelpTooltip text='Pour les unités ouvertes, rayées ou retournées fonctionnelles, vendues à part sur la même fiche.' />
							</p>
							<p className='mt-0.5 text-muted-foreground text-[10px]'>
								Gère une quantité et un prix distincts du stock neuf.
							</p>
						</div>
						<Switch
							checked={stockBActif}
							onCheckedChange={setStockBActif}
							aria-label='Utiliser le Stock B'
						/>
					</div>

					{stockBActif && (
						<div className='mt-4 grid items-end gap-5 border-t pt-4 sm:grid-cols-2 xl:grid-cols-[150px_150px_minmax(0,1fr)]'>
							<NumberField
								form={form}
								name='stock_b'
								label='Stock B'
								min='0'
								help='Unités ouvertes, rayées ou retournées fonctionnelles, vendues à part. Même fiche, même code-barres.'
								onSaisie={() => setMotifOuvert(true)}
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
					)}
				</div>
			)}

			{/* Un stock modifié à la main dit POURQUOI dans une modale : c'est ce
			    qui rend l'historique lisible. Vente et retour ont leur motif
			    automatique. */}
			{(ecart !== 0 || ecartB !== 0) && (
				<div className='flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between'>
					<div className='space-y-1 font-medium text-sm'>
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
					<Button
						type='button'
						variant='outline'
						onClick={() => setMotifOuvert(true)}
					>
						{reason ? 'Modifier le motif' : 'Renseigner le motif'}
					</Button>
				</div>
			)}

			<Dialog
				open={motifOuvert && (ecart !== 0 || ecartB !== 0)}
				onOpenChange={setMotifOuvert}
			>
				<DialogContent className='sm:max-w-[480px]'>
					<DialogHeader>
						<DialogTitle>Motif du mouvement de stock</DialogTitle>
						<DialogDescription>
							Indiquez pourquoi la quantité est modifiée. Cette information sera
							conservée dans l’historique du produit.
						</DialogDescription>
					</DialogHeader>
					<div className='space-y-4'>
						<div className='space-y-1 rounded-lg bg-muted/50 p-3 font-medium text-sm'>
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
					<DialogFooter>
						<Button
							type='button'
							onClick={() => setMotifOuvert(false)}
							disabled={!reason || (reason === 'other' && !comment.trim())}
						>
							Valider le motif
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
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
	onSaisie,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'stock' | 'stock_b' | 'stock_b_price_ttc' | 'min_stock'
	label: string
	min?: string
	step?: string
	help?: string
	/** Appelé après une saisie manuelle pour demander le motif du mouvement. */
	onSaisie?: () => void
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
							type='number'
							step={step}
							min={min}
							{...field}
							onChange={(event) => {
								field.onChange(event)
								onSaisie?.()
							}}
						/>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
