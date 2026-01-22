// frontend/modules/cash/components/reports/TicketsPage.tsx

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useInvoices } from '@/lib/queries/invoices'
import { useNavigate } from '@tanstack/react-router'
import {
	Calendar,
	Eye,
	FileText,
	MoreHorizontal,
	Receipt,
	Search,
} from 'lucide-react'
import {
	formatCurrency,
	formatDate,
	formatTime,
	useTicketFilters,
	useTicketStats,
} from './index'

export function TicketsPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()

	const { data: invoicesData, isLoading } = useInvoices({
		companyId: activeCompanyId ?? undefined,
		filter: 'is_pos_ticket = true',
		perPage: 100,
	})

	const tickets = invoicesData?.items || []

	// Gestion des filtres
	const {
		searchTerm,
		setSearchTerm,
		conversionFilter,
		setConversionFilter,
		dateFilter,
		setDateFilter,
		filteredTickets,
		hasActiveFilters,
	} = useTicketFilters({ tickets })

	// Calcul des statistiques
	const stats = useTicketStats({ tickets })

	return (
		<div className='container mx-auto px-6 py-8'>
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold flex items-center gap-2'>
						<Receipt className='h-6 w-6' />
						Tickets de caisse
					</h1>
					<p className='text-muted-foreground'>
						Gérez et convertissez vos tickets POS
					</p>
				</div>
			</div>

			<div className='grid grid-cols-1 md:grid-cols-4 gap-4 mb-6'>
				<Card>
					<CardHeader className='pb-3'>
						<CardTitle className='text-sm font-medium text-muted-foreground'>
							Total tickets
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>{stats.total}</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-3'>
						<CardTitle className='text-sm font-medium text-muted-foreground'>
							Convertis
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold text-green-600'>
							{stats.converted}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-3'>
						<CardTitle className='text-sm font-medium text-muted-foreground'>
							Non convertis
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold text-orange-600'>
							{stats.notConverted}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-3'>
						<CardTitle className='text-sm font-medium text-muted-foreground'>
							Montant total
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>
							{formatCurrency(stats.totalAmount)}
						</div>
					</CardContent>
				</Card>
			</div>

			<Card className='mb-6'>
				<CardContent className='pt-6'>
					<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
						<div className='md:col-span-2'>
							<div className='relative'>
								<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
								<Input
									placeholder='Rechercher un ticket...'
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									className='pl-10'
								/>
							</div>
						</div>

						<div>
							<Select
								value={conversionFilter}
								onValueChange={(v: any) => setConversionFilter(v)}
							>
								<SelectTrigger>
									<SelectValue placeholder='Conversion' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='all'>Tous les tickets</SelectItem>
									<SelectItem value='not_converted'>Non convertis</SelectItem>
									<SelectItem value='converted'>Convertis</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div>
							<div className='relative'>
								<Calendar className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
								<Input
									type='date'
									value={dateFilter}
									onChange={(e) => setDateFilter(e.target.value)}
									className='pl-10'
								/>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardContent className='p-0'>
					{isLoading ? (
						<div className='p-8 text-center text-muted-foreground'>
							Chargement...
						</div>
					) : filteredTickets.length === 0 ? (
						<div className='p-8 text-center text-muted-foreground'>
							<Receipt className='h-12 w-12 mx-auto mb-4 opacity-50' />
							<p className='font-medium'>Aucun ticket trouvé</p>
							<p className='text-sm'>
								{hasActiveFilters
									? 'Essayez de modifier vos filtres'
									: 'Les tickets de caisse apparaîtront ici'}
							</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Numéro</TableHead>
									<TableHead>Date</TableHead>
									<TableHead>Heure</TableHead>
									<TableHead>Client</TableHead>
									<TableHead>Caissier</TableHead>
									<TableHead className='text-right'>Montant</TableHead>
									<TableHead>Statut</TableHead>
									<TableHead className='text-right'>Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredTickets.map((ticket: any) => {
									const customer = ticket.expand?.customer

									const soldBy = ticket.expand?.sold_by
									const cashierName =
										soldBy?.name ||
										soldBy?.username ||
										soldBy?.email ||
										(ticket.sold_by ? String(ticket.sold_by) : '—')

									return (
										<TableRow key={ticket.id}>
											<TableCell>
												<div className='flex items-center gap-2'>
													<span className='font-mono font-medium'>
														{ticket.number}
													</span>
													{ticket.converted_to_invoice && (
														<Badge variant='outline' className='text-xs'>
															→ FAC
														</Badge>
													)}
												</div>
											</TableCell>

											<TableCell>{formatDate(ticket.date)}</TableCell>

											<TableCell className='text-muted-foreground'>
												{formatTime(ticket.created)}
											</TableCell>

											<TableCell>
												<div>
													<p className='font-medium'>
														{customer?.name || 'Client passage'}
													</p>
													{customer?.email && (
														<p className='text-xs text-muted-foreground'>
															{customer.email}
														</p>
													)}
												</div>
											</TableCell>

											<TableCell className='text-sm text-muted-foreground'>
												{cashierName}
											</TableCell>

											<TableCell className='text-right font-medium'>
												{formatCurrency(ticket.total_ttc)}
											</TableCell>

											<TableCell>
												<div className='flex items-center gap-2'>
													<Badge variant='default' className='text-xs'>
														Payé
													</Badge>
													{ticket.payment_method && (
														<span className='text-xs text-muted-foreground'>
															{ticket.payment_method_label ||
																(ticket.payment_method === 'cb'
																	? 'CB'
																	: ticket.payment_method === 'especes'
																		? 'Espèces'
																		: ticket.payment_method === 'cheque'
																			? 'Chèque'
																			: ticket.payment_method === 'virement'
																				? 'Virement'
																				: ticket.payment_method)}
														</span>
													)}
												</div>
											</TableCell>

											<TableCell className='text-right'>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button variant='ghost' size='icon'>
															<MoreHorizontal className='h-4 w-4' />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align='end'>
														<DropdownMenuLabel>Actions</DropdownMenuLabel>
														<DropdownMenuSeparator />

														<DropdownMenuItem
															onClick={() =>
																navigate({
																	to: '/connect/invoices/$invoiceId',
																	params: { invoiceId: ticket.id },
																})
															}
														>
															<Eye className='h-4 w-4 mr-2' />
															Voir le détail
														</DropdownMenuItem>

														{!ticket.converted_to_invoice && (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() =>
																		navigate({
																			to: '/cash/convert-to-invoice/$ticketId',
																			params: { ticketId: ticket.id },
																		})
																	}
																>
																	<Receipt className='h-4 w-4 mr-2' />
																	Convertir en facture
																</DropdownMenuItem>
															</>
														)}

														{ticket.converted_to_invoice &&
															ticket.converted_invoice_id && (
																<>
																	<DropdownMenuSeparator />
																	<DropdownMenuItem
																		onClick={() => {
																			const facId = ticket.converted_invoice_id
																			if (facId) {
																				navigate({
																					to: '/connect/invoices/$invoiceId',
																					params: { invoiceId: facId },
																				})
																			}
																		}}
																	>
																		<FileText className='h-4 w-4 mr-2' />
																		Voir la facture associée
																	</DropdownMenuItem>
																</>
															)}
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			{filteredTickets.length > 0 && (
				<div className='mt-4 text-sm text-muted-foreground text-center'>
					{filteredTickets.length} ticket(s) affiché(s) sur {tickets.length}{' '}
					total
				</div>
			)}
		</div>
	)
}
