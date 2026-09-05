// frontend/modules/stock/components/PrintLabelDialog.tsx
//
// LA PREVIEW EST LE RÉGLAGE.
//
// Le rouleau est continu : la largeur est imposée par le média, la longueur
// est du papier qu'on dépense. Il n'y a donc AUCUN champ « longueur de
// coupe » — la longueur est calculée à partir du contenu, et la seule façon de
// la réduire est de réduire ce qu'il y a dessus. D'où cet écran : on clique un
// élément dans l'aperçu, on change sa taille, et on voit la longueur descendre.
//
// L'aperçu ne montre RIEN que l'étiquette n'aura : pas de bande de couleur sur
// les marges, pas de repère. Le papier est blanc, l'aperçu est blanc — c'est
// le seul moyen de juger d'un coup d'œil ce qui sortira. Les réglages, eux,
// sont tous à l'écran : rien à sélectionner pour les trouver.

import { useQuery } from '@tanstack/react-query'
import { ArrowDown, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
	DEFAULT_LABEL_LENGTH_MM,
	labelPageSizeQueryOptions,
	loadLabelPrinter,
	saveLabelPrinter,
	usePrintLabelMutation,
} from '@/lib/labels/label-printing'
import {
	LABEL_FONTS,
	LABEL_LIMITS,
	type LabelBlockId,
	type LabelFont,
	type LabelStyle,
	clamp,
	loadLabelStyle,
	saveLabelStyle,
} from '@/lib/labels/label-style'
import {
	type LabelProduct,
	layoutFor,
	renderLabel,
} from '@/lib/labels/render-product-label'
import { printersQueryOptions } from '@/lib/pos/printerQueries'
import { usePocketBase } from '@/lib/use-pocketbase'

/** Échelle de l'aperçu à l'écran. */
const PX_PER_MM = 7
/** L'aperçu est rendu quatre fois plus fin que ce qu'on affiche, puis réduit
 *  par le navigateur. Sans cela, un module de code-barres tombe sous 1,5 pixel
 *  et les barres se soudent entre elles : le code paraît gras à l'écran alors
 *  qu'il sort fin de l'imprimante, qui travaille à 300 dpi. */
const PREVIEW_SUPERSAMPLE = 4

