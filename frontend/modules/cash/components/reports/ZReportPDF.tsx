// frontend/modules/cash/components/reports/ZReportPDF.tsx

import type { RapportZ } from '@/lib/types/cash.types'
import {
	CUSTOMER_TYPE_EREPORTING,
	CUSTOMER_TYPE_LABELS,
	type CustomerType,
	type CustomerTypeSummary,
	aggregateEreporting,
	getPaymentMethodLabel,
} from '@/lib/types/cash.types'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

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
			by_customer_type?: Record<string, CustomerTypeSummary>
		}
	>
	// Totaux enrichis (alimentés par les nouvelles structs Go)
	daily_totals: RapportZ['daily_totals'] & {
		by_customer_type?: Record<string, CustomerTypeSummary>
		net_ttc?: number
	}
}

const s = StyleSheet.create({
	page: { padding: 30, fontSize: 9, fontFamily: 'Helvetica', color: '#000' },
	header: {
		marginBottom: 12,
		paddingBottom: 8,
		borderBottom: '2pt solid #000',
	},
	title: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
	subtitle: { fontSize: 8, color: '#666', marginBottom: 6 },
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
	sectionTitle: { fontSize: 10, fontWeight: 'bold', marginBottom: 4 },
	row: {
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 2,
		fontSize: 9,
	},
	rowMuted: {
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 2,
		fontSize: 8,
		color: '#666',
	},
	grid: { display: 'flex', flexDirection: 'row', gap: 8, marginBottom: 6 },
	col: { flex: 1 },
	label: { color: '#666', fontSize: 8 },
	value: { fontWeight: 'bold' },
	total: {
		fontSize: 12,
		fontWeight: 'bold',
		textAlign: 'right',
		marginTop: 4,
		paddingTop: 4,
		borderTop: '1pt solid #000',
	},
	netTotal: {
		fontSize: 10,
		fontWeight: 'bold',
		textAlign: 'right',
		marginTop: 2,
		color: '#1a6b3c',
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
	// E-reporting
	ereportBox: {
		marginTop: 10,
		padding: 8,
		backgroundColor: '#e8f0fe',
		borderLeft: '3pt solid #1a73e8',
	},
	ereportTitle: {
		fontSize: 9,
		fontWeight: 'bold',
		color: '#1a3c87',
		marginBottom: 6,
	},
	ereportGrid: { display: 'flex', flexDirection: 'row', gap: 8 },
	ereportCard: { flex: 1, padding: 6, backgroundColor: '#fff' },
	ereportBadge: { fontSize: 7, fontWeight: 'bold', marginBottom: 3 },
	ereportAmount: { fontSize: 11, fontWeight: 'bold', marginBottom: 1 },
	ereportSub: { fontSize: 7, color: '#666' },
	ereportNote: { fontSize: 7, color: '#1a3c87', marginTop: 6 },
	// Avoirs
	refundBox: { padding: 6, backgroundColor: '#fff3f3', marginBottom: 4 },
	// B2C/B2B table
	typeRow: {
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 2,
		fontSize: 8,
		paddingBottom: 2,
		borderBottom: '1pt solid #eee',
	},
	badgeB2C: { fontSize: 7, color: '#1a56a0', fontWeight: 'bold' },
	badgeB2B: { fontSize: 7, color: '#5c3ba3', fontWeight: 'bold' },
})

interface ZReportPDFProps {
	rapport: RapportZWithTickets
}

const fc = (amount: number) =>
	new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
		amount,
	)

const fdt = (dateStr: string) =>
	new Date(dateStr).toLocaleString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})

const fd = (dateStr: string) => new Date(dateStr).toLocaleDateString('fr-FR')

const CUSTOMER_TYPE_ORDER: CustomerType[] = [
	'individual',
	'professional',
	'administration',
	'association',
]

