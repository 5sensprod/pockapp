// frontend/modules/cash/components/ticket-detail/TicketInfoCard.tsx
//
// Affiche les infos générales d'un ticket/facture (colonne de gauche)
// et la sidebar ticket (suivi, avoirs, facture associée).
// Reçoit toutes les données via props — pas de fetch propre.

import { ModuleCard } from '@/components/module-ui/ModuleCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import {
	canCreateBalanceInvoice,
	canCreateDeposit,
} from '@/lib/types/invoice.types'
import { formatCurrency, formatDate } from '@/modules/connect/utils/formatters'
import { useNavigate } from '@tanstack/react-router'
import {
	Banknote,
	CreditCard,
	FileText,
	Plus,
	RefreshCcw,
	User,
} from 'lucide-react'
import { Loader2 } from 'lucide-react'
import { TicketStatusBadges } from './TicketStatusBadges'
import type { TicketActionsState } from './useTicketActions'
import type { TicketDetailData } from './useTicketDetail'

function getRefundMethodLabel(method?: string): string {
	const map: Record<string, string> = {
		especes: 'Espèces',
		cb: 'Carte bancaire',
		cheque: 'Chèque',
		virement: 'Virement',
		autre: 'Autre',
	}
	return (method && map[method]) || method || '-'
}

function getPaymentMethodLabel(invoice: any): string {
	const label = (invoice?.payment_method_label || '').trim()
	if (label) return label
	const map: Record<string, string> = {
		especes: 'Espèces',
		cb: 'Carte bancaire',
		cheque: 'Chèque',
		virement: 'Virement',
		autre: 'Autre',
	}
	return (
		(invoice?.payment_method && map[invoice.payment_method]) ||
		invoice?.payment_method ||
		'-'
	)
}

interface TicketInfoCardProps {
	data: TicketDetailData
	actions: TicketActionsState
	getDetailRoute: (
		id: string,
		isTicket?: boolean,
	) => { to: string; params: Record<string, string> }
}

