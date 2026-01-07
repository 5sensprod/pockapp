// frontend/modules/cash/components/sessions/OpenSessionDialog.tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import {
	DEFAULT_DENOMINATIONS_VALUES,
	DENOMINATIONS,
	type DenominationsForm,
	denominationsSchema,
} from '../types/denominations'

interface OpenSessionDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSubmit: (openingFloat: number) => Promise<void>
	lastKnownFloat: number | null
	lastClosedAtLabel: string | null
	isSubmitting?: boolean
}

export function OpenSessionDialog({
	open,
	onOpenChange,
	onSubmit,
	lastKnownFloat,
	lastClosedAtLabel,
	isSubmitting = false,
}: OpenSessionDialogProps) {
	const [openingOverride, setOpeningOverride] = React.useState<number | null>(
		null,
	)

	const form = useForm<DenominationsForm>({
		resolver: zodResolver(denominationsSchema),
		defaultValues: DEFAULT_DENOMINATIONS_VALUES,
	})

	const watched = form.watch()

	const countedTotal = React.useMemo(() => {
		return DENOMINATIONS.reduce((sum, denom) => {
			const count = watched[denom.key as keyof DenominationsForm] || 0
			return sum + count * denom.value
		}, 0)
	}, [watched])

	const finalAmount = openingOverride ?? countedTotal

	React.useEffect(() => {
		if (!open) {
			setOpeningOverride(null)
			form.reset()
		}
	}, [open, form])

	const handleSubmit = async () => {
		try {
			await onSubmit(finalAmount)
		} catch {
			// géré dans le hook
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!isSubmitting) onOpenChange(v)
			}}
		>
			<DialogContent className='max-w-3xl max-h-[90vh] overflow-y-auto'>
				<DialogHeader>
					<DialogTitle>Ouvrir une session de caisse</DialogTitle>
				</DialogHeader>

				{lastKnownFloat !== null && (
					<div className='flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2'>
						<div className='text-xs text-muted-foreground leading-tight'>
							<div>
								Dernier fond connu :{' '}
								<span className='font-medium text-slate-900'>
									{lastKnownFloat.toFixed(2)} €
								</span>
							</div>

							{lastClosedAtLabel && (
								<div className='text-[11px] text-slate-500'>
									Session clôturée le {lastClosedAtLabel}
								</div>
							)}
						</div>

						<Button
							type='button'
							variant='outline'
							size='sm'
							className='h-7 text-xs'
							onClick={() => setOpeningOverride(lastKnownFloat)}
						>
							Utiliser
						</Button>
					</div>
				)}

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(handleSubmit)}
						className='space-y-6'
					>
						<div>
							<h4 className='font-semibold mb-3 text-sm'>Pièces</h4>
							<div className='grid grid-cols-4 gap-3'>
								{DENOMINATIONS.filter((d) => d.type === 'coin').map((denom) => (
									<FormField
										key={denom.key}
										control={form.control}
										name={denom.key as keyof DenominationsForm}
										render={({ field }) => (
											<FormItem>
												<FormLabel className='text-xs'>{denom.label}</FormLabel>
												<FormControl>
													<Input
														type='number'
														min='0'
														{...field}
														onChange={(e) =>
															field.onChange(
																Number.parseInt(e.target.value) || 0,
															)
														}
														className='text-center'
													/>
												</FormControl>
											</FormItem>
										)}
									/>
								))}
							</div>
						</div>

						<div>
							<h4 className='font-semibold mb-3 text-sm'>Billets</h4>
							<div className='grid grid-cols-5 gap-3'>
								{DENOMINATIONS.filter((d) => d.type === 'bill').map((denom) => (
									<FormField
										key={denom.key}
										control={form.control}
										name={denom.key as keyof DenominationsForm}
										render={({ field }) => (
											<FormItem>
												<FormLabel className='text-xs'>{denom.label}</FormLabel>
												<FormControl>
													<Input
														type='number'
														min='0'
														{...field}
														onChange={(e) =>
															field.onChange(
																Number.parseInt(e.target.value) || 0,
															)
														}
														className='text-center'
													/>
												</FormControl>
											</FormItem>
										)}
									/>
								))}
							</div>
						</div>

						<Card>
							<CardContent className='pt-6 space-y-3 text-sm'>
								<div className='flex justify-between items-center'>
									<span className='font-medium'>Total compté (saisie)</span>
									<span>{formatCurrency(countedTotal)}</span>
								</div>

								<div className='flex justify-between items-center'>
									<span className='font-medium'>
										Total repris (session précédente)
									</span>
									<span>{formatCurrency(openingOverride ?? 0)}</span>
								</div>

								<Separator />

								<div className='flex justify-between font-semibold text-lg'>
									<span>Montant retenu pour l'ouverture</span>
									<span>{formatCurrency(finalAmount)}</span>
								</div>
							</CardContent>
						</Card>

						<div className='flex justify-end gap-2 pt-2'>
							<Button
								type='button'
								variant='outline'
								onClick={() => onOpenChange(false)}
								disabled={isSubmitting}
							>
								Annuler
							</Button>
							<Button type='submit' disabled={isSubmitting}>
								{isSubmitting ? 'Ouverture...' : 'Ouvrir'}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
