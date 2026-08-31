// frontend/modules/cash/components/sessions/OpenSessionDialog.tsx
//
// COMMENCER LA JOURNÉE — le rituel du matin (E-5, 29 août 2026).
//
// Ce dialogue a été débranché quelques heures, quand la session était totalement
// implicite ; le propriétaire a demandé qu'un geste explicite subsiste le matin.
// Il est REMONTÉ, mais son fonds n'est plus une saisie de mémoire : il est
// PRÉREMPLI avec le tiroir de la veille au soir (backend/reports/fonds_reporte.go)
// et seulement modifiable.
//
// C'est toute la différence avec l'ancienne version : celle-ci proposait un
// champ vide qu'il fallait remplir de tête. C'est cette saisie-là qui a produit
// deux tiroirs négatifs, −154,04 € et −170,24 €
// (frontend/modules/cash/PocketCash-docs/04-refonte-du-z.md §7), et 32 fonds à
// zéro sur 65 sessions.

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
import { useOpenCashDrawerMutation } from '@/lib/pos/printerQueries'
import { formatCurrency } from '@/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Vault } from 'lucide-react'
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
	/** Le fonds proposé pour ce matin — prérempli, modifiable. */
	lastKnownFloat: number | null
	lastClosedAtLabel: string | null
	/**
	 * D'OÙ vient ce fonds. La règle est « le tiroir COMPTÉ, sinon le
	 * THÉORIQUE » (backend/reports/fonds_reporte.go) : quand aucun tiroir n'a
	 * été compté depuis plusieurs jours, le montant proposé est un report
	 * calculé, et l'annoncer « tiroir de la veille » est faux.
	 *
	 * Mesuré le 31 août 2026 : l'écran affichait « tiroir de la veille
	 * 352,38 € » alors que le dernier comptage réel datait du 23 août
	 * (227,68 €) et que huit journées de flux avaient été ajoutées. Le montant
	 * était juste ; le mot ne l'était pas, et le commerçant a conclu à une
	 * erreur de calcul.
	 */
	origineDuFonds?: {
		comptage: number
		jour_du_comptage: string
		flux: number
		jours_de_flux: number
		tiroir_de_la_veille: boolean
	} | null
	isSubmitting?: boolean
}

export function OpenSessionDialog({
	open,
	onOpenChange,
	onSubmit,
	lastKnownFloat,
	lastClosedAtLabel,
	origineDuFonds,
	isSubmitting = false,
}: OpenSessionDialogProps) {
	const [openingOverride, setOpeningOverride] = React.useState<number | null>(
		null,
	)

	const openDrawer = useOpenCashDrawerMutation()
	const handleOpenDrawer = () => {
		openDrawer.mutate()
	}

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

	// Dès qu'une dénomination est saisie, c'est le comptage qui fait foi : on
	// vient de recompter le tiroir, la proposition ne vaut plus.
	const finalAmount = countedTotal > 0 ? countedTotal : (openingOverride ?? 0)

	// À l'ouverture, le fonds de la veille est DÉJÀ retenu : le cas courant est
	// « rien n'a bougé depuis hier soir », et il ne doit demander aucun geste.
	// Recompter reste possible — les dénominations ci-dessous reprennent la main
	// dès qu'on en saisit une.
	React.useEffect(() => {
		if (open) {
			setOpeningOverride(lastKnownFloat)
			return
		}
		setOpeningOverride(null)
		form.reset()
	}, [open, form, lastKnownFloat])

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
				<DialogHeader className='flex-row items-center justify-between gap-4 pr-8'>
					<DialogTitle>Commencer la journée</DialogTitle>
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={handleOpenDrawer}
						disabled={openDrawer.isPending}
						className='h-8 shrink-0'
					>
						{openDrawer.isPending ? (
							<>
								<Loader2 className='h-3.5 w-3.5 mr-2 animate-spin' />
								Ouverture...
							</>
						) : (
							<>
								<Vault className='h-3.5 w-3.5 mr-2' />
								Ouvrir tiroir
							</>
						)}
					</Button>
				</DialogHeader>

				{lastKnownFloat !== null && (
					<div className='flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2'>
						<div className='text-xs text-muted-foreground leading-tight'>
							<div>
								Tiroir de la veille au soir :{' '}
								<span className='font-medium text-slate-900'>
									{lastKnownFloat.toFixed(2)} €
								</span>
							</div>

							{lastClosedAtLabel && (
								<div className='text-[11px] text-slate-500'>
									Dernière clôture le {lastClosedAtLabel}
								</div>
							)}
							<div className='text-[11px] text-slate-500'>
								Retenu par défaut — comptez ci-dessous pour le corriger.
							</div>
						</div>

						<Button
							type='button'
							variant='outline'
							size='sm'
							className='h-7 text-xs'
							onClick={() => {
								form.reset()
								setOpeningOverride(lastKnownFloat)
							}}
						>
							Reprendre
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

								<div className='flex justify-between items-start gap-4'>
									<span className='font-medium'>
										{origineDuFonds?.tiroir_de_la_veille
											? 'Total repris (tiroir compté hier soir)'
											: 'Total repris (report calculé)'}
										{origineDuFonds && !origineDuFonds.tiroir_de_la_veille && (
											<span className='block text-xs font-normal text-muted-foreground mt-0.5'>
												{origineDuFonds.jour_du_comptage
													? `Dernier tiroir compté le ${formatJourCourt(
															origineDuFonds.jour_du_comptage,
														)} : ${formatCurrency(origineDuFonds.comptage)}, plus ${
															origineDuFonds.jours_de_flux
														} journée${
															origineDuFonds.jours_de_flux > 1 ? 's' : ''
														} de mouvements (${
															origineDuFonds.flux >= 0 ? '+' : '−'
														}${formatCurrency(Math.abs(origineDuFonds.flux))}).`
													: "Aucun tiroir n'a jamais été compté : ce report est entièrement théorique."}
											</span>
										)}
									</span>
									<span className='shrink-0'>
										{formatCurrency(openingOverride ?? 0)}
									</span>
								</div>

								<Separator />

								<div className='flex justify-between font-semibold text-lg'>
									<span>Fonds de caisse retenu</span>
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
								{isSubmitting ? 'Ouverture...' : 'Commencer la journée'}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	)
}

// formatJourCourt rend « 23/08 » à partir de « 2026-08-23 ». Pas de `new Date`
// sur une date nue : elle serait lue en UTC et reculerait d'un jour à l'ouest
// de Greenwich.
function formatJourCourt(jour: string): string {
	const [, mois, jourDuMois] = jour.split('-')
	return mois && jourDuMois ? `${jourDuMois}/${mois}` : jour
}