export function ZReportPDF({ rapport }: ZReportPDFProps) {
	const byCustomerType = rapport.daily_totals.by_customer_type
	const hasCustomerTypes =
		byCustomerType && Object.keys(byCustomerType).length > 0
	const ereporting = hasCustomerTypes
		? aggregateEreporting(byCustomerType)
		: null
	const netTTC = rapport.daily_totals.net_ttc

	return (
		<Document>
			<Page size='A4' style={s.page}>
				{/* En-tête */}
				<View style={s.header}>
					<Text style={s.title}>RAPPORT Z — CLÔTURE JOURNALIÈRE</Text>
					<Text style={s.subtitle}>
						Document fiscal inaltérable — Conformité NF525
					</Text>
				</View>

				{/* Informations */}
				<View style={s.info}>
					<Text>N° {rapport.number}</Text>
					<Text>Date : {fd(rapport.date)}</Text>
					<Text>
						Caisse : {rapport.cash_register.code || rapport.cash_register.name}
					</Text>
					<Text>Généré : {fdt(rapport.generated_at.toString())}</Text>
				</View>

				{/* Synthèse */}
				<View style={s.section}>
					<Text style={s.sectionTitle}>SYNTHÈSE</Text>
					<View style={s.grid}>
						<View style={s.col}>
							<Text style={s.label}>Sessions</Text>
							<Text style={s.value}>{rapport.daily_totals.sessions_count}</Text>
						</View>
						<View style={s.col}>
							<Text style={s.label}>Tickets / factures</Text>
							<Text style={s.value}>{rapport.daily_totals.invoice_count}</Text>
						</View>
						<View style={s.col}>
							<Text style={s.label}>Total HT</Text>
							<Text style={s.value}>{fc(rapport.daily_totals.total_ht)}</Text>
						</View>
						<View style={s.col}>
							<Text style={s.label}>TVA</Text>
							<Text style={s.value}>{fc(rapport.daily_totals.total_tva)}</Text>
						</View>
					</View>
					<Text style={s.total}>
						Total TTC : {fc(rapport.daily_totals.total_ttc)}
					</Text>
					{netTTC !== undefined &&
						netTTC !== rapport.daily_totals.total_ttc && (
							<Text style={s.netTotal}>Net après avoirs : {fc(netTTC)}</Text>
						)}
				</View>

				{/* Ventes par nature (e-reporting) */}
				{hasCustomerTypes && (
					<View style={s.section}>
						<Text style={s.sectionTitle}>VENTES PAR NATURE (E-REPORTING)</Text>
						{CUSTOMER_TYPE_ORDER.filter((ct) => byCustomerType[ct]).map(
							(ct) => {
								const summary = byCustomerType[ct]
								const tag = CUSTOMER_TYPE_EREPORTING[ct]
								return (
									<View key={ct} style={s.typeRow}>
										<Text style={tag === 'B2C' ? s.badgeB2C : s.badgeB2B}>
											[{tag}]
										</Text>
										<Text style={{ flex: 3, marginLeft: 4, fontSize: 8 }}>
											{CUSTOMER_TYPE_LABELS[ct]}
										</Text>
										<Text
											style={{ fontSize: 8, color: '#666', marginRight: 8 }}
										>
											{summary.count} doc.
										</Text>
										<Text style={{ fontSize: 8, fontWeight: 'bold' }}>
											{fc(summary.total_ttc)}
										</Text>
									</View>
								)
							},
						)}
					</View>
				)}

				{/* TVA ventilée */}
				{rapport.daily_totals.vat_by_rate &&
					Object.keys(rapport.daily_totals.vat_by_rate).length > 0 && (
						<View style={s.section}>
							<Text style={s.sectionTitle}>TVA COLLECTÉE</Text>
							{/* Entête colonnes */}
							<View style={s.row}>
								<Text style={{ flex: 1, color: '#666', fontSize: 8 }}>
									Taux
								</Text>
								<Text
									style={{
										flex: 2,
										color: '#666',
										fontSize: 8,
										textAlign: 'right',
									}}
								>
									Base HT
								</Text>
								<Text
									style={{
										flex: 2,
										color: '#666',
										fontSize: 8,
										textAlign: 'right',
									}}
								>
									TVA
								</Text>
								<Text
									style={{
										flex: 2,
										color: '#666',
										fontSize: 8,
										textAlign: 'right',
									}}
								>
									TTC
								</Text>
							</View>
							{Object.entries(rapport.daily_totals.vat_by_rate).map(
								([rate, detail]) => (
									<View key={rate} style={s.row}>
										<Text style={{ flex: 1 }}>{rate} %</Text>
										<Text style={{ flex: 2, textAlign: 'right' }}>
											{fc(detail.base_ht)}
										</Text>
										<Text style={{ flex: 2, textAlign: 'right' }}>
											{fc(detail.vat_amount)}
										</Text>
										<Text
											style={{
												flex: 2,
												textAlign: 'right',
												fontWeight: 'bold',
											}}
										>
											{fc(detail.base_ht + detail.vat_amount)}
										</Text>
									</View>
								),
							)}
						</View>
					)}

				{/* Moyens de paiement */}
				{rapport.daily_totals.by_method &&
					Object.keys(rapport.daily_totals.by_method).length > 0 && (
						<View style={s.section}>
							<Text style={s.sectionTitle}>ENCAISSEMENTS PAR MOYEN</Text>
							{Object.entries(rapport.daily_totals.by_method).map(
								([method, amount]) => (
									<View key={method} style={s.row}>
										<Text>{getPaymentMethodLabel(method)}</Text>
										<Text style={s.value}>{fc(amount)}</Text>
									</View>
								),
							)}
							{/* Remboursements par moyen si présents */}
							{rapport.daily_totals.refunds_by_method &&
								Object.keys(rapport.daily_totals.refunds_by_method).length >
									0 && (
									<View
										style={{
											marginTop: 4,
											paddingTop: 4,
											borderTop: '1pt solid #eee',
										}}
									>
										<Text
											style={{ fontSize: 8, color: '#666', marginBottom: 2 }}
										>
											Remboursements :
										</Text>
										{Object.entries(rapport.daily_totals.refunds_by_method).map(
											([method, amount]) => (
												<View key={method} style={s.rowMuted}>
													<Text>{getPaymentMethodLabel(method)}</Text>
													<Text style={{ color: '#c00' }}>-{fc(amount)}</Text>
												</View>
											),
										)}
									</View>
								)}
							{/* Net par moyen */}
							{rapport.daily_totals.net_by_method &&
								Object.keys(rapport.daily_totals.net_by_method).length > 0 && (
									<View
										style={{
											marginTop: 4,
											paddingTop: 4,
											borderTop: '1pt solid #ccc',
										}}
									>
										<Text
											style={{
												fontSize: 8,
												fontWeight: 'bold',
												marginBottom: 2,
											}}
										>
											Net par moyen :
										</Text>
										{Object.entries(rapport.daily_totals.net_by_method).map(
											([method, amount]) => (
												<View key={method} style={s.row}>
													<Text>{getPaymentMethodLabel(method)}</Text>
													<Text
														style={{
															fontWeight: 'bold',
															color: amount < 0 ? '#c00' : '#000',
														}}
													>
														{fc(amount)}
													</Text>
												</View>
											),
										)}
									</View>
								)}
						</View>
					)}

				{/* Avoirs */}
				{rapport.daily_totals.credit_notes_count > 0 && (
					<View style={s.section}>
						<Text style={s.sectionTitle}>AVOIRS ÉMIS</Text>
						<View style={s.refundBox}>
							<View style={s.row}>
								<Text>Nombre d'avoirs</Text>
								<Text style={s.value}>
									{rapport.daily_totals.credit_notes_count}
								</Text>
							</View>
							<View style={s.row}>
								<Text>Montant total</Text>
								<Text style={{ fontWeight: 'bold', color: '#c00' }}>
									-{fc(rapport.daily_totals.credit_notes_total)}
								</Text>
							</View>
						</View>
					</View>
				)}

				{/* Espèces */}
				<View style={s.section}>
					<Text style={s.sectionTitle}>GESTION ESPÈCES</Text>
					<View style={s.grid}>
						<View style={s.col}>
							<Text style={s.label}>Attendues</Text>
							<Text style={s.value}>
								{fc(rapport.daily_totals.total_cash_expected)}
							</Text>
						</View>
						<View style={s.col}>
							<Text style={s.label}>Comptées</Text>
							<Text style={s.value}>
								{fc(rapport.daily_totals.total_cash_counted)}
							</Text>
						</View>
						<View style={s.col}>
							<Text style={s.label}>Écart</Text>
							<Text
								style={{
									fontWeight: 'bold',
									color:
										Math.abs(rapport.daily_totals.total_cash_difference) > 0.5
											? '#c00'
											: '#1a6b3c',
								}}
							>
								{fc(rapport.daily_totals.total_cash_difference)}
							</Text>
						</View>
						<View style={s.col}>
							<Text style={s.label}>Remises</Text>
							<Text style={s.value}>
								{fc(rapport.daily_totals.total_discounts)}
							</Text>
						</View>
					</View>
				</View>

				{/* Sessions */}
				<View style={s.section}>
					<Text style={s.sectionTitle}>
						DÉTAIL SESSIONS ({rapport.sessions.length})
					</Text>
					{rapport.sessions.map((session, index) => (
						<View key={session.id} style={s.session}>
							<View style={s.sessionHeader}>
								<View>
									<Text style={{ fontWeight: 'bold', fontSize: 9 }}>
										Session #{index + 1}
									</Text>
									<Text>
										{fdt(session.opened_at.toString())} →{' '}
										{fdt(session.closed_at.toString())}
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
										HT : {fc(session.total_ht)}
									</Text>
									<Text style={{ fontSize: 7 }}>
										TVA : {fc(session.total_tva)}
									</Text>
									<Text style={{ fontWeight: 'bold', fontSize: 9 }}>
										{fc(session.total_ttc)}
									</Text>
								</View>
							</View>

							{/* Moyens de paiement session */}
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
											Encaissements :
										</Text>
										<View style={s.grid}>
											{Object.entries(session.totals_by_method).map(
												([method, amount]) => (
													<View key={method} style={s.col}>
														<Text style={s.label}>
															{getPaymentMethodLabel(method)}
														</Text>
														<Text style={s.value}>{fc(amount)}</Text>
													</View>
												),
											)}
										</View>
									</View>
								)}

							{/* B2C/B2B session si disponible */}
							{session.by_customer_type &&
								Object.keys(session.by_customer_type).length > 0 && (
									<View style={{ marginBottom: 4 }}>
										<Text
											style={{
												fontSize: 8,
												fontWeight: 'bold',
												marginBottom: 2,
											}}
										>
											Par nature :
										</Text>
										{CUSTOMER_TYPE_ORDER.filter(
											(ct) => session.by_customer_type?.[ct],
										).map((ct) => {
											const sum = session.by_customer_type?.[ct]
											if (!sum) return null
											const tag = CUSTOMER_TYPE_EREPORTING[ct]
											return (
												<View key={ct} style={s.rowMuted}>
													<Text style={tag === 'B2C' ? s.badgeB2C : s.badgeB2B}>
														[{tag}]
													</Text>
													<Text style={{ flex: 3, marginLeft: 4 }}>
														{CUSTOMER_TYPE_LABELS[ct]}
													</Text>
													<Text>{fc(sum.total_ttc)}</Text>
												</View>
											)
										})}
									</View>
								)}

							{/* Tickets */}
							{session.tickets && session.tickets.length > 0 && (
								<View style={{ marginBottom: 4 }}>
									<Text
										style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 2 }}
									>
										Détail des tickets :
									</Text>
									{session.tickets.map((ticket) => (
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
												{ticket.number ?? ticket.id.substring(0, 8)}
											</Text>
											<Text
												style={{ flex: 1, textAlign: 'left', color: '#666' }}
											>
												{getPaymentMethodLabel(
													ticket.payment_method_label ??
														ticket.payment_method ??
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
												{fc(ticket.total_ttc ?? 0)}
											</Text>
										</View>
									))}
								</View>
							)}

							{/* Espèces session */}
							<View
								style={{
									marginTop: 4,
									paddingTop: 4,
									borderTop: '1pt solid #ddd',
								}}
							>
								<View style={s.grid}>
									<View style={s.col}>
										<Text style={s.label}>Fond</Text>
										<Text style={s.value}>{fc(session.opening_float)}</Text>
									</View>
									<View style={s.col}>
										<Text style={s.label}>Attendues</Text>
										<Text style={s.value}>
											{fc(session.expected_cash_total)}
										</Text>
									</View>
									<View style={s.col}>
										<Text style={s.label}>Comptées</Text>
										<Text style={s.value}>
											{fc(session.counted_cash_total)}
										</Text>
									</View>
									<View style={s.col}>
										<Text style={s.label}>Écart</Text>
										<Text
											style={{
												fontWeight: 'bold',
												color:
													Math.abs(session.cash_difference) > 0.5
														? '#c00'
														: '#1a6b3c',
											}}
										>
											{fc(session.cash_difference)}
										</Text>
									</View>
								</View>
							</View>
						</View>
					))}
				</View>

				{/* Bloc e-reporting */}
				{ereporting &&
					(ereporting.b2c.count > 0 || ereporting.b2b.count > 0) && (
						<View style={s.ereportBox}>
							<Text style={s.ereportTitle}>
								DONNÉES E-REPORTING — OBLIGATOIRE SEPT. 2027 (DGFiP)
							</Text>
							<View style={s.ereportGrid}>
								{ereporting.b2c.count > 0 && (
									<View style={s.ereportCard}>
										<Text style={s.ereportBadge}>B2C — Particuliers</Text>
										<Text style={s.ereportAmount}>
											{fc(ereporting.b2c.total_ttc)}
										</Text>
										<Text style={s.ereportSub}>
											TVA : {fc(ereporting.b2c.total_tva)} ·{' '}
											{ereporting.b2c.count} doc.
										</Text>
									</View>
								)}
								{ereporting.b2b.count > 0 && (
									<View style={s.ereportCard}>
										<Text style={s.ereportBadge}>
											B2B — Professionnels / Assos
										</Text>
										<Text style={s.ereportAmount}>
											{fc(ereporting.b2b.total_ttc)}
										</Text>
										<Text style={s.ereportSub}>
											TVA : {fc(ereporting.b2b.total_tva)} ·{' '}
											{ereporting.b2b.count} doc.
										</Text>
									</View>
								)}
							</View>
							<Text style={s.ereportNote}>
								Ces données sont à transmettre à votre Plateforme de
								Dématérialisation Partenaire (PDP).
							</Text>
						</View>
					)}

				{/* Footer */}
				<View style={s.footer}>
					<Text>{rapport.note}</Text>
					<Text style={{ marginTop: 2 }}>
						Hash : {rapport.hash.substring(0, 32)}...
					</Text>
					{rapport.previous_hash && (
						<Text>
							Hash précédent : {rapport.previous_hash.substring(0, 32)}...
						</Text>
					)}
				</View>
			</Page>
		</Document>
	)
}
