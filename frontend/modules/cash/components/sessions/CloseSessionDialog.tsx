// frontend/modules/cash/components/sessions/CloseSessionDialog.tsx
'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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
import { useCloseCashSession, useXReport } from '@/lib/queries/cash'
import type { CashSession } from '@/lib/types/cash.types'
import { formatCurrency } from '@/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2 } from 'lucide-react'
import * as React from 'react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

const denominationsSchema = z.object({
	coins_010: z.number().min(0),
	coins_020: z.number().min(0),
	coins_050: z.number().min(0),
	coins_100: z.number().min(0),
	coins_200: z.number().min(0),
	bills_005: z.number().min(0),
	bills_010: z.number().min(0),
	bills_020: z.number().min(0),
	bills_050: z.number().min(0),
	bills_100: z.number().min(0),
})

type DenominationsForm = z.infer<typeof denominationsSchema>

interface CloseSessionDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	session: CashSession
}

const DENOMINATIONS = [
	{ key: 'coins_010', label: '0,10 €', value: 0.1, type: 'coin' },
	{ key: 'coins_020', label: '0,20 €', value: 0.2, type: 'coin' },
	{ key: 'coins_050', label: '0,50 €', value: 0.5, type: 'coin' },
	{ key: 'coins_100', label: '1,00 €', value: 1, type: 'coin' },
	{ key: 'coins_200', label: '2,00 €', value: 2, type: 'coin' },
	{ key: 'bills_005', label: '5 €', value: 5, type: 'bill' },
	{ key: 'bills_010', label: '10 €', value: 10, type: 'bill' },
	{ key: 'bills_020', label: '20 €', value: 20, type: 'bill' },
	{ key: 'bills_050', label: '50 €', value: 50, type: 'bill' },
	{ key: 'bills_100', label: '100 €', value: 100, type: 'bill' },
] as const

