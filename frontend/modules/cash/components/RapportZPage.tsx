// frontend/modules/cash/components/RapportZPage.tsx
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useCashRegisters, useZReport } from '@/lib/queries/cash'
import type { RapportZ } from '@/lib/types/cash.types'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

export function RapportZPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()

	// Sélection caisse et date
	const [selectedRegisterId, setSelectedRegisterId] = useState<string>('')
	const [selectedDate, setSelectedDate] = useState<string>(
		new Date().toISOString().split('T')[0], // Aujourd'hui par défaut
	)

	// Charger les caisses
	const { data: registers, isLoading: isLoadingRegisters } = useCashRegisters(
		activeCompanyId ?? undefined,
	)

	// Charger le rapport Z
	const {
		data: rapportZ,
		isLoading: isLoadingRapport,
		refetch,
		isError,
	} = useZReport(selectedRegisterId, selectedDate, {
		enabled: !!selectedRegisterId && !!selectedDate,
	})

	const handleGenerate = () => {
		if (!selectedRegisterId) {
			toast.error('Veuillez sélectionner une caisse')
			return
		}
		if (!selectedDate) {
			toast.error('Veuillez sélectionner une date')
			return
		}
		refetch()
	}

	const handlePrint = () => {
		window.print()
	}

	const handleExport = () => {
		// TODO: Exporter en PDF
		toast.info('Export PDF en cours de développement')
	}

	return (
		<div className='container mx-auto px-6 py-8 max-w-5xl'>
			{/* Header */}
			<div className='flex items-center justify-between mb-6'>
				<div className='flex items-center gap-3'>
					<Button
						variant='ghost'
						size='icon'
						onClick={() => navigate({ to: '/cash' })}
					>
						<ArrowLeft className='h-5 w-5' />
					</Button>
					<div>
						<h1 className='text-2xl font-semibold'>
							Rapport Z - Clôture Journalière
						</h1>
						<p className='text-sm text-muted-foreground'>
							Agrégation de toutes les sessions fermées sur une journée
						</p>
					</div>
				</div>

				{rapportZ && (
					<div className='flex gap-2'>
						<Button variant='outline' size='sm' onClick={handlePrint}>
							<Printer className='h-4 w-4 mr-2' />
							Imprimer
						</Button>
						<Button variant='outline' size='sm' onClick={handleExport}>
							<Download className='h-4 w-4 mr-2' />
							Export PDF
						</Button>
					</div>
				)}
			</div>

			{/* Sélection */}
			<Card className='mb-6'>
				<CardHeader>
					<CardTitle className='text-base'>Sélection</CardTitle>
					<CardDescription>
						Choisissez la caisse et la date pour générer le rapport Z
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='grid grid-cols-3 gap-4'>
						<div className='space-y-2'>
							<Label htmlFor='register'>Caisse</Label>
							<select
								id='register'
								className='w-full h-10 rounded-md border bg-white px-3 text-sm'
								value={selectedRegisterId}
								onChange={(e) => setSelectedRegisterId(e.target.value)}
								disabled={isLoadingRegisters}
							>
								<option value=''>Sélectionner une caisse</option>
								{registers?.map((reg) => (
									<option key={reg.id} value={reg.id}>
										{reg.code ? `${reg.code} — ${reg.name}` : reg.name}
									</option>
								))}
							</select>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='date'>Date</Label>
							<Input
								id='date'
								type='date'
								value={selectedDate}
								onChange={(e) => setSelectedDate(e.target.value)}
							/>
						</div>

						<div className='flex items-end'>
							<Button
								onClick={handleGenerate}
								disabled={
									!selectedRegisterId || !selectedDate || isLoadingRapport
								}
								className='w-full'
							>
								{isLoadingRapport ? 'Génération...' : 'Générer le rapport'}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Erreur */}
			{isError && (
				<Card className='border-destructive'>
					<CardContent className='pt-6'>
						<p className='text-sm text-destructive'>
							Aucune session fermée trouvée pour cette date. Veuillez vérifier
							la caisse et la date sélectionnées.
						</p>
					</CardContent>
				</Card>
			)}

			{/* Rapport Z */}
			{rapportZ && (
				<div className='space-y-6'>
					{/* Entête du rapport */}
					<Card>
						<CardHeader>
							<div className='flex items-center justify-between'>
								<div>
									<CardTitle>
										Rapport Z — {rapportZ.cash_register.name}
									</CardTitle>
									<CardDescription>
										{rapportZ.cash_register.code && (
											<span>Code: {rapportZ.cash_register.code} • </span>
										)}
										Date:{' '}
										{new Date(rapportZ.date).toLocaleDateString('fr-FR', {
											weekday: 'long',
											day: 'numeric',
											month: 'long',
											year: 'numeric',
										})}
									</CardDescription>
								</div>
								<div className='text-right'>
									<div className='text-xs text-muted-foreground'>Généré le</div>
									<div className='text-sm font-medium'>
										{formatDateTime(rapportZ.generated_at)}
									</div>
								</div>
							</div>
						</CardHeader>
					</Card>

					{/* Résumé global */}
					<Card>
						<CardHeader>
							<CardTitle className='text-base'>Résumé de la journée</CardTitle>
						</CardHeader>
						<CardContent className='space-y-4'>
							<div className='grid grid-cols-4 gap-4'>
								<div>
									<div className='text-xs text-muted-foreground'>
										Nombre de sessions
									</div>
									<div className='text-2xl font-bold'>
										{rapportZ.daily_totals.sessions_count}
									</div>
								</div>
								<div>
									<div className='text-xs text-muted-foreground'>
										Tickets vendus
									</div>
									<div className='text-2xl font-bold'>
										{rapportZ.daily_totals.invoice_count}
									</div>
								</div>
								<div>
									<div className='text-xs text-muted-foreground'>
										Chiffre d'affaires TTC
									</div>
									<div className='text-2xl font-bold text-emerald-600'>
										{formatCurrency(rapportZ.daily_totals.total_ttc)}
									</div>
								</div>
								<div>
									<div className='text-xs text-muted-foreground'>
										Écart total de caisse
									</div>
									<div
										className={`text-2xl font-bold ${
											Math.abs(rapportZ.daily_totals.total_cash_difference) > 10
												? 'text-destructive'
												: 'text-emerald-600'
										}`}
									>
										{formatCurrency(
											rapportZ.daily_totals.total_cash_difference,
										)}
									</div>
								</div>
							</div>

							<Separator />

							<div>
								<div className='text-sm font-medium mb-3'>
									Répartition par moyen de paiement
								</div>
								<div className='space-y-2'>
									{Object.entries(rapportZ.daily_totals.by_method).map(
										([method, amount]) => (
											<div
												key={method}
												className='flex justify-between text-sm'
											>
												<span className='capitalize text-muted-foreground'>
													{method === 'especes'
														? 'Espèces'
														: method === 'cb'
															? 'Carte bancaire'
															: method === 'cheque'
																? 'Chèque'
																: method}
												</span>
												<span className='font-medium'>
													{formatCurrency(amount as number)}
												</span>
											</div>
										),
									)}
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Détail des sessions */}
					{/* Détail des sessions */}
					<Card>
						<CardHeader>
							<CardTitle className='text-base'>
								Détail des sessions ({rapportZ.sessions.length})
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className='space-y-4'>
								{rapportZ.sessions.map(
									(session: RapportZ['sessions'][0], index: number) => (
										<div
											key={session.id}
											className='p-4 border rounded-lg space-y-3'
										>
											{/* En-tête session */}
											<div className='flex items-center justify-between'>
												<div>
													<div className='font-medium'>
														Session #{index + 1}
													</div>
													<div className='text-xs text-muted-foreground'>
														{formatDateTime(session.opened_at)} →{' '}
														{formatDateTime(session.closed_at)}
													</div>
												</div>
												<div className='text-right'>
													<div className='text-sm font-medium'>
														{session.invoice_count} tickets
													</div>
													<div className='text-lg font-bold text-emerald-600'>
														{formatCurrency(session.total_ttc)}
													</div>
												</div>
											</div>

											{/* ✅ AJOUTER : Détails espèces */}
											<div className='grid grid-cols-2 gap-3 text-sm bg-slate-50 p-3 rounded'>
												<div>
													<div className='text-xs text-muted-foreground'>
														Fond de caisse
													</div>
													<div className='font-medium'>
														{formatCurrency(session.opening_float)}
													</div>
												</div>
												<div>
													<div className='text-xs text-muted-foreground'>
														Espèces attendues
													</div>
													<div className='font-medium'>
														{formatCurrency(session.expected_cash_total)}
													</div>
												</div>
												<div>
													<div className='text-xs text-muted-foreground'>
														Espèces comptées
													</div>
													<div className='font-medium'>
														{formatCurrency(session.counted_cash_total)}
													</div>
												</div>
												<div>
													<div className='text-xs text-muted-foreground'>
														Écart
													</div>
													<div
														className={`font-medium ${
															Math.abs(session.cash_difference) > 10
																? 'text-destructive'
																: 'text-emerald-600'
														}`}
													>
														{formatCurrency(session.cash_difference)}
													</div>
												</div>
											</div>

											{/* ✅ AJOUTER : Répartition par méthode */}
											{session.totals_by_method &&
												Object.keys(session.totals_by_method).length > 0 && (
													<div className='text-sm'>
														<div className='text-xs text-muted-foreground mb-2'>
															Répartition par moyen de paiement
														</div>
														<div className='grid grid-cols-3 gap-2'>
															{Object.entries(session.totals_by_method).map(
																([method, amount]) => (
																	<div
																		key={method}
																		className='flex justify-between'
																	>
																		<span className='capitalize text-muted-foreground'>
																			{method === 'especes'
																				? 'Espèces'
																				: method === 'cb'
																					? 'CB'
																					: method === 'cheque'
																						? 'Chèque'
																						: method}
																		</span>
																		<span className='font-medium'>
																			{formatCurrency(amount as number)}
																		</span>
																	</div>
																),
															)}
														</div>
													</div>
												)}
										</div>
									),
								)}
							</div>
						</CardContent>
					</Card>

					{/* Note de verrouillage */}
					<Card className='border-amber-200 bg-amber-50'>
						<CardContent className='pt-6'>
							<div className='flex items-start gap-3'>
								<div className='flex-1'>
									<p className='text-sm font-medium text-amber-900'>
										{rapportZ.note}
									</p>
									<p className='text-xs text-amber-700 mt-1'>
										Ce rapport est une capture figée de l'activité de la journée
										et ne peut être modifié.
									</p>
								</div>
								{rapportZ.is_locked && (
									<div className='px-3 py-1 bg-amber-200 text-amber-900 text-xs font-medium rounded'>
										Verrouillé
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	)
}
