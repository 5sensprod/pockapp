import { CalendarRange, type LucideIcon, Percent, Tag } from 'lucide-react'
import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
	type JourServeur,
	periodePromo,
	prixPromoActif,
} from '@/lib/pricing/promo-price'
import { useJourServeur } from '@/lib/pricing/use-jour-serveur'
import { cn } from '@/lib/utils'

import { DetailCard, HelpTooltip } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

/**
 * Les deux taux que le commerce de détail appelle « marge », à partir du prix
 * TTC saisi : le TTC est détaxé d'abord, les deux se calculent donc sur le HT.
 * - `marque` : sur le prix de vente HT — c'est le seul qui était affiché.
 * - `marge` : sur le prix d'achat, le taux de marge au sens comptable.
 * `null` quand le dénominateur n'a pas de sens (prix ou achat à zéro).
 */
function tauxMarges(priceTtc = 0, purchaseHt = 0, taxRate = 0) {
	const priceHt = priceTtc / (1 + taxRate / 100)
	if (priceHt <= 0) return { marque: null, marge: null }
	const brute = priceHt - purchaseHt
	return {
		marque: (brute / priceHt) * 100,
		marge: purchaseHt > 0 ? (brute / purchaseHt) * 100 : null,
	}
}

/** « AAAA-MM-JJ » → « JJ/MM/AAAA ». */
function dateFr(jour: string) {
	const [a, m, j] = jour.split('-')
	return `${j}/${m}/${a}`
}

/**
 * Ce que la fiche dit de la promo, dans l'ordre où la règle la refuse
 * (`prixPromoActif`) : l'écran ne recalcule rien, il nomme la condition qui
 * manque.
 */
function mentionPromo(produit: {
	price_ttc: number
	promo_price_ttc: number
	sale_state: string
	promo_start: string
	promo_end: string
	jour: JourServeur
}): { texte: string; actif: boolean } | null {
	const { jour, ...prix } = produit
	if (!(prix.promo_price_ttc > 0) && prix.sale_state === '') return null

	const actif = prixPromoActif(prix, jour)
	if (actif !== null) {
		const jusquau = prix.promo_end ? ` jusqu’au ${dateFr(prix.promo_end)}` : ''
		return {
			texte: `Actif : −${(prix.price_ttc - actif).toFixed(2)} € par unité${jusquau}`,
			actif: true,
		}
	}
	if (prix.sale_state === '') {
		return { texte: 'Inactif : opération « Plein tarif »', actif: false }
	}
	if (!(prix.promo_price_ttc > 0)) {
		return { texte: 'Prix promo requis', actif: false }
	}
	if (prix.promo_price_ttc >= prix.price_ttc) {
		return { texte: 'Inactif : doit être inférieur au prix TTC', actif: false }
	}
	switch (periodePromo(prix, jour)) {
		case 'programmee':
			return {
				texte: `Programmé : à partir du ${dateFr(prix.promo_start)}`,
				actif: false,
			}
		case 'expiree':
			return {
				texte: `Expiré le ${dateFr(prix.promo_end)} : la fiche repasse en plein tarif`,
				actif: false,
			}
		case 'jour-inconnu':
			return {
				texte: 'Période non vérifiée : jour du serveur indisponible',
				actif: false,
			}
		default:
			return null
	}
}

