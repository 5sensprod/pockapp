import type { RapportZ } from '@/lib/types/cash.types'
import { getPaymentMethodLabel } from '@/lib/types/cash.types'
// frontend/modules/cash/components/reports/ZReportPDF.tsx
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

// Type étendu pour inclure les tickets dans les sessions
interface TicketItem {
	id: string
	number?: string
	total_ttc: number
	payment_method?: string
	payment_method_label?: string
}

interface RapportZWithTickets extends Omit<RapportZ, 'sessions'> {
	sessions: Array<
		RapportZ['sessions'][number] & {
			tickets?: TicketItem[]
		}
	>
}

const styles = StyleSheet.create({
	page: {
		padding: 30,
		fontSize: 9,
		fontFamily: 'Helvetica',
		color: '#000',
	},
	header: {
		marginBottom: 12,
		paddingBottom: 8,
		borderBottom: '2pt solid #000',
	},
	title: {
		fontSize: 16,
		fontWeight: 'bold',
		marginBottom: 2,
	},
	subtitle: {
		fontSize: 8,
		color: '#666',
		marginBottom: 6,
	},
	info: {
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',
		fontSize: 8,
		marginBottom: 8,
		paddingBottom: 8,
		borderBottom: '1pt solid #ccc',
	},
	section: {
		marginBottom: 10,
		paddingBottom: 8,
		borderBottom: '1pt solid #e0e0e0',
	},
	sectionTitle: {
		fontSize: 10,
		fontWeight: 'bold',
		marginBottom: 4,
	},
	row: {
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 2,
		fontSize: 9,
	},
	grid: {
		display: 'flex',
		flexDirection: 'row',
		gap: 8,
		marginBottom: 6,
	},
	col: {
		flex: 1,
	},
	label: {
		color: '#666',
		fontSize: 8,
	},
	value: {
		fontWeight: 'bold',
	},
	total: {
		fontSize: 12,
		fontWeight: 'bold',
		textAlign: 'right',
		marginTop: 4,
		paddingTop: 4,
		borderTop: '1pt solid #000',
	},
	session: {
		marginBottom: 6,
		padding: 6,
		backgroundColor: '#f5f5f5',
		fontSize: 8,
	},
	sessionHeader: {
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 4,
		paddingBottom: 3,
		borderBottom: '1pt solid #ccc',
	},
	footer: {
		marginTop: 10,
		padding: 6,
		backgroundColor: '#f9f9f9',
		fontSize: 7,
		color: '#666',
	},
})

interface ZReportPDFProps {
	rapport: RapportZWithTickets
}

