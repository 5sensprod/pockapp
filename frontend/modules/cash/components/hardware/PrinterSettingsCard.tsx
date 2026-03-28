// frontend/modules/cash/components/hardware/PrinterSettingsCard.tsx
//
// Contenu de PosPrinterConfigCard intégré directement — plus de Dialog.
// Style Stitch : featured card, toggle inline, selects flat, checkboxes custom.

import { ModuleCard } from '@/components/module-ui'
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

export function PrinterSettingsCard() {
	const queryClient = useQueryClient()
	const isWails = isWailsEnv()

	const {
		data: printers = [],
		isLoading,
		refetch,
	} = useQuery({
		...printersQueryOptions,
		enabled: true,
	})

	const testPrint = useTestPrintMutation()
	const testDrawer = useOpenCashDrawerMutation()

	const form = useForm<PosPrinterSettings>({
		resolver: zodResolver(posPrinterSettingsSchema),
		defaultValues: loadPosPrinterSettings(),
	})

	const { watch, setValue } = form
	const settings = watch()

	// Sélection auto première imprimante
	useEffect(() => {
		if (!settings.printerName && printers.length > 0) {
			setValue('printerName', printers[0])
		}
	}, [printers, settings.printerName, setValue])

	// Sauvegarde auto
	useEffect(() => {
		const subscription = watch((value) => {
			const validated = posPrinterSettingsSchema.safeParse(value)
			if (validated.success) savePosPrinterSettings(validated.data)
		})
		return () => subscription.unsubscribe()
	}, [watch])

	const handleRefresh = () => {
		queryClient.invalidateQueries({ queryKey: printerKeys.lists() })
		refetch()
	}

	// Toggle header — style Stitch
	const headerRight = (
		<div className='flex items-center gap-2'>
			<button
				type='button'
				onClick={handleRefresh}
				disabled={isLoading}
				className='text-muted-foreground hover:text-primary transition-colors p-1 rounded'
				aria-label='Actualiser'
			>
				<RefreshCw
					className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
				/>
			</button>
			{/* Toggle Stitch */}
			<label className='relative inline-flex items-center cursor-pointer gap-2'>
				<div className='relative'>
					<input
						type='checkbox'
						className='sr-only peer'
						checked={settings.enabled}
						onChange={(e) => setValue('enabled', e.target.checked)}
					/>
					<div
						className='w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors
            after:content-[""] after:absolute after:top-[2px] after:left-[2px]
            after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all
            peer-checked:after:translate-x-4'
					/>
				</div>
				<span className='text-[11px] text-muted-foreground'>
					{settings.enabled ? 'Activée' : 'Désactivée'}
				</span>
			</label>
		</div>
	)

	return (
		<ModuleCard
			icon={Printer}
			title='Imprimante de caisse'
			headerRight={headerRight}
			featured
		>
			<div className='space-y-5'>
				{/* Info web sans imprimante */}
				{!isWails &&
					settings.enabled &&
					printers.length === 0 &&
					!isLoading && (
						<div className='rounded-lg bg-primary/5 border border-primary/10 p-3 text-xs text-primary'>
							Les imprimantes doivent être installées sur le PC serveur.
						</div>
					)}

				{/* Sélects côte à côte — style Stitch grid */}
				<div className='grid grid-cols-2 gap-4'>
					<div className='space-y-1.5'>
						<Label className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium'>
							Imprimante
						</Label>
						{isLoading ? (
							<div className='flex items-center gap-2 h-9 text-muted-foreground'>
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
								<span className='text-xs'>Chargement...</span>
							</div>
						) : (
							<select
								className='w-full h-9 rounded-lg bg-muted/50 border-0 px-3 text-sm
                  focus:ring-1 focus:ring-primary focus:bg-card transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed text-foreground'
								value={settings.printerName}
								onChange={(e) => setValue('printerName', e.target.value)}
								disabled={!settings.enabled}
							>
								<option value=''>-- Sélectionner --</option>
								{printers.map((name) => (
									<option key={name} value={name}>
										{name}
									</option>
								))}
							</select>
						)}
					</div>

					<div className='space-y-1.5'>
						<Label className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium'>
							Largeur papier
						</Label>
						<select
							className='w-full h-9 rounded-lg bg-muted/50 border-0 px-3 text-sm
                focus:ring-1 focus:ring-primary focus:bg-card transition-all
                disabled:opacity-50 disabled:cursor-not-allowed text-foreground'
							value={String(settings.width)}
							onChange={(e) =>
								setValue('width', Number(e.target.value) as 58 | 80)
							}
							disabled={!settings.enabled}
						>
							<option value='58'>58 mm</option>
							<option value='80'>80 mm (Standard)</option>
						</select>
					</div>
				</div>

				<Separator className='opacity-50' />

				{/* Checkboxes — style Stitch */}
				<div className='rounded-lg bg-muted/30 p-4 space-y-3'>
					<label className='flex items-center gap-3 cursor-pointer group'>
						<input
							type='checkbox'
							className='w-4 h-4 rounded border-border text-primary focus:ring-primary/20'
							checked={settings.autoPrint}
							onChange={(e) => setValue('autoPrint', e.target.checked)}
							disabled={!settings.enabled}
						/>
						<span className='text-sm text-foreground group-hover:text-primary transition-colors'>
							Impression automatique après validation
						</span>
					</label>
					<label className='flex items-center gap-3 cursor-pointer group'>
						<input
							type='checkbox'
							className='w-4 h-4 rounded border-border text-primary focus:ring-primary/20'
							checked={settings.autoOpenDrawer}
							onChange={(e) => setValue('autoOpenDrawer', e.target.checked)}
							disabled={!settings.enabled}
						/>
						<span className='text-sm text-foreground group-hover:text-primary transition-colors'>
							Ouverture automatique du tiroir-caisse
						</span>
					</label>
				</div>

				{/* Boutons test */}
				<div className='flex gap-2 justify-end'>
					<button
						type='button'
						disabled={
							!settings.enabled || !settings.printerName || testDrawer.isPending
						}
						onClick={() => testDrawer.mutate()}
						className='inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium
              text-muted-foreground border border-border/50
              hover:text-foreground hover:border-border hover:bg-muted/30
              disabled:opacity-40 disabled:cursor-not-allowed transition-all'
					>
						{testDrawer.isPending ? (
							<Loader2 className='h-3 w-3 animate-spin' />
						) : null}
						Test tiroir
					</button>
					<button
						type='button'
						disabled={
							!settings.enabled || !settings.printerName || testPrint.isPending
						}
						onClick={() =>
							testPrint.mutate({
								printerName: settings.printerName,
								width: settings.width,
							})
						}
						className='inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium
              text-primary bg-primary/5 border border-primary/20
              hover:bg-primary/10 hover:border-primary/30
              disabled:opacity-40 disabled:cursor-not-allowed transition-all'
					>
						{testPrint.isPending ? (
							<Loader2 className='h-3 w-3 animate-spin' />
						) : (
							<Printer className='h-3 w-3' />
						)}
						Tester l'impression
					</button>
				</div>
			</div>
		</ModuleCard>
	)
}
