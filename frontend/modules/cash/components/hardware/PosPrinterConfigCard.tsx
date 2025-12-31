// frontend/modules/cash/components/PosPrinterConfigCard.tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
	printerKeys,
	printersQueryOptions,
	useOpenCashDrawerMutation,
	useTestPrintMutation,
} from '@/lib/pos/printerQueries'
import {
	loadPosPrinterSettings,
	savePosPrinterSettings,
} from '@/lib/pos/printerSettings'
import {
	type PosPrinterSettings,
	posPrinterSettingsSchema,
} from '@/lib/pos/printerSettings.schema'
import { isWailsEnv } from '@/lib/wails'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Printer, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

export function PosPrinterConfigCard() {
	const queryClient = useQueryClient()
	const isWails = isWailsEnv()

	// React Query pour la liste des imprimantes
	const {
		data: printers = [],
		isLoading,
		refetch,
	} = useQuery({
		...printersQueryOptions,
		enabled: isWails,
	})

	// Mutations pour les tests
	const testPrint = useTestPrintMutation()
	const testDrawer = useOpenCashDrawerMutation()

	// React Hook Form avec Zod
	const form = useForm<PosPrinterSettings>({
		resolver: zodResolver(posPrinterSettingsSchema),
		defaultValues: loadPosPrinterSettings(),
	})

	const { watch, setValue } = form
	const settings = watch()

	// Sélection auto de la première imprimante
	useEffect(() => {
		if (!settings.printerName && printers.length > 0) {
			setValue('printerName', printers[0])
		}
	}, [printers, settings.printerName, setValue])

	// Sauvegarde automatique à chaque changement
	useEffect(() => {
		const subscription = watch((value) => {
			const validated = posPrinterSettingsSchema.safeParse(value)
			if (validated.success) {
				savePosPrinterSettings(validated.data)
			}
		})
		return () => subscription.unsubscribe()
	}, [watch])

	const handleRefresh = () => {
		queryClient.invalidateQueries({ queryKey: printerKeys.lists() })
		refetch()
	}

	const handleTestPrint = () => {
		if (!settings.printerName) return
		testPrint.mutate({
			printerName: settings.printerName,
			width: settings.width,
		})
	}

	const handleTestDrawer = () => {
		testDrawer.mutate()
	}

	return (
		<Card className='border-slate-200'>
			<CardHeader className='pb-3'>
				<div className='flex items-center justify-between'>
					<CardTitle className='text-sm flex items-center gap-2'>
						<Printer className='h-4 w-4' />
						Imprimante POS
					</CardTitle>
					{isWails && (
						<Button
							variant='ghost'
							size='sm'
							onClick={handleRefresh}
							disabled={isLoading}
							className='h-8 px-2'
						>
							<RefreshCw
								className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`}
							/>
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent className='space-y-4 text-sm'>
				{/* Activation */}
				<div className='flex items-center justify-between'>
					<div>
						<div className='font-medium'>Activer l'impression</div>
						<div className='text-xs text-muted-foreground'>
							Tickets et tiroir caisse
						</div>
					</div>
					<input
						type='checkbox'
						checked={settings.enabled}
						onChange={(e) => setValue('enabled', e.target.checked)}
						className='h-4 w-4'
					/>
				</div>

				{!isWails && settings.enabled && (
					<div className='rounded-md bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800'>
						⚠️ L'impression POS nécessite l'application desktop (Wails)
					</div>
				)}

				<Separator />

				{/* Sélection imprimante */}
				<div className='space-y-2'>
					<Label htmlFor='printer-select'>Imprimante</Label>
					{isLoading ? (
						<div className='flex items-center gap-2 h-9 text-muted-foreground'>
							<Loader2 className='h-4 w-4 animate-spin' />
							<span className='text-xs'>Chargement...</span>
						</div>
					) : (
						<select
							id='printer-select'
							className='h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-gray-50 disabled:text-gray-500'
							value={settings.printerName}
							onChange={(e) => setValue('printerName', e.target.value)}
							disabled={!settings.enabled || !isWails}
						>
							<option value=''>-- Sélectionner --</option>
							{printers.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
					)}
					{isWails && printers.length === 0 && !isLoading && (
						<p className='text-xs text-muted-foreground'>
							Aucune imprimante détectée. Vérifiez vos pilotes.
						</p>
					)}
				</div>

				{/* Largeur papier */}
				<div className='space-y-2'>
					<Label htmlFor='width-select'>Largeur papier</Label>
					<select
						id='width-select'
						className='h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-gray-50'
						value={String(settings.width)}
						onChange={(e) =>
							setValue('width', Number(e.target.value) as 58 | 80)
						}
						disabled={!settings.enabled}
					>
						<option value='58'>58 mm</option>
						<option value='80'>80 mm</option>
					</select>
				</div>

				<Separator />

				{/* Options d'impression */}
				<div className='space-y-3'>
					<div className='flex items-center justify-between'>
						<div>
							<div className='font-medium'>Impression automatique</div>
							<div className='text-xs text-muted-foreground'>
								Imprimer après validation
							</div>
						</div>
						<input
							type='checkbox'
							checked={settings.autoPrint}
							onChange={(e) => setValue('autoPrint', e.target.checked)}
							disabled={!settings.enabled}
							className='h-4 w-4'
						/>
					</div>

					<div className='flex items-center justify-between'>
						<div>
							<div className='font-medium'>Ouverture tiroir auto</div>
							<div className='text-xs text-muted-foreground'>
								Pour paiements espèces
							</div>
						</div>
						<input
							type='checkbox'
							checked={settings.autoOpenDrawer}
							onChange={(e) => setValue('autoOpenDrawer', e.target.checked)}
							disabled={!settings.enabled}
							className='h-4 w-4'
						/>
					</div>
				</div>

				<Separator />

				{/* Tests */}
				<div className='flex justify-end gap-2 pt-2'>
					<Button
						variant='outline'
						size='sm'
						disabled={
							!settings.enabled ||
							!settings.printerName ||
							testPrint.isPending ||
							!isWails
						}
						onClick={handleTestPrint}
					>
						{testPrint.isPending ? (
							<>
								<Loader2 className='mr-2 h-3 w-3 animate-spin' />
								Test...
							</>
						) : (
							<>
								<Printer className='mr-2 h-3 w-3' />
								Test ticket
							</>
						)}
					</Button>
					<Button
						variant='outline'
						size='sm'
						disabled={
							!settings.enabled ||
							!settings.printerName ||
							testDrawer.isPending ||
							!isWails
						}
						onClick={handleTestDrawer}
					>
						{testDrawer.isPending ? (
							<>
								<Loader2 className='mr-2 h-3 w-3 animate-spin' />
								Test...
							</>
						) : (
							'Test tiroir'
						)}
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