export function ProductPricingCard({
	form,
	embedded = false,
	priceRequired = false,
}: {
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
	priceRequired?: boolean
}) {
	const jour = useJourServeur()
	const [prix, achat, tva, promo, operation, debut, fin] = form.watch([
		'price_ttc',
		'purchase_price_ht',
		'tax_rate',
		'promo_price_ttc',
		'sale_state',
		'promo_start',
		'promo_end',
	])
	const taux = tauxMarges(Number(prix), Number(achat), Number(tva))
	const mention = mentionPromo({
		price_ttc: Number(prix),
		promo_price_ttc: Number(promo),
		sale_state: operation,
		promo_start: debut,
		promo_end: fin,
		jour,
	})
	// Repliée par défaut ; ouverte d'emblée si la fiche porte déjà une borne,
	// pour ne pas cacher une période déjà posée.
	const [periodeOuverte, setPeriodeOuverte] = useState(
		() => Boolean(debut) || Boolean(fin),
	)

	const content = (
		<div className='space-y-4'>
			{/* L'opération commerciale est un axe indépendant de l'état commercial
			    (Identité) : elle ne change ni le prix affiché en temps normal, ni la
			    publication. */}
			<div className='rounded-lg border p-4'>
				<div className='flex items-center justify-between gap-4'>
					<div className='min-w-0'>
						<p className='flex items-center font-semibold text-sm'>
							Produit en solde ou en promotion
							<HelpTooltip text='Indépendante de l’état commercial : une occasion peut être soldée. Elle ne change ni le prix, ni la publication.' />
						</p>
						<p className='mt-0.5 text-muted-foreground text-[10px]'>
							Applique le prix promo en remise, sur le ticket et la facture.
						</p>
					</div>
					<Switch
						checked={operation !== ''}
						onCheckedChange={(checked) => {
							form.setValue('sale_state', checked ? 'promo' : '', {
								shouldDirty: true,
								shouldTouch: true,
								shouldValidate: true,
							})
						}}
						aria-label='Produit en solde ou en promotion'
					/>
				</div>

				{operation !== '' && (
					<div className='mt-4 space-y-4 border-t pt-4'>
						<FormField
							control={form.control}
							name='sale_state'
							render={({ field }) => (
								<FormItem>
									<div className='flex items-center gap-2'>
										<OperationButton
											active={field.value === 'sale'}
											icon={Tag}
											label='Soldé'
											onClick={() => field.onChange('sale')}
										/>
										<OperationButton
											active={field.value === 'promo'}
											icon={Percent}
											label='Promotion'
											onClick={() => field.onChange('promo')}
										/>
									</div>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className='max-w-[220px]'>
							<NumberField
								form={form}
								name='promo_price_ttc'
								label='Prix promo TTC'
								step='0.01'
								help='Appliqué en remise sur le ticket et la facture, le prix TTC restant affiché.'
								// Filet historique : un prix promo saisi sur une fiche « Plein
								// tarif » restait inerte, et passait pour une panne (10
								// septembre 2026). Le champ n'est plus visible hors opération
								// active, mais la bascule reste au cas où — jamais sur un
								// « Soldé » déjà choisi.
								onSaisie={(valeur) => {
									if (
										Number(valeur) > 0 &&
										form.getValues('sale_state') === ''
									) {
										form.setValue('sale_state', 'promo', {
											shouldDirty: true,
											shouldTouch: true,
										})
									}
								}}
							/>
							{mention && (
								<p
									className={
										mention.actif
											? 'mt-1 text-emerald-700 text-[10px]'
											: 'mt-1 text-muted-foreground text-[10px]'
									}
								>
									{mention.texte}
								</p>
							)}
						</div>

						<div>
							<Button
								type='button'
								variant='outline'
								size='sm'
								onClick={() => setPeriodeOuverte((v) => !v)}
							>
								<CalendarRange className='h-3.5 w-3.5' />
								{periodeOuverte ? 'Masquer la période' : 'Définir une période'}
							</Button>
							{periodeOuverte && (
								<div className='mt-3 grid gap-4 sm:grid-cols-2'>
									<DateField
										form={form}
										name='promo_start'
										label='Promo à partir du'
										help='Vide : dès maintenant. Le jour est celui du serveur, à Paris.'
									/>
									<DateField
										form={form}
										name='promo_end'
										label='Promo jusqu’au'
										help='Inclus. Vide : sans fin. Le lendemain, la fiche repasse seule en « Plein tarif » en caisse, en facture et sur le site.'
									/>
								</div>
							)}
						</div>
					</div>
				)}
			</div>

			<div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
				<NumberField
					form={form}
					name='purchase_price_ht'
					label='Achat HT'
					step='0.01'
				/>
				<NumberField
					form={form}
					name='price_ttc'
					label='Prix TTC'
					step='0.01'
					warning={priceRequired && !(Number(prix) > 0)}
				/>
				<TaxRateField form={form} />
				<MargeField form={form} marge={taux.marge} marque={taux.marque} />
			</div>
		</div>
	)

	return embedded ? (
		content
	) : (
		<DetailCard title='Prix et marge'>{content}</DetailCard>
	)
}

/** Les deux valeurs d'opération restent atteignables séparément : « Soldé »
 *  et « Promotion » ne sont pas fusionnées derrière le seul interrupteur. */
function OperationButton({
	active,
	icon: Icon,
	label,
	onClick,
}: {
	active: boolean
	icon: LucideIcon
	label: string
	onClick: () => void
}) {
	return (
		<button
			type='button'
			onClick={onClick}
			className={cn(
				'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium text-xs transition-colors',
				active
					? 'border-primary bg-primary/10 text-primary'
					: 'border-input text-muted-foreground hover:bg-muted/50',
			)}
		>
			<Icon className='h-3.5 w-3.5' />
			{label}
		</button>
	)
}

function NumberField({
	form,
	name,
	label,
	step,
	help,
	onSaisie,
	warning = false,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'price_ttc' | 'promo_price_ttc' | 'purchase_price_ht'
	label: string
	step: string
	help?: string
	/** Appelé après une saisie de l'utilisateur — jamais au chargement. */
	onSaisie?: (valeur: string) => void
	warning?: boolean
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
						{warning && (
							<HelpTooltip
								text='Un prix de vente TTC supérieur à zéro est obligatoire pour valider.'
								className='text-orange-500 hover:text-orange-600 dark:text-orange-400'
							/>
						)}
					</FormLabel>
					<FormControl>
						<Input
							type='number'
							min='0'
							step={step}
							className={
								warning
									? 'border-orange-400 bg-orange-50 focus-visible:ring-orange-500 dark:border-orange-700 dark:bg-orange-950/30'
									: undefined
							}
							{...field}
							onChange={(event) => {
								field.onChange(event)
								onSaisie?.(event.target.value)
							}}
						/>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}

/**
 * La marge se saisit aussi, dans l'autre sens : depuis l'achat HT, elle donne
 * le prix TTC — au lieu de seulement le lire depuis un prix déjà posé. Reprise
 * d'AppPos (`usePriceCalculations.js`, mode « depuis le coût »), sur le champ
 * qui existe ici : `purchase_price_ht` × (1 + marge/100) détaxé, puis retaxé.
 *
 * `saisie` n'est PAS un champ du formulaire — le schéma ne porte pas de marge,
 * qui reste dérivée de `price_ttc`. Elle ne sert qu'à garder ce que l'utilisateur
 * tape pendant qu'il tape, `taux.marge` reprenant la main dès qu'il quitte le
 * champ ou que `price_ttc` change par un autre chemin.
 */
function MargeField({
	form,
	marge,
	marque,
}: {
	form: UseFormReturn<ProductDetailValues>
	marge: number | null
	marque: number | null
}) {
	const [saisie, setSaisie] = useState<string | null>(null)
	const [achat, tva] = form.watch(['purchase_price_ht', 'tax_rate'])
	const aDesArrhes = Number(achat) > 0

	return (
		<div>
			<Label className='mb-2 flex items-center font-medium text-muted-foreground text-xs'>
				Marges
				<HelpTooltip text='La marge se saisit ici et calcule le prix TTC depuis l’achat HT. À l’inverse, changer le prix TTC recalcule cette marge — les deux se répondent.' />
			</Label>
			<div className='grid grid-cols-2 gap-3'>
				<div className='min-w-0'>
					<div className='flex h-8 items-center border-emerald-300 border-b border-dashed text-emerald-700 dark:text-emerald-500'>
						<Input
							type='number'
							step='0.1'
							className='h-8 min-w-0 border-0 bg-transparent p-0 font-semibold text-lg shadow-none focus-visible:ring-0 focus-visible:ring-offset-0'
							disabled={!aDesArrhes}
							title={aDesArrhes ? undefined : 'Saisir l’achat HT d’abord'}
							value={
								saisie ??
								(marge === null ? '' : (Math.round(marge * 10) / 10).toString())
							}
							onFocus={() => setSaisie(marge === null ? '' : String(marge))}
							onBlur={() => setSaisie(null)}
							onChange={(event) => {
								setSaisie(event.target.value)
								const saisi = Number.parseFloat(event.target.value)
								const achatHt = Number(achat)
								if (Number.isNaN(saisi) || !(achatHt > 0)) return
								const prixHt = achatHt * (1 + saisi / 100)
								const prixTtc = prixHt * (1 + Number(tva) / 100)
								form.setValue('price_ttc', Math.round(prixTtc * 100) / 100, {
									shouldDirty: true,
									shouldTouch: true,
								})
							}}
						/>
						<span className='ml-1 shrink-0 font-semibold text-sm'>%</span>
					</div>
					<span className='mt-0.5 block font-normal text-[10px] text-muted-foreground'>
						Taux de marge
					</span>
				</div>
				<div className='min-w-0'>
					<p className='flex h-8 items-center whitespace-nowrap font-semibold text-emerald-700 text-lg dark:text-emerald-500'>
						{marque === null ? '—' : marque.toFixed(1)}
						{marque !== null && (
							<span className='ml-1 font-semibold text-sm'>%</span>
						)}
					</p>
					<span className='mt-0.5 block font-normal text-[10px] text-muted-foreground'>
						Taux de marque
					</span>
				</div>
			</div>
			<p className='mt-1 text-muted-foreground text-[10px]'>
				Marge sur l’achat HT (modifiable), marque sur le prix de vente HT. Hors
				promo.
			</p>
		</div>
	)
}

/**
 * Les taux proposés par les factures et devis. Le schéma garde un nombre libre
 * (`catalog_v2.go:660`) : un taux hors liste, venu d'un import, reste affiché
 * tel quel plutôt que d'être remplacé en silence.
 */
const TAUX_TVA = [20, 10, 5.5, 2.1, 0]

function libelleTva(taux: number) {
	return taux === 0 ? 'Exonéré (0 %)' : `${String(taux).replace('.', ',')} %`
}

function TaxRateField({ form }: { form: UseFormReturn<ProductDetailValues> }) {
	// Occasion impose 0 % (régime de la marge) : `submit` l'écrit de toute
	// façon, le sélecteur se contente de ne pas laisser croire qu'un autre
	// taux tiendrait.
	const occasion = form.watch('commercial_state') === 'used'

	return (
		<FormField
			control={form.control}
			name='tax_rate'
			render={({ field }) => {
				const courant = Number(field.value)
				const taux = TAUX_TVA.includes(courant)
					? TAUX_TVA
					: [...TAUX_TVA, courant]
				return (
					<FormItem>
						<FormLabel className='flex items-center'>
							TVA
							{occasion && (
								<HelpTooltip text='Occasion : TVA fixée à 0 %, régime de la marge.' />
							)}
						</FormLabel>
						<Select
							disabled={occasion}
							value={String(occasion ? 0 : courant)}
							onValueChange={(valeur) => field.onChange(Number(valeur))}
						>
							<FormControl>
								<SelectTrigger ref={field.ref} onBlur={field.onBlur}>
									<SelectValue />
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								{taux.map((t) => (
									<SelectItem key={t} value={String(t)}>
										{libelleTva(t)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FormMessage />
					</FormItem>
				)
			}}
		/>
	)
}

function DateField({
	form,
	name,
	label,
	help,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'promo_start' | 'promo_end'
	label: string
	help: string
}) {
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel className='flex items-center'>
						{label}
						<HelpTooltip text={help} />
					</FormLabel>
					<FormControl>
						{/* `type="date"` rend « AAAA-MM-JJ », exactement la forme du
						    schéma : aucune conversion de fuseau, nulle part. */}
						<Input type='date' {...field} />
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
