// frontend/modules/cash/components/RapportZPage.tsx
// ✅ VERSION AMÉLIORÉE avec TVA ventilée, hash NF525, et historique

import { Badge } from '@/components/ui/badge'
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import {
	useCashRegisters,
	useZReport,
	useZReportCheck,
	useZReportList,
} from '@/lib/queries/cash'
import type { RapportZ, VATByRate } from '@/lib/types/cash.types'
import { getPaymentMethodLabel, getVATRateLabel } from '@/lib/types/cash.types'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import {
	AlertCircle,
	ArrowLeft,
	Calendar,
	CheckCircle2,
	Download,
	FileText,
	Hash,
	Lock,
	Printer,
	User,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

function computeNetByMethod(
	sales: Record<string, number> | undefined,
	refunds: Record<string, number> | undefined,
) {
	const result: Record<string, number> = {}
	const keys = new Set([
		...Object.keys(sales ?? {}),
		...Object.keys(refunds ?? {}),
	])

	for (const k of keys) {
		result[k] = (sales?.[k] ?? 0) - (refunds?.[k] ?? 0)
	}

	return result
}

export function RapportZPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()

	const [selectedRegisterId, setSelectedRegisterId] = useState<string>('')
	const [selectedDate, setSelectedDate] = useState<string>(
		new Date().toISOString().split('T')[0],
	)
	const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate')

	// Charger les caisses
	const { data: registers, isLoading: isLoadingRegisters } = useCashRegisters(
		activeCompanyId ?? undefined,
	)

	// Vérifier si un rapport Z existe déjà
	const { data: checkResult, isLoading: isLoadingCheck } = useZReportCheck(
		selectedRegisterId,
		selectedDate,
		{ enabled: !!selectedRegisterId && !!selectedDate },
	)

	// Charger le rapport Z (seulement quand on clique sur générer)
	const [shouldGenerate, setShouldGenerate] = useState(false)
	const {
		data: rapportZ,
		isLoading: isLoadingRapport,
		refetch,
		isError,
		error,
	} = useZReport(selectedRegisterId, selectedDate, {
		enabled: shouldGenerate && !!selectedRegisterId && !!selectedDate,
	})

	// Liste des rapports Z précédents
	const { data: zReportsList } = useZReportList(selectedRegisterId, {
		enabled: !!selectedRegisterId,
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

		if (checkResult?.exists) {
			toast.info('Ce rapport Z existe déjà, il sera affiché')
		}

		setShouldGenerate(true)
		refetch()
	}

	const handlePrint = () => {
		window.print()
	}

	const handleExport = () => {
		// TODO: Implémenter l'export PDF avec @react-pdf/renderer
		toast.info('Export PDF en cours de développement')
	}

	return (
		<div className='container mx-auto px-6 py-8 max-w-6xl'>
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
							Document fiscal inaltérable conforme NF525
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

			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
				<TabsList className='mb-6'>
					<TabsTrigger value='generate'>
						<FileText className='h-4 w-4 mr-2' />
						Générer un rapport
					</TabsTrigger>
					<TabsTrigger value='history'>
						<Calendar className='h-4 w-4 mr-2' />
						Historique
					</TabsTrigger>
				</TabsList>

				{/* ═══════════════════════════════════════════════════════════════════ */}
				{/* TAB: GÉNÉRER */}
				{/* ═══════════════════════════════════════════════════════════════════ */}
				<TabsContent value='generate'>
					{/* Sélection */}
					<Card className='mb-6'>
						<CardHeader>
							<CardTitle className='text-base'>Sélection</CardTitle>
							<CardDescription>
								Choisissez la caisse et la date pour générer le rapport Z
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className='grid grid-cols-4 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='register'>Caisse</Label>
									<select
										id='register'
										className='w-full h-10 rounded-md border bg-white px-3 text-sm'
										value={selectedRegisterId}
										onChange={(e) => {
											setSelectedRegisterId(e.target.value)
											setShouldGenerate(false)
										}}
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
										onChange={(e) => {
											setSelectedDate(e.target.value)
											setShouldGenerate(false)
										}}
									/>
								</div>

								<div className='space-y-2'>
									<Label>Statut</Label>
									<div className='h-10 flex items-center'>
										{isLoadingCheck ? (
											<span className='text-sm text-muted-foreground'>
												Vérification...
											</span>
										) : checkResult?.exists ? (
											<Badge variant='secondary' className='gap-1'>
												<CheckCircle2 className='h-3 w-3' />
												Rapport existant
											</Badge>
										) : checkResult?.can_generate ? (
											<Badge
												variant='outline'
												className='gap-1 text-emerald-600'
											>
												<FileText className='h-3 w-3' />
												{checkResult.available_sessions} session(s)
												disponible(s)
											</Badge>
										) : (
											<Badge variant='outline' className='gap-1 text-amber-600'>
												<AlertCircle className='h-3 w-3' />
												Aucune session
											</Badge>
										)}
									</div>
								</div>

								<div className='flex items-end'>
									<Button
										onClick={handleGenerate}
										disabled={
											!selectedRegisterId ||
											!selectedDate ||
											isLoadingRapport ||
											(!checkResult?.exists && !checkResult?.can_generate)
										}
										className='w-full'
									>
										{isLoadingRapport
											? 'Génération...'
											: checkResult?.exists
												? 'Afficher le rapport'
												: 'Générer le rapport'}
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Erreur */}
					{isError && (
						<Card className='border-destructive mb-6'>
							<CardContent className='pt-6'>
								<p className='text-sm text-destructive'>
									{(error as Error)?.message ||
										'Erreur lors de la génération du rapport Z'}
								</p>
							</CardContent>
						</Card>
					)}

					{/* Rapport Z */}
					{rapportZ && <RapportZDisplay rapport={rapportZ} />}
				</TabsContent>

				{/* ═══════════════════════════════════════════════════════════════════ */}
				{/* TAB: HISTORIQUE */}
				{/* ═══════════════════════════════════════════════════════════════════ */}
				<TabsContent value='history'>
					<Card>
						<CardHeader>
							<CardTitle className='text-base'>
								Historique des rapports Z
							</CardTitle>
							<CardDescription>
								{selectedRegisterId
									? 'Liste des rapports Z générés pour cette caisse'
									: "Sélectionnez une caisse pour voir l'historique"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{!selectedRegisterId ? (
								<p className='text-sm text-muted-foreground py-8 text-center'>
									Sélectionnez une caisse dans l'onglet "Générer un rapport"
								</p>
							) : !zReportsList?.length ? (
								<p className='text-sm text-muted-foreground py-8 text-center'>
									Aucun rapport Z pour cette caisse
								</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Numéro</TableHead>
											<TableHead>Date</TableHead>
											<TableHead className='text-right'>Sessions</TableHead>
											<TableHead className='text-right'>Tickets</TableHead>
											<TableHead className='text-right'>Total TTC</TableHead>
											<TableHead>Généré le</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{zReportsList.map((z) => (
											<TableRow
												key={z.id}
												className='cursor-pointer hover:bg-slate-50'
												onClick={() => {
													setSelectedDate(z.date.split('T')[0])
													setShouldGenerate(true)
													setActiveTab('generate')
												}}
											>
												<TableCell className='font-mono font-medium'>
													{z.number}
												</TableCell>
												<TableCell>
													{new Date(z.date).toLocaleDateString('fr-FR')}
												</TableCell>
												<TableCell className='text-right'>
													{z.sessions_count}
												</TableCell>
												<TableCell className='text-right'>
													{z.invoice_count}
												</TableCell>
												<TableCell className='text-right font-medium'>
													{formatCurrency(z.total_ttc)}
												</TableCell>
												<TableCell className='text-muted-foreground'>
													{formatDateTime(z.generated_at)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	)
}

// ============================================================================
// COMPOSANT D'AFFICHAGE DU RAPPORT Z
// ============================================================================

function RapportZDisplay({ rapport }: { rapport: RapportZ }) {
	return (
		<div className='space-y-6 print:space-y-4'>
			{/* Entête avec numéro et hash */}
			<Card>
				<CardHeader>
					<div className='flex items-center justify-between'>
						<div>
							<div className='flex items-center gap-3 mb-1'>
								<CardTitle className='text-xl'>{rapport.number}</CardTitle>
								<Badge variant='outline' className='gap-1'>
									<Lock className='h-3 w-3' />
									Verrouillé
								</Badge>
							</div>
							<CardDescription>
								{rapport.cash_register.code && (
									<span>Caisse: {rapport.cash_register.code} — </span>
								)}
								{rapport.cash_register.name} •{' '}
								{new Date(rapport.date).toLocaleDateString('fr-FR', {
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
								{formatDateTime(rapport.generated_at)}
							</div>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div className='flex items-center gap-2 text-xs text-muted-foreground font-mono bg-slate-50 p-2 rounded'>
						<Hash className='h-3 w-3' />
						<span className='truncate'>{rapport.hash}</span>
					</div>
				</CardContent>
			</Card>

			{/* Résumé global */}
			<Card>
				<CardHeader>
					<CardTitle className='text-base'>Résumé de la journée</CardTitle>
				</CardHeader>
				<CardContent className='space-y-6'>
					{/* Totaux principaux */}
					<div className='grid grid-cols-5 gap-4'>
						<div>
							<div className='text-xs text-muted-foreground'>Sessions</div>
							<div className='text-2xl font-bold'>
								{rapport.daily_totals.sessions_count}
							</div>
						</div>
						<div>
							<div className='text-xs text-muted-foreground'>Tickets</div>
							<div className='text-2xl font-bold'>
								{rapport.daily_totals.invoice_count}
							</div>
						</div>
						<div>
							<div className='text-xs text-muted-foreground'>Total HT</div>
							<div className='text-2xl font-bold'>
								{formatCurrency(rapport.daily_totals.total_ht)}
							</div>
						</div>
						<div>
							<div className='text-xs text-muted-foreground'>Total TVA</div>
							<div className='text-2xl font-bold text-blue-600'>
								{formatCurrency(rapport.daily_totals.total_tva)}
							</div>
						</div>
						<div>
							<div className='text-xs text-muted-foreground'>Total TTC</div>
							<div className='text-2xl font-bold text-emerald-600'>
								{formatCurrency(rapport.daily_totals.total_ttc)}
							</div>
						</div>
					</div>

					<Separator />

					{/* TVA ventilée */}
					<div>
						<div className='text-sm font-medium mb-3'>
							Ventilation de la TVA collectée
						</div>
						<VATBreakdownTable vatByRate={rapport.daily_totals.vat_by_rate} />
					</div>

					<Separator />

					{/* Encaissements / Remboursements / Net par moyen */}
					{(() => {
						const salesByMethod = rapport.daily_totals.by_method ?? {}
						const refundsByMethod = rapport.daily_totals.refunds_by_method
						const netByMethod =
							rapport.daily_totals.net_by_method ??
							(refundsByMethod
								? computeNetByMethod(salesByMethod, refundsByMethod)
								: undefined)

						return (
							<div className='space-y-4'>
								{/* Encaissements (ventes) */}
								<div>
									<div className='text-sm font-medium mb-2'>
										Encaissements (ventes) par moyen
									</div>
									<div className='grid grid-cols-2 gap-2'>
										{Object.entries(salesByMethod).map(([method, amount]) => (
											<div
												key={method}
												className='flex justify-between text-sm'
											>
												<span className='text-muted-foreground'>
													{getPaymentMethodLabel(method)}
												</span>
												<span className='font-medium'>
													{formatCurrency(amount)}
												</span>
											</div>
										))}
									</div>
								</div>

								{/* Remboursements (si exposés par le backend) */}
								{refundsByMethod && Object.keys(refundsByMethod).length > 0 && (
									<div>
										<div className='text-sm font-medium mb-2'>
											Remboursements par moyen
										</div>
										<div className='grid grid-cols-2 gap-2'>
											{Object.entries(refundsByMethod).map(
												([method, amount]) => (
													<div
														key={method}
														className='flex justify-between text-sm'
													>
														<span className='text-muted-foreground'>
															{getPaymentMethodLabel(method)}
														</span>
														<span className='font-medium text-red-600'>
															-{formatCurrency(Math.abs(amount))}
														</span>
													</div>
												),
											)}
										</div>
									</div>
								)}

								{/* Net (si dispo: net_by_method ou calculable) */}
								{netByMethod && Object.keys(netByMethod).length > 0 && (
									<div>
										<div className='text-sm font-medium mb-2'>
											Net par moyen (ventes - remboursements)
										</div>
										<div className='grid grid-cols-2 gap-2'>
											{Object.entries(netByMethod).map(([method, amount]) => (
												<div
													key={method}
													className='flex justify-between text-sm'
												>
													<span className='text-muted-foreground'>
														{getPaymentMethodLabel(method)}
													</span>
													<span
														className={`font-medium ${
															amount < 0 ? 'text-red-600' : 'text-emerald-700'
														}`}
													>
														{formatCurrency(amount)}
													</span>
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						)
					})()}

					<Separator />

					{/* Écart de caisse */}
					<div className='grid grid-cols-4 gap-4'>
						<div>
							<div className='text-xs text-muted-foreground'>
								Espèces attendues
							</div>
							<div className='text-lg font-medium'>
								{formatCurrency(rapport.daily_totals.total_cash_expected)}
							</div>
						</div>
						<div>
							<div className='text-xs text-muted-foreground'>
								Espèces comptées
							</div>
							<div className='text-lg font-medium'>
								{formatCurrency(rapport.daily_totals.total_cash_counted)}
							</div>
						</div>
						<div>
							<div className='text-xs text-muted-foreground'>Écart total</div>
							<div
								className={`text-lg font-bold ${
									Math.abs(rapport.daily_totals.total_cash_difference) > 10
										? 'text-destructive'
										: 'text-emerald-600'
								}`}
							>
								{formatCurrency(rapport.daily_totals.total_cash_difference)}
							</div>
						</div>
						<div>
							<div className='text-xs text-muted-foreground'>Remises</div>
							<div className='text-lg font-medium text-amber-600'>
								{formatCurrency(rapport.daily_totals.total_discounts)}
							</div>
						</div>
					</div>

					{/* Avoirs si présents */}
					{rapport.daily_totals.credit_notes_count > 0 && (
						<>
							<Separator />
							<div className='flex items-center gap-4 p-3 bg-red-50 rounded'>
								<div>
									<div className='text-xs text-muted-foreground'>
										Avoirs émis
									</div>
									<div className='text-lg font-medium text-red-600'>
										{rapport.daily_totals.credit_notes_count} avoir(s)
									</div>
								</div>
								<div>
									<div className='text-xs text-muted-foreground'>
										Montant total
									</div>
									<div className='text-lg font-medium text-red-600'>
										-{formatCurrency(rapport.daily_totals.credit_notes_total)}
									</div>
								</div>
							</div>
						</>
					)}
				</CardContent>
			</Card>

			{/* Détail des sessions */}
			<Card>
				<CardHeader>
					<CardTitle className='text-base'>
						Détail des sessions ({rapport.sessions.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className='space-y-4'>
						{rapport.sessions.map((session, index) => (
							<div key={session.id} className='p-4 border rounded-lg space-y-3'>
								{/* En-tête session */}
								<div className='flex items-center justify-between'>
									<div>
										<div className='font-medium'>Session #{index + 1}</div>
										<div className='text-xs text-muted-foreground'>
											{formatDateTime(session.opened_at)} →{' '}
											{formatDateTime(session.closed_at)}
										</div>
										<div className='flex items-center gap-4 mt-1'>
											{session.opened_by_name && (
												<div className='flex items-center gap-1 text-xs text-muted-foreground'>
													<User className='h-3 w-3' />
													<span>Ouvert: </span>
													<span className='font-medium text-foreground'>
														{session.opened_by_name}
													</span>
												</div>
											)}
											{session.closed_by_name && (
												<div className='flex items-center gap-1 text-xs text-muted-foreground'>
													<User className='h-3 w-3' />
													<span>Fermé: </span>
													<span className='font-medium text-foreground'>
														{session.closed_by_name}
													</span>
												</div>
											)}
										</div>
									</div>
									<div className='text-right'>
										<div className='text-sm font-medium'>
											{session.invoice_count} tickets
										</div>
										<div className='text-xs text-muted-foreground'>
											HT: {formatCurrency(session.total_ht)} • TVA:{' '}
											{formatCurrency(session.total_tva)}
										</div>
										<div className='text-lg font-bold text-emerald-600'>
											{formatCurrency(session.total_ttc)}
										</div>
									</div>
								</div>

								{/* Espèces */}
								<div className='grid grid-cols-4 gap-3 text-sm bg-slate-50 p-3 rounded'>
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
										<div className='text-xs text-muted-foreground'>Écart</div>
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

								{/* TVA de la session */}
								{session.vat_by_rate &&
									Object.keys(session.vat_by_rate).length > 0 && (
										<div className='text-sm'>
											<div className='text-xs text-muted-foreground mb-2'>
												TVA collectée
											</div>
											<div className='grid grid-cols-4 gap-2'>
												{Object.entries(session.vat_by_rate).map(
													([rate, detail]) => (
														<div key={rate} className='flex justify-between'>
															<span className='text-muted-foreground'>
																{getVATRateLabel(rate)}
															</span>
															<span className='font-medium'>
																{formatCurrency(detail.vat_amount)}
															</span>
														</div>
													),
												)}
											</div>
										</div>
									)}

								{/* Moyens de paiement */}
								{session.totals_by_method &&
									Object.keys(session.totals_by_method).length > 0 && (
										<div className='text-sm'>
											<div className='text-xs text-muted-foreground mb-2'>
												Par moyen de paiement
											</div>
											<div className='grid grid-cols-4 gap-2'>
												{Object.entries(session.totals_by_method).map(
													([method, amount]) => (
														<div key={method} className='flex justify-between'>
															<span className='text-muted-foreground'>
																{getPaymentMethodLabel(method)}
															</span>
															<span className='font-medium'>
																{formatCurrency(amount)}
															</span>
														</div>
													),
												)}
											</div>
										</div>
									)}
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Note de verrouillage */}
			<Card className='border-amber-200 bg-amber-50'>
				<CardContent className='pt-6'>
					<div className='flex items-start gap-3'>
						<Lock className='h-5 w-5 text-amber-600 mt-0.5' />
						<div className='flex-1'>
							<p className='text-sm font-medium text-amber-900'>
								{rapport.note}
							</p>
							<p className='text-xs text-amber-700 mt-1'>
								Ce rapport est une capture figée de l'activité de la journée. Il
								ne peut être ni modifié ni supprimé (conformité NF525).
							</p>
							<p className='text-xs text-amber-700 mt-1 font-mono'>
								Hash de vérification: {rapport.hash.substring(0, 16)}...
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

// ============================================================================
// TABLEAU TVA VENTILÉE
// ============================================================================

function VATBreakdownTable({ vatByRate }: { vatByRate: VATByRate }) {
	const entries = Object.entries(vatByRate).sort(
		([a], [b]) => Number.parseFloat(b) - Number.parseFloat(a),
	)

	if (entries.length === 0) {
		return <p className='text-sm text-muted-foreground'>Aucune TVA collectée</p>
	}

	// Calculer les totaux
	const totals = entries.reduce(
		(acc, [, detail]) => ({
			baseHT: acc.baseHT + detail.base_ht,
			vatAmount: acc.vatAmount + detail.vat_amount,
			totalTTC: acc.totalTTC + detail.total_ttc,
		}),
		{ baseHT: 0, vatAmount: 0, totalTTC: 0 },
	)

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Taux</TableHead>
					<TableHead className='text-right'>Base HT</TableHead>
					<TableHead className='text-right'>TVA</TableHead>
					<TableHead className='text-right'>Total TTC</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{entries.map(([rate, detail]) => (
					<TableRow key={rate}>
						<TableCell className='font-medium'>
							{getVATRateLabel(rate)}
						</TableCell>
						<TableCell className='text-right'>
							{formatCurrency(detail.base_ht)}
						</TableCell>
						<TableCell className='text-right text-blue-600 font-medium'>
							{formatCurrency(detail.vat_amount)}
						</TableCell>
						<TableCell className='text-right'>
							{formatCurrency(detail.total_ttc)}
						</TableCell>
					</TableRow>
				))}
				{/* Ligne de total */}
				<TableRow className='bg-slate-50 font-medium'>
					<TableCell>TOTAL</TableCell>
					<TableCell className='text-right'>
						{formatCurrency(totals.baseHT)}
					</TableCell>
					<TableCell className='text-right text-blue-600'>
						{formatCurrency(totals.vatAmount)}
					</TableCell>
					<TableCell className='text-right text-emerald-600'>
						{formatCurrency(totals.totalTTC)}
					</TableCell>
				</TableRow>
			</TableBody>
		</Table>
	)
}