export function CloseSessionDialog({
	open,
	onOpenChange,
	session,
}: CloseSessionDialogProps) {
	const { mutate: closeSession, isPending } = useCloseCashSession()
	const [showConfirm, setShowConfirm] = useState(false)

	// ✅ Source de vérité pour "Espèces attendues" : Rapport X
	const sessionId = session?.id ?? ''
	const {
		data: rapportX,
		isFetching: isFetchingX,
		refetch: refetchX,
	} = useXReport(sessionId)

	React.useEffect(() => {
		if (open && sessionId) {
			void refetchX()
		}
		if (!open) {
			setShowConfirm(false)
			form.reset()
		}
	}, [open, sessionId, refetchX])

	const form = useForm<DenominationsForm>({
		resolver: zodResolver(denominationsSchema),
		defaultValues: {
			coins_010: 0,
			coins_020: 0,
			coins_050: 0,
			coins_100: 0,
			coins_200: 0,
			bills_005: 0,
			bills_010: 0,
			bills_020: 0,
			bills_050: 0,
			bills_100: 0,
		},
	})

	const watchedValues = form.watch()

	const countedTotal = React.useMemo(() => {
		return DENOMINATIONS.reduce((sum, denom) => {
			const count = watchedValues[denom.key as keyof DenominationsForm] || 0
			return sum + count * denom.value
		}, 0)
	}, [watchedValues])

	const expectedCash = React.useMemo(() => {
		// ✅ priorité au rapport X
		const fromX = rapportX?.expected_cash?.total
		if (typeof fromX === 'number' && Number.isFinite(fromX)) return fromX

		// fallback si jamais
		const fromSession = (session as any)?.expected_cash_total
		if (typeof fromSession === 'number' && Number.isFinite(fromSession))
			return fromSession

		// minimum : le fond de caisse
		const openingFloat = (session as any)?.opening_float
		return typeof openingFloat === 'number' && Number.isFinite(openingFloat)
			? openingFloat
			: 0
	}, [rapportX, session])

	const difference = countedTotal - expectedCash
	const isDifferenceHigh = Math.abs(difference) > 10

	const handleFirstSubmit = () => {
		if (isDifferenceHigh) setShowConfirm(true)
		else handleFinalSubmit()
	}

	const handleFinalSubmit = () => {
		closeSession(
			{
				sessionId: session.id,
				cashRegisterId: (session as any).cash_register,
				countedCashTotal: countedTotal,
			},
			{
				onSuccess: () => {
					toast.success('Session fermée avec succès')
					onOpenChange(false)
					form.reset()
					setShowConfirm(false)
				},
				onError: (error: any) => {
					toast.error(`Erreur: ${error?.message ?? 'Fermeture impossible'}`)
				},
			},
		)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-3xl max-h-[90vh] overflow-y-auto'>
				<DialogHeader>
					<DialogTitle>Fermer la session de caisse</DialogTitle>
					<DialogDescription>
						Comptez les espèces présentes dans la caisse
					</DialogDescription>
				</DialogHeader>

				{!showConfirm ? (
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(handleFirstSubmit)}
							className='space-y-6'
						>
							{isFetchingX && (
								<Alert>
									<AlertDescription className='flex items-center gap-2 text-sm'>
										<Loader2 className='h-4 w-4 animate-spin' />
										Mise à jour des espèces attendues…
									</AlertDescription>
								</Alert>
							)}

							{/* Pièces */}
							<div>
								<h4 className='font-semibold mb-3 text-sm'>Pièces</h4>
								<div className='grid grid-cols-5 gap-3'>
									{DENOMINATIONS.filter((d) => d.type === 'coin').map(
										(denom) => (
											<FormField
												key={denom.key}
												control={form.control}
												name={denom.key as keyof DenominationsForm}
												render={({ field }) => (
													<FormItem>
														<FormLabel className='text-xs'>
															{denom.label}
														</FormLabel>
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
										),
									)}
								</div>
							</div>

							{/* Billets */}
							<div>
								<h4 className='font-semibold mb-3 text-sm'>Billets</h4>
								<div className='grid grid-cols-5 gap-3'>
									{DENOMINATIONS.filter((d) => d.type === 'bill').map(
										(denom) => (
											<FormField
												key={denom.key}
												control={form.control}
												name={denom.key as keyof DenominationsForm}
												render={({ field }) => (
													<FormItem>
														<FormLabel className='text-xs'>
															{denom.label}
														</FormLabel>
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
										),
									)}
								</div>
							</div>

							<Card>
								<CardContent className='pt-6 space-y-2 text-sm'>
									<div className='flex justify-between'>
										<span>Espèces attendues :</span>
										<span className='font-medium'>
											{formatCurrency(expectedCash)}
										</span>
									</div>
									<div className='flex justify-between'>
										<span>Espèces comptées :</span>
										<span className='font-medium'>
											{formatCurrency(countedTotal)}
										</span>
									</div>
									<div className='border-t pt-2 flex justify-between font-bold'>
										<span>Écart :</span>
										<span
											className={
												difference === 0 ? 'text-emerald-600' : 'text-red-600'
											}
										>
											{formatCurrency(Math.abs(difference))}
											{difference > 0
												? ' (surplus)'
												: difference < 0
													? ' (manque)'
													: ' (aucun)'}
										</span>
									</div>
								</CardContent>
							</Card>

							<DialogFooter>
								<Button
									variant='outline'
									type='button'
									onClick={() => onOpenChange(false)}
									disabled={isPending}
								>
									Annuler
								</Button>
								<Button type='submit' disabled={isPending}>
									{isPending ? (
										<>
											<Loader2 className='mr-2 h-4 w-4 animate-spin' />
											Fermeture...
										</>
									) : (
										'Fermer la session'
									)}
								</Button>
							</DialogFooter>
						</form>
					</Form>
				) : (
					<div className='space-y-4'>
						<Alert>
							<AlertTriangle className='h-4 w-4' />
							<AlertDescription>
								Écart important détecté ({formatCurrency(Math.abs(difference))}
								). Confirmer la fermeture ?
							</AlertDescription>
						</Alert>

						<Card>
							<CardContent className='pt-6 space-y-2 text-sm'>
								<div className='flex justify-between'>
									<span>Espèces attendues :</span>
									<span className='font-medium'>
										{formatCurrency(expectedCash)}
									</span>
								</div>
								<div className='flex justify-between'>
									<span>Espèces comptées :</span>
									<span className='font-medium'>
										{formatCurrency(countedTotal)}
									</span>
								</div>
								<div className='border-t pt-2 flex justify-between font-bold'>
									<span>Écart :</span>
									<span className='text-red-600'>
										{formatCurrency(Math.abs(difference))}
										{difference > 0 ? ' (surplus)' : ' (manque)'}
									</span>
								</div>
							</CardContent>
						</Card>

						<DialogFooter>
							<Button
								variant='outline'
								onClick={() => setShowConfirm(false)}
								disabled={isPending}
							>
								Recompter
							</Button>
							<Button
								variant='destructive'
								onClick={handleFinalSubmit}
								disabled={isPending}
							>
								{isPending ? (
									<>
										<Loader2 className='mr-2 h-4 w-4 animate-spin' />
										Fermeture...
									</>
								) : (
									'Confirmer la fermeture'
								)}
							</Button>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
