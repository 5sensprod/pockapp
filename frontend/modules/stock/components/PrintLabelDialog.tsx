// frontend/modules/stock/components/PrintLabelDialog.tsx
//
// « J'ai l'imprimante à côté de moi » : un aperçu, un nombre d'exemplaires,
// un bouton. Le format vient du pilote, la mise en page est figée dans
// `render-product-label.ts`.

import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
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
import {
	DEFAULT_LABEL_LENGTH_MM,
	labelPageSizeQueryOptions,
	loadLabelPrinter,
	saveLabelPrinter,
	usePrintLabelMutation,
} from '@/lib/labels/label-printing'
import {
	type LabelOrientation,
	type LabelProduct,
	measureLabelLengthMm,
	renderProductLabel,
} from '@/lib/labels/render-product-label'
import { printersQueryOptions } from '@/lib/pos/printerQueries'
import { usePocketBase } from '@/lib/use-pocketbase'

/** Les bornes du serveur (`label_print_routes.go`), reprises ici pour que le
 *  champ ne puisse pas proposer ce que la route refusera. */
function clampLength(value: number): number {
	return Math.min(300, Math.max(15, Math.round(value)))
}

type Props = {
	product: LabelProduct
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function PrintLabelDialog({ product, open, onOpenChange }: Props) {
	const pb = usePocketBase()
	const [printerName, setPrinterName] = useState(loadLabelPrinter)
	const [copies, setCopies] = useState(1)
	const [orientation, setOrientation] = useState<LabelOrientation>('horizontal')
	// `null` = la longueur suit le contenu. Un chiffre = l'utilisateur a repris
	// la main et on ne recalcule plus derrière lui.
	const [manualLength, setManualLength] = useState<number | null>(null)

	const printers = useQuery({ ...printersQueryOptions, enabled: open })
	// Première mesure, à une longueur de référence : elle donne la largeur utile
	// du rouleau ET la marge d'entraînement que le pilote retire. Les deux sont
	// nécessaires pour convertir « longueur de contenu » en « longueur de
	// coupe », et aucune des deux ne se devine.
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

	const autoLength = useMemo(() => {
		if (!media) return DEFAULT_LABEL_LENGTH_MM
		const content = measureLabelLengthMm(
			product,
			media.rollWidthMm,
			orientation,
		)
		return clampLength(Math.ceil(content + media.feedMarginMm))
	}, [product, media, orientation])

	const lengthMm = manualLength ?? autoLength

	const pageSize = useQuery(
		labelPageSizeQueryOptions(pb, open ? printerName : '', lengthMm),
	)
	const print = usePrintLabelMutation()

	// Premier usage : rien n'est mémorisé, on propose l'étiqueteuse s'il y en a
	// une reconnaissable, sinon la première imprimante de la liste.
	useEffect(() => {
		if (printerName || !printers.data?.length) return
		const brother = printers.data.find((name) => /brother|ql-/i.test(name))
		setPrinterName(brother || printers.data[0])
	}, [printers.data, printerName])

	const preview = useMemo(() => {
		if (!open || !pageSize.data) return null
		try {
			return renderProductLabel(product, pageSize.data, orientation)
		} catch (error) {
			console.error('Aperçu étiquette impossible :', error)
			return null
		}
	}, [open, product, pageSize.data, orientation])

	const handlePrint = async () => {
		if (!preview || !printerName) return
		saveLabelPrinter(printerName)
		await print.mutateAsync({ image: preview, printerName, copies, lengthMm })
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Imprimer une étiquette</DialogTitle>
					<DialogDescription>
						Nom, prix TTC et code-barres, au format réglé dans le pilote de
						l’étiqueteuse.
					</DialogDescription>
				</DialogHeader>

				<div className='grid gap-4'>
					<div className='grid gap-2'>
						<Label htmlFor='label-printer'>Étiqueteuse</Label>
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

					<div className='grid gap-2'>
						<div className='flex items-center justify-between'>
							<Label htmlFor='label-length'>Longueur de coupe (mm)</Label>
							{manualLength !== null && (
								<Button
									type='button'
									variant='link'
									className='h-auto p-0 text-xs'
									onClick={() => setManualLength(null)}
								>
									Ajuster au contenu
								</Button>
							)}
						</div>
						<Input
							id='label-length'
							type='number'
							min={15}
							max={300}
							step={1}
							value={lengthMm}
							onChange={(event) =>
								setManualLength(clampLength(Number(event.target.value) || 15))
							}
						/>
						<p className='text-muted-foreground text-xs'>
							{manualLength === null
								? 'Calculée d’après le contenu — le rouleau est continu, la coupe suit.'
								: `Longueur imposée. Le contenu en demande ${autoLength} mm.`}
						</p>
					</div>

					<div className='grid gap-2'>
						<Label htmlFor='label-copies'>Exemplaires</Label>
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

					<div className='grid gap-2'>
						<Label htmlFor='label-orientation'>Sens</Label>
						<Select
							value={orientation}
							onValueChange={(value) =>
								setOrientation(value as LabelOrientation)
							}
						>
							<SelectTrigger id='label-orientation'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='horizontal'>
									Horizontal — dans la longueur
								</SelectItem>
								<SelectItem value='vertical'>Vertical — en travers</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className='grid gap-2'>
						<Label>Aperçu</Label>
						<div className='flex items-center justify-center rounded-md border bg-muted/30 p-3'>
							{pageSize.isError ? (
								<p className='text-muted-foreground text-sm'>
									Format illisible : l’imprimante n’a pas répondu.
								</p>
							) : preview ? (
								<img
									src={preview}
									alt='Aperçu de l’étiquette'
									// L'aperçu montre la page telle qu'elle sort : un
									// contenu en travers s'y voit en travers.
									className='max-h-28 w-auto'
								/>
							) : (
								<p className='text-muted-foreground text-sm'>
									{printerName
										? 'Lecture du format…'
										: 'Choisissez une imprimante'}
								</p>
							)}
						</div>
						{pageSize.data && (
							<p className='text-muted-foreground text-xs'>
								Média : {pageSize.data.widthMm.toFixed(0)} ×{' '}
								{pageSize.data.heightMm.toFixed(0)} mm
							</p>
						)}
					</div>
				</div>

				<DialogFooter>
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
						disabled={!preview || !printerName || print.isPending}
					>
						<Printer className='mr-2 h-4 w-4' />
						{print.isPending ? 'Impression…' : 'Imprimer'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
