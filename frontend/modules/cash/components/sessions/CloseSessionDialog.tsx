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
import { useOpenCashDrawerMutation } from '@/lib/pos/printerQueries'
import {
	useCashSessionHistory,
	useCloseCashSession,
	useXReport,
	useZReportCheck,
} from '@/lib/queries/cash'
import type { CashSession } from '@/lib/types/cash.types'
import { formatCurrency } from '@/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, FileCheck2, Loader2, Vault } from 'lucide-react'
import * as React from 'react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import {
	DEFAULT_DENOMINATIONS_VALUES,
	DENOMINATIONS,
	type DenominationsForm,
	denominationsSchema,
} from '../types/denominations'

interface CloseSessionDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	session: CashSession
}

export function CloseSessionDialog({
	open,
	onOpenChange,
	session,
}: CloseSessionDialogProps) {
	const navigate = useNavigate()
	const { mutate: closeSession, isPending } = useCloseCashSession()
	const [showConfirm, setShowConfirm] = useState(false)
	// 🆕 Mémorise l'intention de l'utilisateur : fermer simplement la session,
	// ou la fermer puis générer/afficher directement le rapport Z du jour.
	const [pendingAction, setPendingAction] = useState<'close' | 'closeAndZ'>(
		'close',
	)
	const [isGeneratingZRedirect, setIsGeneratingZRedirect] = useState(false)
	const openDrawer = useOpenCashDrawerMutation()
	const handleOpenDrawer = () => {
		openDrawer.mutate()
	}

	// ✅ Source de vérité pour "Espèces attendues" : Rapport X
	const sessionId = session?.id ?? ''
	const cashRegisterId = (session as any)?.cash_register ?? ''
	const {
		data: rapportX,
		isFetching: isFetchingX,
		refetch: refetchX,
	} = useXReport(sessionId)

	// 🆕 Sessions encore ouvertes sur cette même caisse. Le Z regroupe TOUTES
	// les sessions clôturées d'une journée pour une caisse : s'il reste une
	// autre session ouverte (poste partagé), on ne peut pas le générer encore.
	const { data: openSessionsOnRegister, isFetching: isFetchingOpenSessions } =
		useCashSessionHistory({
			cashRegisterId: cashRegisterId || undefined,
			status: 'open',
		})

	const otherOpenSessionsCount = React.useMemo(() => {
		return (openSessionsOnRegister ?? []).filter((s) => s.id !== sessionId)
			.length
	}, [openSessionsOnRegister, sessionId])

	// 🆕 Date comptable de la session (jour d'ouverture), utilisée à la fois
	// pour vérifier l'existence d'un Z et pour la redirection après clôture.
	// ⚠️ PocketBase sérialise les dates avec un ESPACE ("2026-06-18 20:11:50.244Z"),
	// pas toujours avec un "T" ISO standard — on gère donc les deux séparateurs.
	const sessionDate = React.useMemo(() => {
		const openedAt = (session as any)?.opened_at as string | undefined
		if (!openedAt) return new Date().toISOString().split('T')[0]
		// Découpe sur le premier caractère non numérique/tiret rencontré après
		// le bloc YYYY-MM-DD (espace OU "T"), de façon robuste aux deux formats.
		const match = openedAt.match(/^(\d{4}-\d{2}-\d{2})/)
		return match ? match[1] : openedAt.split(/[T ]/)[0]
	}, [session])

	// 🆕 Un Z existe-t-il déjà pour cette caisse à cette date ? Le Z, une fois
	// généré, est verrouillé (NF525) : les ventes d'une session fermée après
	// coup ne peuvent plus y être intégrées. On bloque donc en amont plutôt
	// que de fermer la session pour rien.
	const { data: zCheckResult, isFetching: isFetchingZCheck } = useZReportCheck(
		cashRegisterId,
		sessionDate,
		{ enabled: !!cashRegisterId && !!sessionDate },
	)
	const zAlreadyExistsForToday = !!zCheckResult?.exists

	const canGenerateZAfterClose =
		otherOpenSessionsCount === 0 && !zAlreadyExistsForToday
	const isCheckingZEligibility = isFetchingOpenSessions || isFetchingZCheck

	const form = useForm<DenominationsForm>({
		resolver: zodResolver(denominationsSchema),
		defaultValues: DEFAULT_DENOMINATIONS_VALUES,
	})

	React.useEffect(() => {
		if (open && sessionId) void refetchX()
		if (!open) {
			setShowConfirm(false)
			setPendingAction('close')
			setIsGeneratingZRedirect(false)
			form.reset()
		}
	}, [open, sessionId, refetchX, form])

	const watchedValues = form.watch()

	const countedTotal = React.useMemo(() => {
		return DENOMINATIONS.reduce((sum, denom) => {
			const count = watchedValues[denom.key as keyof DenominationsForm] || 0
			return sum + count * denom.value
		}, 0)
	}, [watchedValues])

	const expectedCash = React.useMemo(() => {
		const fromX = rapportX?.expected_cash?.total
		if (typeof fromX === 'number' && Number.isFinite(fromX)) return fromX

		const fromSession = (session as any)?.expected_cash_total
		if (typeof fromSession === 'number' && Number.isFinite(fromSession))
			return fromSession

		const openingFloat = (session as any)?.opening_float
		return typeof openingFloat === 'number' && Number.isFinite(openingFloat)
			? openingFloat
			: 0
	}, [rapportX, session])

	const difference = countedTotal - expectedCash
	const isDifferenceHigh = Math.abs(difference) > 10

	const handleFirstSubmit = () => {
		// 🆕 Garde-fou : si l'utilisateur a choisi "Clôturer et générer le Z"
		// mais qu'un Z existe déjà pour cette caisse aujourd'hui (ou qu'une
		// autre session est encore ouverte), on bloque AVANT de fermer la
		// session — un Z déjà généré est verrouillé (NF525) et ne pourra
		// jamais inclure les ventes de cette session après coup.
		if (pendingAction === 'closeAndZ' && !canGenerateZAfterClose) {
			if (zAlreadyExistsForToday) {
				toast.error(
					"Un rapport Z existe déjà pour cette caisse aujourd'hui. " +
						'La session ne peut pas être ajoutée à un Z déjà verrouillé. ' +
						'Fermez la session normalement avec "Fermer la session" si besoin.',
				)
			} else {
				toast.error(
					"D'autres sessions de cette caisse sont encore ouvertes aujourd'hui : " +
						'le Z ne peut pas encore être généré.',
				)
			}
			return
		}

		if (isDifferenceHigh) setShowConfirm(true)
		else handleFinalSubmit()
	}

	const handleFinalSubmit = () => {
		const action = pendingAction
		closeSession(
			{
				sessionId: session.id,
				cashRegisterId: (session as any).cash_register,
				countedCashTotal: countedTotal,
			},
			{
				onSuccess: () => {
					form.reset()
					setShowConfirm(false)

					if (action === 'closeAndZ') {
						toast.success('Session fermée — génération du Z…')
						setIsGeneratingZRedirect(true)

						// 🔧 On navigue AVANT de fermer la modale : fermer la modale
						// déclenche un re-render de CashModuleShell qui démonte ce
						// composant (cash.activeSession devient null), ce qui peut
						// interrompre l'appel navigate() s'il est passé après.
						navigate({
							to: '/cash/rapport-z',
							search: () => ({
								register: (session as any).cash_register,
								date: sessionDate,
								autoGenerate: true,
							}),
						}).finally(() => {
							onOpenChange(false)
						})
						return
					}

					toast.success('Session fermée avec succès')
					onOpenChange(false)
				},
				onError: (error: any) => {
					setIsGeneratingZRedirect(false)
					toast.error(`Erreur: ${error?.message ?? 'Fermeture impossible'}`)
				},
			},
		)
	}

	const handleCloseOnly = () => {
		setPendingAction('close')
		handleFirstSubmit()
	}

	const handleCloseAndGenerateZ = () => {
		setPendingAction('closeAndZ')
		handleFirstSubmit()
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-3xl max-h-[90vh] overflow-y-auto'>
				<DialogHeader className='flex-row items-center justify-between gap-4 pr-8'>
					<div>
						<DialogTitle>Fermer la session de caisse</DialogTitle>
						<DialogDescription>
							Comptez les espèces présentes dans la caisse
						</DialogDescription>
					</div>
					{!showConfirm && (
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
					)}
				</DialogHeader>

				{!showConfirm ? (
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(handleCloseOnly)}
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
								<div className='grid grid-cols-4 gap-3'>
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

							{!canGenerateZAfterClose && !isCheckingZEligibility && (
								<Alert>
									<AlertDescription className='text-xs text-muted-foreground'>
										{zAlreadyExistsForToday ? (
											<>
												Un rapport Z existe déjà pour cette caisse aujourd'hui :
												il est verrouillé et ne peut plus inclure de nouvelle
												session. Le bouton "Clôturer et générer le Z" est
												désactivé.
											</>
										) : (
											<>
												{otherOpenSessionsCount} autre
												{otherOpenSessionsCount > 1 ? 's' : ''} session
												{otherOpenSessionsCount > 1 ? 's' : ''} encore ouverte
												{otherOpenSessionsCount > 1 ? 's' : ''} sur cette caisse
												aujourd'hui : le Z ne peut pas encore être généré.
											</>
										)}
									</AlertDescription>
								</Alert>
							)}

							<DialogFooter className='flex-wrap gap-2'>
								<Button
									variant='outline'
									type='button'
									onClick={() => onOpenChange(false)}
									disabled={isPending}
								>
									Annuler
								</Button>
								<Button
									type='button'
									variant='secondary'
									onClick={form.handleSubmit(handleCloseOnly)}
									disabled={isPending}
								>
									{isPending && pendingAction === 'close' ? (
										<>
											<Loader2 className='mr-2 h-4 w-4 animate-spin' />
											Fermeture...
										</>
									) : (
										'Fermer la session'
									)}
								</Button>
								<Button
									type='button'
									onClick={form.handleSubmit(handleCloseAndGenerateZ)}
									disabled={
										isPending ||
										isCheckingZEligibility ||
										!canGenerateZAfterClose
									}
									title={
										zAlreadyExistsForToday
											? "Un rapport Z existe déjà pour cette caisse aujourd'hui"
											: !canGenerateZAfterClose
												? "D'autres sessions de cette caisse sont encore ouvertes aujourd'hui"
												: undefined
									}
								>
									{isPending && pendingAction === 'closeAndZ' ? (
										<>
											<Loader2 className='mr-2 h-4 w-4 animate-spin' />
											{isGeneratingZRedirect
												? 'Génération du Z...'
												: 'Fermeture...'}
										</>
									) : isCheckingZEligibility ? (
										<>
											<Loader2 className='mr-2 h-4 w-4 animate-spin' />
											Vérification...
										</>
									) : (
										<>
											<FileCheck2 className='mr-2 h-4 w-4' />
											Clôturer et générer le Z
										</>
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
								disabled={
									isPending ||
									(pendingAction === 'closeAndZ' && !canGenerateZAfterClose)
								}
							>
								{isPending ? (
									<>
										<Loader2 className='mr-2 h-4 w-4 animate-spin' />
										{pendingAction === 'closeAndZ' && isGeneratingZRedirect
											? 'Génération du Z...'
											: 'Fermeture...'}
									</>
								) : pendingAction === 'closeAndZ' ? (
									<>
										<FileCheck2 className='mr-2 h-4 w-4' />
										Confirmer et générer le Z
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