type Props = {
	product: LabelProduct
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function PrintLabelDialog({ product, open, onOpenChange }: Props) {
	const pb = usePocketBase()
	const [printerName, setPrinterName] = useState(loadLabelPrinter)
	const [copies, setCopies] = useState(1)
	const [style, setStyle] = useState<LabelStyle>(loadLabelStyle)

	const printers = useQuery({ ...printersQueryOptions, enabled: open })

	// Une seule interrogation du pilote, à une longueur de référence : elle
	// donne la largeur utile du rouleau ET la marge d'entraînement qu'il
	// retire. Aucune des deux ne se devine, et la longueur, elle, se calcule.
	const probe = useQuery(
		labelPageSizeQueryOptions(
			pb,
			open ? printerName : '',
			DEFAULT_LABEL_LENGTH_MM,
		),
	)

	const media = useMemo(() => {
		if (!probe.data) return null
		const printableLong = Math.max(probe.data.widthMm, probe.data.heightMm)
		return {
			rollWidthMm: Math.min(probe.data.widthMm, probe.data.heightMm),
			feedMarginMm: DEFAULT_LABEL_LENGTH_MM - printableLong,
		}
	}, [probe.data])

	useEffect(() => {
		if (printerName || !printers.data?.length) return
		const brother = printers.data.find((name) => /brother|ql-/i.test(name))
		setPrinterName(brother || printers.data[0])
	}, [printers.data, printerName])

	useEffect(() => {
		saveLabelStyle(style)
	}, [style])

	const layout = useMemo(
		() => (media ? layoutFor(product, style, media.rollWidthMm) : null),
		[product, style, media],
	)

	const preview = useMemo(() => {
		if (!open || !layout) return null
		try {
			return renderLabel(
				product,
				style,
				layout,
				PX_PER_MM * PREVIEW_SUPERSAMPLE,
			)
		} catch (error) {
			console.error('Aperçu étiquette impossible :', error)
			return null
		}
	}, [open, product, style, layout])

	const print = usePrintLabelMutation()

	const handlePrint = async () => {
		if (!layout || !media || !printerName) return
		saveLabelPrinter(printerName)
		await print.mutateAsync({
			image: renderLabel(product, style, layout),
			printerName,
			copies,
			// La longueur DEMANDÉE au pilote comprend son entraînement ; celle
			// que le contenu occupe, non.
			lengthMm: Math.ceil(layout.lengthMm + media.feedMarginMm),
		})
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='flex max-h-[92vh] flex-col gap-3 sm:max-w-3xl'>
				<DialogHeader>
					<DialogTitle>Imprimer une étiquette</DialogTitle>
					<DialogDescription>
						La largeur du rouleau est fixe. Cliquez un élément ou une marge pour
						le régler — la longueur suit, et c’est elle qu’on dépense.
					</DialogDescription>
				</DialogHeader>

				<div className='grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-[auto_minmax(0,1fr)]'>
					<div className='grid content-start gap-2 self-start sm:sticky sm:top-0'>
						<OrientationPicker
							value={style.orientation}
							onChange={(orientation) =>
								setStyle((current) => ({ ...current, orientation }))
							}
						/>

						<div className='flex items-start gap-2 rounded-lg border bg-muted/30 p-2'>
							{layout && preview ? (
								<LabelPreview image={preview} layout={layout} />
							) : (
								<p className='w-40 text-muted-foreground text-sm'>
									{probe.isError
										? 'Format illisible : l’imprimante n’a pas répondu.'
										: printerName
											? 'Lecture du format…'
											: 'Choisissez une imprimante'}
								</p>
							)}
							<FeedArrow />
						</div>

						{layout && media && (
							<p className='text-muted-foreground text-xs'>
								Étiquette {layout.rollWidthMm.toFixed(0)} ×{' '}
								<strong>{layout.lengthMm.toFixed(1)} mm</strong> — coupe à{' '}
								{Math.ceil(layout.lengthMm + media.feedMarginMm)} mm
							</p>
						)}
					</div>

					<div className='grid content-start gap-2'>
						<StylePanels style={style} onChange={setStyle} />

						<div className='grid gap-1'>
							<Label htmlFor='label-printer' className='text-xs'>
								Étiqueteuse
							</Label>
							<Select value={printerName} onValueChange={setPrinterName}>
								<SelectTrigger id='label-printer'>
									<SelectValue placeholder='Choisir une imprimante' />
								</SelectTrigger>
								<SelectContent>
									{(printers.data ?? []).map((name) => (
										<SelectItem key={name} value={name}>
											{name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className='grid gap-1'>
							<Label htmlFor='label-copies' className='text-xs'>
								Exemplaires
							</Label>
							<Input
								id='label-copies'
								type='number'
								min={1}
								max={100}
								value={copies}
								onChange={(event) =>
									setCopies(
										Math.min(100, Math.max(1, Number(event.target.value) || 1)),
									)
								}
							/>
						</div>
					</div>
				</div>

				<DialogFooter className='shrink-0 border-t pt-3'>
					<Button
						type='button'
						variant='outline'
						onClick={() => onOpenChange(false)}
					>
						Annuler
					</Button>
					<Button
						type='button'
						onClick={handlePrint}
						disabled={!layout || !printerName || print.isPending}
					>
						<Printer className='mr-2 h-4 w-4' />
						{print.isPending ? 'Impression…' : 'Imprimer'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

/** Les deux sens, montrés plutôt que nommés : c'est le contenu qui tourne, pas
 *  le rouleau — sa largeur ne change jamais. */
function OrientationPicker({
	value,
	onChange,
}: {
	value: LabelStyle['orientation']
	onChange: (value: LabelStyle['orientation']) => void
}) {
	return (
		<div className='flex gap-2'>
			{[
				{ id: 'normal' as const, label: 'Texte en largeur' },
				{ id: 'rotated' as const, label: 'Texte en longueur' },
			].map((option) => (
				<Button
					key={option.id}
					type='button'
					size='sm'
					variant={value === option.id ? 'default' : 'outline'}
					className='flex-1'
					onClick={() => onChange(option.id)}
				>
					<span
						className={
							option.id === 'rotated'
								? 'mr-2 inline-block rotate-90 font-bold text-[10px] leading-none'
								: 'mr-2 inline-block font-bold text-[10px] leading-none'
						}
					>
						A
					</span>
					{option.label}
				</Button>
			))}
		</div>
	)
}

/** Le sens de déroulement, dessiné à côté de la bande : sans lui, rien ne dit
 *  laquelle des deux dimensions coûte du papier. */
function FeedArrow() {
	return (
		<div className='flex flex-col items-center gap-1 self-stretch pt-6 text-muted-foreground'>
			<ArrowDown className='h-10 w-10' strokeWidth={1.5} />
			<span className='w-16 text-center text-[10px] leading-tight'>
				sens du rouleau
			</span>
		</div>
	)
}

function LabelPreview({
	image,
	layout,
}: {
	image: string
	layout: ReturnType<typeof layoutFor>
}) {
	return (
		<div
			className='relative shrink-0 border bg-white shadow-sm'
			style={{
				width: layout.rollWidthMm * PX_PER_MM,
				height: layout.lengthMm * PX_PER_MM,
			}}
		>
			<img
				src={image}
				alt='Aperçu de l’étiquette'
				className='absolute inset-0 h-full w-full'
			/>
		</div>
	)
}

const BLOCK_LABELS: Record<LabelBlockId, string> = {
	name: 'Désignation',
	price: 'Prix',
	barcode: 'Code-barres',
}

function StylePanels({
	style,
	onChange,
}: {
	style: LabelStyle
	onChange: (updater: (current: LabelStyle) => LabelStyle) => void
}) {
	return (
		<Tabs defaultValue='name'>
			<TabsList className='grid w-full grid-cols-4'>
				<TabsTrigger value='name' className='text-xs'>
					Nom
				</TabsTrigger>
				<TabsTrigger value='price' className='text-xs'>
					Prix
				</TabsTrigger>
				<TabsTrigger value='barcode' className='text-xs'>
					Code-barres
				</TabsTrigger>
				<TabsTrigger value='padding' className='text-xs'>
					Marges
				</TabsTrigger>
			</TabsList>

			{(['name', 'price'] as const).map((id) => (
				<TabsContent key={id} value={id} className='mt-2'>
					<TextBlockPanel id={id} style={style} onChange={onChange} />
				</TabsContent>
			))}

			<TabsContent value='barcode' className='mt-2'>
				<section className='grid gap-1.5 rounded-lg border px-3 py-2'>
					<header className='flex items-center justify-between'>
						<h3 className='font-medium text-sm'>{BLOCK_LABELS.barcode}</h3>
						<Switch
							checked={style.barcode.visible}
							onCheckedChange={(visible) =>
								onChange((c) => ({ ...c, barcode: { ...c.barcode, visible } }))
							}
						/>
					</header>
					<div className='grid grid-cols-3 gap-2'>
						<NumberField
							label='Barres (mm)'
							value={style.barcode.heightMm}
							limits={LABEL_LIMITS.barcodeHeightMm}
							onChange={(heightMm) =>
								onChange((c) => ({ ...c, barcode: { ...c.barcode, heightMm } }))
							}
						/>
						<NumberField
							label='Chiffres (mm)'
							value={style.barcode.textSizeMm}
							limits={LABEL_LIMITS.barcodeTextMm}
							onChange={(textSizeMm) =>
								onChange((c) => ({
									...c,
									barcode: { ...c.barcode, textSizeMm },
								}))
							}
						/>
						<NumberField
							label='Espace après'
							value={style.barcode.gapMm}
							limits={LABEL_LIMITS.gapMm}
							onChange={(gapMm) =>
								onChange((c) => ({ ...c, barcode: { ...c.barcode, gapMm } }))
							}
						/>
					</div>
					<Toggle
						label='Chiffres sous les barres'
						checked={style.barcode.showText}
						onChange={(showText) =>
							onChange((c) => ({ ...c, barcode: { ...c.barcode, showText } }))
						}
					/>
					<p className='text-muted-foreground text-[11px] leading-tight'>
						Des barres très basses se scannent moins bien : vérifiez avec la
						douchette avant d’étiqueter tout un bac.
					</p>
				</section>
			</TabsContent>

			<TabsContent value='padding' className='mt-2'>
				<section className='grid gap-1.5 rounded-lg border px-3 py-2'>
					<h3 className='font-medium text-sm'>Marges (mm)</h3>
					<div className='grid grid-cols-3 gap-2'>
						<NumberField
							label='Avant'
							value={style.padding.start}
							limits={LABEL_LIMITS.paddingMm}
							onChange={(start) =>
								onChange((c) => ({ ...c, padding: { ...c.padding, start } }))
							}
						/>
						<NumberField
							label='Après'
							value={style.padding.end}
							limits={LABEL_LIMITS.paddingMm}
							onChange={(end) =>
								onChange((c) => ({ ...c, padding: { ...c.padding, end } }))
							}
						/>
						<NumberField
							label='Côtés'
							value={style.padding.side}
							limits={LABEL_LIMITS.paddingMm}
							onChange={(side) =>
								onChange((c) => ({ ...c, padding: { ...c.padding, side } }))
							}
						/>
					</div>
					<p className='text-muted-foreground text-[11px] leading-tight'>
						« Avant » et « Après » sont du rouleau consommé. « Côtés » ne coûte
						rien : la largeur est imposée.
					</p>
				</section>
			</TabsContent>
		</Tabs>
	)
}

function TextBlockPanel({
	id,
	style,
	onChange,
}: {
	id: 'name' | 'price'
	style: LabelStyle
	onChange: (updater: (current: LabelStyle) => LabelStyle) => void
}) {
	const block = style[id]

	return (
		<section className='grid gap-1.5 rounded-lg border px-3 py-2'>
			<header className='flex items-center justify-between'>
				<h3 className='font-medium text-sm'>{BLOCK_LABELS[id]}</h3>
				<Switch
					checked={block.visible}
					onCheckedChange={(visible) =>
						onChange((c) => ({ ...c, [id]: { ...c[id], visible } }))
					}
				/>
			</header>
			<div className='grid gap-1 text-xs'>
				<span className='text-muted-foreground'>Police</span>
				<Select
					value={block.fontFamily}
					onValueChange={(fontFamily) =>
						onChange((c) => ({
							...c,
							[id]: { ...c[id], fontFamily: fontFamily as LabelFont },
						}))
					}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{LABEL_FONTS.map((family) => (
							<SelectItem
								key={family}
								value={family}
								style={{ fontFamily: family }}
							>
								{family}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className='grid grid-cols-2 items-end gap-2'>
				<NumberField
					label='Taille (mm)'
					value={block.sizeMm}
					limits={LABEL_LIMITS.fontMm}
					onChange={(sizeMm) =>
						onChange((c) => ({ ...c, [id]: { ...c[id], sizeMm } }))
					}
				/>
				<NumberField
					label='Interlettrage'
					value={block.letterSpacingMm}
					limits={LABEL_LIMITS.letterSpacingMm}
					onChange={(letterSpacingMm) =>
						onChange((c) => ({ ...c, [id]: { ...c[id], letterSpacingMm } }))
					}
				/>
				<NumberField
					label='Espace après'
					value={block.gapMm}
					limits={LABEL_LIMITS.gapMm}
					onChange={(gapMm) =>
						onChange((c) => ({ ...c, [id]: { ...c[id], gapMm } }))
					}
				/>
				<Toggle
					label='Gras'
					checked={block.bold}
					onChange={(bold) =>
						onChange((c) => ({ ...c, [id]: { ...c[id], bold } }))
					}
				/>
			</div>
		</section>
	)
}

function NumberField({
	label,
	value,
	limits,
	onChange,
}: {
	label: string
	value: number
	limits: { min: number; max: number }
	onChange: (value: number) => void
}) {
	return (
		<label className='grid gap-1 text-xs'>
			<span className='text-muted-foreground'>{label}</span>
			<Input
				type='number'
				step={0.1}
				min={limits.min}
				max={limits.max}
				value={value}
				onChange={(event) =>
					onChange(clamp(Number(event.target.value), limits))
				}
			/>
		</label>
	)
}

function Toggle({
	label,
	checked,
	onChange,
}: {
	label: string
	checked: boolean
	onChange: (checked: boolean) => void
}) {
	return (
		<label className='flex items-center justify-between gap-3 text-sm'>
			<span>{label}</span>
			<Switch checked={checked} onCheckedChange={onChange} />
		</label>
	)
}