export function TicketInfoCard({
	data,
	actions,
	getDetailRoute,
}: TicketInfoCardProps) {
	const navigate = useNavigate()
	const {
		invoice,
		isCreditNote,
		isDeposit,
		isTicket,
		overdue,
		remainingAmount,
		needsTicketSidebar,
		displayStatus,
		customer,
		depositsData,
		linkedCreditNotes,
		originalId,
		originalNumber,
		soldByLabel,
	} = data

	if (!invoice) return null

	return (
		<>
			{/* ── Détails généraux (mode facture B2B uniquement) ── */}
			{!isTicket && (
				<>
					<ModuleCard
						title={isCreditNote ? 'Avoir' : 'Détails de la facture'}
						icon={FileText}
						className='lg:col-span-3'
					>
						<div className='space-y-4 pt-1'>
							<div>
								<p className='text-sm text-muted-foreground'>Numéro</p>
								<p className='font-medium'>{invoice.number || '-'}</p>
							</div>
							<div>
								<p className='text-sm text-muted-foreground'>Date</p>
								<p className='text-sm'>{formatDate(invoice.date)}</p>
							</div>
							{invoice.due_date && (
								<div>
									<p className='text-sm text-muted-foreground'>Échéance</p>
									<p className='text-sm'>{formatDate(invoice.due_date)}</p>
								</div>
							)}
							{!isCreditNote && (
								<div>
									<p className='text-sm text-muted-foreground'>Vendeur</p>
									<p className='text-sm font-medium'>{soldByLabel}</p>
								</div>
							)}
							{!isCreditNote && invoice.is_paid && (
								<>
									<div>
										<p className='text-sm text-muted-foreground'>
											Moyen de paiement
										</p>
										<p className='text-sm font-medium'>
											{getPaymentMethodLabel(invoice)}
										</p>
									</div>
									<div>
										<p className='text-sm text-muted-foreground'>Payée le</p>
										<p className='text-sm'>
											{formatDate((invoice as any).paid_at)}
										</p>
									</div>
								</>
							)}
							<div className='flex items-center gap-2'>
								<TicketStatusBadges
									invoice={invoice}
									isCreditNote={isCreditNote}
									isDeposit={isDeposit}
									overdue={overdue}
									displayStatus={displayStatus}
								/>
							</div>

							{/* Avoir : document original */}
							{isCreditNote && (
								<>
									{(invoice as any).refund_method && (
										<div>
											<p className='text-sm text-muted-foreground'>
												Moyen de remboursement
											</p>
											<p className='text-sm font-medium'>
												{getRefundMethodLabel((invoice as any).refund_method)}
											</p>
										</div>
									)}
									{(invoice as any).cancellation_reason && (
										<div>
											<p className='text-sm text-muted-foreground'>
												Motif du remboursement
											</p>
											<p className='text-sm'>
												{(invoice as any).cancellation_reason}
											</p>
										</div>
									)}
									{originalId && (
										<div className='border-t border-border/50 pt-4 mt-2'>
											<p className='text-sm text-muted-foreground mb-2'>
												Document original
											</p>
											<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3'>
												<div className='flex items-center gap-2'>
													<FileText className='h-4 w-4 text-muted-foreground' />
													<span className='font-medium text-sm'>
														{originalNumber || 'Document'}
													</span>
												</div>
												<Button
													variant='outline'
													size='sm'
													onClick={() =>
														navigate(getDetailRoute(originalId) as any)
													}
												>
													Voir
												</Button>
											</div>
										</div>
									)}
								</>
							)}

							{/* Avoirs liés */}
							{!isCreditNote &&
								linkedCreditNotes &&
								linkedCreditNotes.length > 0 && (
									<div className='border-t border-border/50 pt-4 mt-2'>
										<p className='text-sm text-muted-foreground mb-2'>
											{linkedCreditNotes.length === 1
												? 'Avoir associé'
												: 'Avoirs associés'}
										</p>
										<div className='space-y-2'>
											{linkedCreditNotes.map((cn) => (
												<div
													key={cn.id}
													className='flex items-center justify-between bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-200 dark:border-red-900'
												>
													<div className='flex items-center gap-2'>
														<RefreshCcw className='h-4 w-4 text-red-600' />
														<div className='flex flex-col'>
															<span className='font-medium text-sm text-red-700 dark:text-red-400'>
																{cn.number}
															</span>
															<span className='text-xs text-muted-foreground'>
																{formatDate(cn.date)} •{' '}
																{formatCurrency(cn.total_ttc)}
															</span>
														</div>
													</div>
													<Button
														variant='outline'
														size='sm'
														onClick={() =>
															navigate(getDetailRoute(cn.id) as any)
														}
													>
														Voir
													</Button>
												</div>
											))}
										</div>
									</div>
								)}

							{/* Acomptes B2B */}
							{!isCreditNote && !isDeposit && (
								<div className='border-t border-border/50 pt-4 space-y-3 mt-2'>
									{(invoice.deposits_total_ttc ?? 0) > 0 && (
										<div className='space-y-1'>
											<p className='text-sm font-medium text-muted-foreground'>
												Acomptes
											</p>
											<div className='flex justify-between text-sm'>
												<span className='text-muted-foreground'>Versés</span>
												<span className='font-medium text-emerald-600'>
													{formatCurrency(
														invoice.deposits_total_ttc ?? 0,
														invoice.currency,
													)}
												</span>
											</div>
											<div className='flex justify-between text-sm'>
												<span className='text-muted-foreground'>
													Solde restant
												</span>
												<span className='font-semibold'>
													{formatCurrency(
														invoice.balance_due ?? invoice.total_ttc,
														invoice.currency,
													)}
												</span>
											</div>
										</div>
									)}

									{depositsData && depositsData.depositsCount > 0 && (
										<div className='space-y-2'>
											{depositsData.deposits.map(
												(
													dep: NonNullable<
														typeof depositsData
													>['deposits'][number],
												) => (
													<div
														key={dep.id}
														className='flex items-center justify-between bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-900'
													>
														<div className='flex items-center gap-2'>
															<Banknote className='h-4 w-4 text-blue-600' />
															<div className='flex flex-col'>
																<span className='font-medium text-sm text-blue-700 dark:text-blue-400'>
																	{dep.number}
																</span>
																<span className='text-xs text-muted-foreground'>
																	{formatDate(dep.date)} •{' '}
																	{formatCurrency(dep.total_ttc)} •{' '}
																	{dep.is_paid ? (
																		<span className='text-emerald-600'>
																			Réglé
																		</span>
																	) : (
																		<span className='text-amber-600'>
																			En attente
																		</span>
																	)}
																</span>
															</div>
														</div>
														<Button
															variant='outline'
															size='sm'
															onClick={() =>
																navigate(getDetailRoute(dep.id) as any)
															}
														>
															Voir
														</Button>
													</div>
												),
											)}
											{depositsData.balanceInvoice && (
												<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3 border border-border/50'>
													<div className='flex items-center gap-2'>
														<CreditCard className='h-4 w-4 text-muted-foreground' />
														<div className='flex flex-col'>
															<span className='font-medium text-sm'>
																{depositsData.balanceInvoice.number}
															</span>
															<span className='text-xs text-muted-foreground'>
																Facture de solde
															</span>
														</div>
													</div>
													<Button
														variant='outline'
														size='sm'
														onClick={() =>
															depositsData.balanceInvoice &&
															navigate(
																getDetailRoute(
																	depositsData.balanceInvoice.id,
																) as any,
															)
														}
													>
														Voir
													</Button>
												</div>
											)}
										</div>
									)}

									{/* Formulaire acompte inline */}
									<div className='flex flex-col gap-2'>
										{invoice &&
											canCreateDeposit(invoice) &&
											(actions.depositDialogOpen ? (
												<div className='space-y-2 bg-muted/50 rounded-lg p-3'>
													<p className='text-sm font-medium'>Nouvel acompte</p>
													<div className='flex rounded-md overflow-hidden border border-border text-xs font-medium'>
														<button
															type='button'
															className={`flex-1 px-2 py-1.5 transition-colors ${
																actions.depositMode === 'percent'
																	? 'bg-primary text-primary-foreground'
																	: 'bg-background text-muted-foreground hover:bg-muted'
															}`}
															onClick={() => actions.setDepositMode('percent')}
														>
															%
														</button>
														<button
															type='button'
															className={`flex-1 px-2 py-1.5 transition-colors ${
																actions.depositMode === 'amount'
																	? 'bg-primary text-primary-foreground'
																	: 'bg-background text-muted-foreground hover:bg-muted'
															}`}
															onClick={() => actions.setDepositMode('amount')}
														>
															€
														</button>
													</div>

													{actions.depositMode === 'percent' ? (
														<>
															<div className='flex items-center gap-2'>
																<input
																	type='range'
																	min={10}
																	max={90}
																	step={5}
																	value={actions.depositPercentage}
																	onChange={(e) =>
																		actions.setDepositPercentage(
																			Number(e.target.value),
																		)
																	}
																	className='flex-1'
																/>
																<span className='text-sm font-semibold w-10'>
																	{actions.depositPercentage}%
																</span>
															</div>
															<p className='text-xs text-muted-foreground'>
																≈{' '}
																{formatCurrency(
																	((invoice.deposits_total_ttc
																		? (invoice.balance_due ?? invoice.total_ttc)
																		: invoice.total_ttc) *
																		actions.depositPercentage) /
																		100,
																	invoice.currency,
																)}
															</p>
														</>
													) : (
														<>
															<div className='flex items-center gap-2'>
																<input
																	type='number'
																	min={0.01}
																	step={0.01}
																	placeholder='Montant en €'
																	value={actions.depositAmount}
																	onChange={(e) =>
																		actions.setDepositAmount(e.target.value)
																	}
																	className='flex-1 text-sm border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring'
																/>
																<span className='text-sm font-semibold'>€</span>
															</div>
															{actions.depositAmount &&
																Number.parseFloat(
																	actions.depositAmount.replace(',', '.'),
																) > 0 && (
																	<p className='text-xs text-muted-foreground'>
																		≈{' '}
																		{Math.round(
																			(Number.parseFloat(
																				actions.depositAmount.replace(',', '.'),
																			) /
																				(invoice.deposits_total_ttc
																					? (invoice.balance_due ??
																						invoice.total_ttc)
																					: invoice.total_ttc)) *
																				10000,
																		) / 100}
																		% du total
																	</p>
																)}
														</>
													)}

													<div className='flex gap-2'>
														<Button
															size='sm'
															onClick={actions.handleCreateDeposit}
															disabled={actions.isCreatingDeposit}
														>
															{actions.isCreatingDeposit && (
																<Loader2 className='h-3 w-3 animate-spin mr-1' />
															)}
															Créer
														</Button>
														<Button
															size='sm'
															variant='ghost'
															onClick={() =>
																actions.setDepositDialogOpen(false)
															}
														>
															Annuler
														</Button>
													</div>
												</div>
											) : (
												<Button
													variant='outline'
													size='sm'
													className='w-full'
													onClick={() => actions.setDepositDialogOpen(true)}
												>
													<Plus className='h-4 w-4 mr-2' />
													Demander un acompte
												</Button>
											))}

										{invoice &&
											canCreateBalanceInvoice(invoice) &&
											!depositsData?.balanceInvoice &&
											depositsData?.pendingCount === 0 && (
												<Button
													variant='outline'
													size='sm'
													className='w-full'
													onClick={actions.handleCreateBalanceInvoice}
													disabled={actions.isCreatingBalanceInvoice}
												>
													{actions.isCreatingBalanceInvoice ? (
														<Loader2 className='h-3 w-3 animate-spin mr-2' />
													) : (
														<CreditCard className='h-4 w-4 mr-2' />
													)}
													Générer la facture de solde
												</Button>
											)}
									</div>
								</div>
							)}

							{/* Acompte : retour facture parente */}
							{isDeposit && originalId && (
								<div className='border-t border-border/50 pt-4 mt-2'>
									<p className='text-sm text-muted-foreground mb-2'>
										Facture principale
									</p>
									<div className='flex items-center justify-between bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-900'>
										<div className='flex items-center gap-2'>
											<FileText className='h-4 w-4 text-blue-600' />
											<span className='font-medium text-sm'>
												{originalNumber || 'Document'}
											</span>
										</div>
										<Button
											variant='outline'
											size='sm'
											onClick={() =>
												navigate(getDetailRoute(originalId) as any)
											}
										>
											Voir
										</Button>
									</div>
								</div>
							)}

							{invoice.notes && (
								<div className='pt-2 border-t border-border/50'>
									<p className='text-sm text-muted-foreground'>Notes</p>
									<p className='text-sm mt-1'>{invoice.notes}</p>
								</div>
							)}
						</div>
					</ModuleCard>

					{/* Client */}
					<ModuleCard title='Client' icon={User} className='lg:col-span-3'>
						<div className='space-y-2 pt-1'>
							{customer ? (
								<>
									<p className='font-medium'>{customer.name}</p>
									{customer.company && (
										<p className='text-sm text-muted-foreground'>
											{customer.company}
										</p>
									)}
									{customer.email && (
										<p className='text-sm text-muted-foreground'>
											{customer.email}
										</p>
									)}
									{customer.phone && (
										<p className='text-sm text-muted-foreground'>
											{customer.phone}
										</p>
									)}
									{customer.address && (
										<p className='text-sm text-muted-foreground mt-2'>
											{customer.address}
										</p>
									)}
								</>
							) : (
								<p className='text-muted-foreground text-sm'>Client inconnu</p>
							)}
						</div>
					</ModuleCard>
				</>
			)}

			{/* ── Sidebar ticket POS (suivi, avoirs, notes) ── */}
			{isTicket && needsTicketSidebar && (
				<ModuleCard
					title='Suivi & Notes'
					icon={FileText}
					className='lg:col-span-4'
				>
					<div className='space-y-4 pt-1'>
						<div className='flex flex-wrap gap-2'>
							{invoice.converted_to_invoice && (
								<Badge
									variant='secondary'
									className='bg-blue-100 text-blue-700 hover:bg-blue-100/80'
								>
									Facturé
								</Badge>
							)}
							{remainingAmount <= 0 && (invoice.total_ttc ?? 0) > 0 && (
								<Badge
									variant='secondary'
									className='bg-orange-100 text-orange-700 hover:bg-orange-100/80'
								>
									Remboursé
								</Badge>
							)}
							{remainingAmount > 0 &&
								((invoice as any).credit_notes_total ?? 0) > 0 && (
									<Badge
										variant='outline'
										className='text-orange-600 border-orange-200'
									>
										Remboursé partiel
									</Badge>
								)}
						</div>

						{invoice.converted_to_invoice && invoice.converted_invoice_id && (
							<div className='border-t border-border/50 pt-4 mt-2'>
								<p className='text-sm text-muted-foreground mb-2'>
									Facture associée
								</p>
								<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3'>
									<div className='flex items-center gap-2'>
										<FileText className='h-4 w-4 text-muted-foreground' />
										<span className='font-medium text-sm'>Voir la facture</span>
									</div>
									<Button
										variant='outline'
										size='sm'
										onClick={() => {
											if (!invoice.converted_invoice_id) return
											navigate({
												to: '/connect/invoices/$invoiceId',
												params: { invoiceId: invoice.converted_invoice_id },
											})
										}}
									>
										Ouvrir
									</Button>
								</div>
							</div>
						)}

						{linkedCreditNotes && linkedCreditNotes.length > 0 && (
							<div className='border-t border-border/50 pt-4 mt-2'>
								<p className='text-sm text-muted-foreground mb-2'>
									{linkedCreditNotes.length === 1
										? 'Avoir associé'
										: 'Avoirs associés'}
								</p>
								<div className='space-y-2'>
									{linkedCreditNotes.map((cn) => (
										<div
											key={cn.id}
											className='flex items-center justify-between bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-200 dark:border-red-900'
										>
											<div className='flex items-center gap-2'>
												<RefreshCcw className='h-4 w-4 text-red-600' />
												<div className='flex flex-col'>
													<span className='font-medium text-sm text-red-700 dark:text-red-400'>
														{cn.number}
													</span>
													<span className='text-xs text-muted-foreground'>
														{formatDate(cn.date)} •{' '}
														{formatCurrency(cn.total_ttc)}
													</span>
												</div>
											</div>
											<Button
												variant='outline'
												size='sm'
												onClick={() => navigate(getDetailRoute(cn.id) as any)}
											>
												Voir
											</Button>
										</div>
									))}
								</div>
							</div>
						)}

						{invoice.notes && (
							<div className='pt-2 border-t border-border/50'>
								<p className='text-sm text-muted-foreground'>Notes</p>
								<p className='text-sm mt-1'>{invoice.notes}</p>
							</div>
						)}
					</div>
				</ModuleCard>
			)}
		</>
	)
}