export function ZReportPDF({ rapport }: ZReportPDFProps) {
	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat('fr-FR', {
			style: 'currency',
			currency: 'EUR',
		}).format(amount)
	}

	const formatDateTime = (dateStr: string) => {
		return new Date(dateStr).toLocaleString('fr-FR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		})
	}

	const formatDate = (dateStr: string) => {
		return new Date(dateStr).toLocaleDateString('fr-FR')
	}

	return (
		<Document>
			<Page size='A4' style={styles.page}>
				{/* En-tête */}
				<View style={styles.header}>
					<Text style={styles.title}>RAPPORT Z - CLÔTURE JOURNALIÈRE</Text>
					<Text style={styles.subtitle}>
						Document fiscal inaltérable - Conformité NF525
					</Text>
				</View>

				{/* Informations */}
				<View style={styles.info}>
					<Text>N° {rapport.number}</Text>
					<Text>Date: {formatDate(rapport.date)}</Text>
					<Text>
						Caisse: {rapport.cash_register.code || rapport.cash_register.name}
					</Text>
					<Text>Généré: {formatDateTime(rapport.generated_at.toString())}</Text>
				</View>

				{/* Synthèse */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>SYNTHÈSE</Text>
					<View style={styles.grid}>
						<View style={styles.col}>
							<Text style={styles.label}>Sessions</Text>
							<Text style={styles.value}>
								{rapport.daily_totals.sessions_count}
							</Text>
						</View>
						<View style={styles.col}>
							<Text style={styles.label}>Tickets</Text>
							<Text style={styles.value}>
								{rapport.daily_totals.invoice_count}
							</Text>
						</View>
						<View style={styles.col}>
							<Text style={styles.label}>Total HT</Text>
							<Text style={styles.value}>
								{formatCurrency(rapport.daily_totals.total_ht)}
							</Text>
						</View>
						<View style={styles.col}>
							<Text style={styles.label}>TVA</Text>
							<Text style={styles.value}>
								{formatCurrency(rapport.daily_totals.total_tva)}
							</Text>
						</View>
					</View>
					<Text style={styles.total}>
						Total TTC: {formatCurrency(rapport.daily_totals.total_ttc)}
					</Text>
				</View>

				{/* TVA */}
				{rapport.daily_totals.vat_by_rate &&
					Object.keys(rapport.daily_totals.vat_by_rate).length > 0 && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>TVA COLLECTÉE</Text>
							{Object.entries(rapport.daily_totals.vat_by_rate).map(
								([rate, detail]) => (
									<View key={rate} style={styles.row}>
										<Text>Taux {rate}%</Text>
										<Text>
											Base: {formatCurrency(detail.base_ht)} | TVA:{' '}
											{formatCurrency(detail.vat_amount)}
										</Text>
									</View>
								),
							)}
						</View>
					)}

				{/* Moyens de paiement */}
				{rapport.daily_totals.by_method &&
					Object.keys(rapport.daily_totals.by_method).length > 0 && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>MOYENS DE PAIEMENT</Text>
							{Object.entries(rapport.daily_totals.by_method).map(
								([method, amount]) => (
									<View key={method} style={styles.row}>
										<Text>{getPaymentMethodLabel(method)}</Text>
										<Text style={styles.value}>{formatCurrency(amount)}</Text>
									</View>
								),
							)}
						</View>
					)}

				{/* Espèces */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>GESTION ESPÈCES</Text>
					<View style={styles.grid}>
						<View style={styles.col}>
							<Text style={styles.label}>Attendues</Text>
							<Text style={styles.value}>
								{formatCurrency(rapport.daily_totals.total_cash_expected)}
							</Text>
						</View>
						<View style={styles.col}>
							<Text style={styles.label}>Comptées</Text>
							<Text style={styles.value}>
								{formatCurrency(rapport.daily_totals.total_cash_counted)}
							</Text>
						</View>
						<View style={styles.col}>
							<Text style={styles.label}>Écart</Text>
							<Text style={styles.value}>
								{formatCurrency(rapport.daily_totals.total_cash_difference)}
							</Text>
						</View>
						<View style={styles.col}>
							<Text style={styles.label}>Remises</Text>
							<Text style={styles.value}>
								{formatCurrency(rapport.daily_totals.total_discounts)}
							</Text>
						</View>
					</View>
				</View>

				{/* Avoirs */}
				{rapport.daily_totals.credit_notes_count > 0 && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>AVOIRS ÉMIS</Text>
						<View style={styles.row}>
							<Text>Nombre</Text>
							<Text>{rapport.daily_totals.credit_notes_count}</Text>
						</View>
						<View style={styles.row}>
							<Text>Montant</Text>
							<Text>
								-{formatCurrency(rapport.daily_totals.credit_notes_total)}
							</Text>
						</View>
					</View>
				)}

				{/* Sessions */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						DÉTAIL SESSIONS ({rapport.sessions.length})
					</Text>
					{rapport.sessions.map((session, index) => (
						<View key={session.id} style={styles.session}>
							<View style={styles.sessionHeader}>
								<View>
									<Text style={{ fontWeight: 'bold', fontSize: 9 }}>
										Session #{index + 1}
									</Text>
									<Text>
										{formatDateTime(session.opened_at.toString())} →{' '}
										{formatDateTime(session.closed_at.toString())}
									</Text>
									<Text style={{ fontSize: 7, color: '#666', marginTop: 1 }}>
										{session.opened_by_name} / {session.closed_by_name}
									</Text>
								</View>
								<View style={{ textAlign: 'right' }}>
									<Text style={{ fontWeight: 'bold', fontSize: 10 }}>
										{session.invoice_count} tickets
									</Text>
									<Text style={{ fontSize: 7 }}>
										HT: {formatCurrency(session.total_ht)}
									</Text>
									<Text style={{ fontSize: 7 }}>
										TVA: {formatCurrency(session.total_tva)}
									</Text>
									<Text style={{ fontWeight: 'bold', fontSize: 9 }}>
										{formatCurrency(session.total_ttc)}
									</Text>
								</View>
							</View>

							{/* Ventes par moyen de paiement */}
							{session.totals_by_method &&
								Object.keys(session.totals_by_method).length > 0 && (
									<View style={{ marginBottom: 4 }}>
										<Text
											style={{
												fontSize: 8,
												fontWeight: 'bold',
												marginBottom: 2,
											}}
										>
											Ventes:
										</Text>
										<View style={styles.grid}>
											{Object.entries(session.totals_by_method).map(
												([method, amount]) => (
													<View key={method} style={styles.col}>
														<Text style={styles.label}>
															{getPaymentMethodLabel(method)}
														</Text>
														<Text style={styles.value}>
															{formatCurrency(amount)}
														</Text>
													</View>
												),
											)}
										</View>
									</View>
								)}

							{/* Liste des tickets */}
							{session.tickets && session.tickets.length > 0 && (
								<View style={{ marginBottom: 4 }}>
									<Text
										style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 2 }}
									>
										Détail des tickets:
									</Text>
									<View style={{ fontSize: 9 }}>
										{session.tickets.map((ticket: any) => (
											<View
												key={ticket.id}
												style={{
													display: 'flex',
													flexDirection: 'row',
													justifyContent: 'space-between',
													marginBottom: 1,
													paddingVertical: 1,
												}}
											>
												<Text style={{ flex: 1 }}>
													{ticket.number || ticket.id.substring(0, 8)}
												</Text>
												<Text
													style={{ flex: 1, textAlign: 'left', color: '#666' }}
												>
													{getPaymentMethodLabel(
														ticket.payment_method_label ||
															ticket.payment_method ||
															'autre',
													)}
												</Text>
												<Text
													style={{
														flex: 1,
														textAlign: 'right',
														fontWeight: 'bold',
													}}
												>
													{formatCurrency(ticket.total_ttc || 0)}
												</Text>
											</View>
										))}
									</View>
								</View>
							)}

							{/* Espèces */}
							<View
								style={{
									marginTop: 4,
									paddingTop: 4,
									borderTop: '1pt solid #ddd',
								}}
							>
								<Text
									style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 2 }}
								>
									Espèces:
								</Text>
								<View style={styles.grid}>
									<View style={styles.col}>
										<Text style={styles.label}>Fond</Text>
										<Text style={styles.value}>
											{formatCurrency(session.opening_float)}
										</Text>
									</View>
									<View style={styles.col}>
										<Text style={styles.label}>Attendues</Text>
										<Text style={styles.value}>
											{formatCurrency(session.expected_cash_total)}
										</Text>
									</View>
									<View style={styles.col}>
										<Text style={styles.label}>Comptées</Text>
										<Text style={styles.value}>
											{formatCurrency(session.counted_cash_total)}
										</Text>
									</View>
									<View style={styles.col}>
										<Text style={styles.label}>Écart</Text>
										<Text style={styles.value}>
											{formatCurrency(session.cash_difference)}
										</Text>
									</View>
								</View>
							</View>
						</View>
					))}
				</View>

				{/* Footer */}
				<View style={styles.footer}>
					<Text>{rapport.note}</Text>
					<Text style={{ marginTop: 2 }}>
						Hash: {rapport.hash.substring(0, 32)}...
					</Text>
				</View>
			</Page>
		</Document>
	)
}
