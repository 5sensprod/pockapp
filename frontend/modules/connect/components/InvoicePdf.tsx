// frontend/modules/connect/components/InvoicePdf.tsx

import type {
	CompaniesResponse,
	CustomersResponse,
} from '@/lib/pocketbase-types'
import type { InvoiceResponse } from '@/lib/queries/invoices'
import {
	Document,
	Image,
	Page,
	StyleSheet,
	Text,
	View,
} from '@react-pdf/renderer'

// Styles PDF
const styles = StyleSheet.create({
	page: {
		padding: 36,
		fontSize: 11,
		fontFamily: 'Helvetica',
		lineHeight: 1.4,
	},

	// HEADER
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 24,
		paddingBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: '#ddd',
		borderBottomStyle: 'solid',
	},
	companyBlock: {
		maxWidth: '60%',
	},
	logo: {
		width: 80,
		height: 80,
		marginBottom: 8,
		objectFit: 'contain',
	},
	companyName: {
		fontSize: 18,
		fontWeight: 'bold',
		marginBottom: 4,
	},
	companyLine: {
		fontSize: 10,
		color: '#444',
	},
	invoiceInfo: {
		alignItems: 'flex-end',
	},
	invoiceTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		marginBottom: 6,
	},
	invoiceInfoLine: {
		fontSize: 11,
	},

	// SECTIONS
	sectionTitle: {
		fontSize: 12,
		fontWeight: 'bold',
		marginBottom: 6,
		marginTop: 18,
	},
	sectionBox: {
		borderWidth: 0.5,
		borderColor: '#ddd',
		borderStyle: 'solid',
		borderRadius: 4,
		padding: 8,
	},

	// CLIENT
	customerBlock: {
		marginBottom: 4,
		fontSize: 11,
	},
	customerLine: {
		fontSize: 11,
	},

	// TABLE
	tableHeader: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: '#ccc',
		borderBottomStyle: 'solid',
		paddingVertical: 4,
		marginTop: 10,
		backgroundColor: '#f3f3f3',
	},
	tableHeaderText: {
		fontSize: 10,
		fontWeight: 'bold',
	},
	tableRow: {
		flexDirection: 'row',
		paddingVertical: 4,
		borderBottomWidth: 0.5,
		borderBottomColor: '#eee',
		borderBottomStyle: 'solid',
	},
	tableRowAlt: {
		backgroundColor: '#fafafa',
	},
	colDescription: {
		flex: 3,
	},
	colQty: {
		flex: 0.7,
		textAlign: 'right',
	},
	colUnit: {
		flex: 1.1,
		textAlign: 'right',
	},
	colTva: {
		flex: 0.8,
		textAlign: 'right',
	},
	colTotal: {
		flex: 1.2,
		textAlign: 'right',
	},

	// TOTALS
	totalsBlock: {
		marginTop: 14,
		marginLeft: 'auto',
		width: 230,
		padding: 8,
		borderWidth: 0.8,
		borderColor: '#ccc',
		borderStyle: 'solid',
		borderRadius: 4,
	},
	totalsRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 3,
	},
	totalsLabel: {
		fontSize: 11,
	},
	totalsValue: {
		fontSize: 11,
	},
	totalsGrand: {
		marginTop: 4,
		paddingTop: 6,
		borderTopWidth: 1,
		borderTopColor: '#000',
		borderTopStyle: 'solid',
	},
	totalsGrandText: {
		fontSize: 13,
		fontWeight: 'bold',
	},

	// NOTES & FOOTER
	notes: {
		marginTop: 18,
		fontSize: 10,
		color: '#555',
	},
	footerLegal: {
		marginTop: 20,
		fontSize: 9,
		color: '#444',
		borderTopWidth: 0.5,
		borderTopColor: '#ddd',
		borderTopStyle: 'solid',
		paddingTop: 8,
	},

	// BANK
	bankBlock: {
		marginTop: 16,
		fontSize: 10,
		padding: 8,
		borderWidth: 0.5,
		borderColor: '#ddd',
		borderStyle: 'solid',
		borderRadius: 4,
	},
	bankTitle: {
		fontSize: 11,
		fontWeight: 'bold',
		marginBottom: 4,
	},
})

export interface InvoicePdfProps {
	invoice: InvoiceResponse
	customer?: CustomersResponse
	company?: CompaniesResponse
	companyLogoUrl?: string | null
}

export function InvoicePdfDocument({
	invoice,
	customer,
	company,
	companyLogoUrl,
}: InvoicePdfProps) {
	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat('fr-FR', {
			style: 'currency',
			currency: invoice.currency || 'EUR',
		}).format(amount)

	const formatDate = (dateStr?: string) =>
		dateStr
			? new Date(dateStr).toLocaleDateString('fr-FR', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
				})
			: ''

	const companyName = company?.trade_name || company?.name || 'Votre entreprise'

	// -------------------------
	// Lignes calculées (propre)
	// -------------------------

	const addressLine1 = company?.address_line1 || ''
	const addressLine2 = company?.address_line2 || ''

	const addressLine3 = [
		company?.zip_code || '',
		company?.city || '',
		company?.country || '',
	]
		.filter((p) => p && p.trim().length > 0)
		.join(' ')

	const legalLines: string[] = []

	if (company?.legal_form) {
		legalLines.push(company.legal_form)
	}

	// ✅ Capital social seulement si > 0
	if (typeof company?.share_capital === 'number' && company.share_capital > 0) {
		const capitalStr = company.share_capital.toLocaleString('fr-FR', {
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		})
		legalLines.push(`Capital social : ${capitalStr} €`)
	}

	if (company?.siren) {
		legalLines.push(`SIREN : ${company.siren}`)
	}
	if (company?.siret) {
		legalLines.push(`SIRET : ${company.siret}`)
	}
	if (company?.rcs) {
		legalLines.push(`RCS : ${company.rcs}`)
	}
	if (company?.ape_naf) {
		legalLines.push(`Code APE/NAF : ${company.ape_naf}`)
	}
	if (company?.vat_number) {
		legalLines.push(`TVA intracom : ${company.vat_number}`)
	}

	const contactParts: string[] = []
	if (company?.phone) contactParts.push(`Tél. : ${company.phone}`)
	if (company?.email) contactParts.push(`Email : ${company.email}`)
	const contactLine =
		contactParts.length > 0 ? contactParts.join(' - ') : undefined

	const websiteLine = company?.website ? `Site : ${company.website}` : undefined

	return (
		<Document>
			<Page size='A4' style={styles.page}>
				{/* HEADER : Entreprise + Infos facture */}
				<View style={styles.header}>
					{/* Bloc entreprise / infos légales */}
					<View style={styles.companyBlock}>
						{companyLogoUrl && (
							<Image src={companyLogoUrl} style={styles.logo} />
						)}

						<Text style={styles.companyName}>{companyName}</Text>

						{addressLine1 && (
							<Text style={styles.companyLine}>{addressLine1}</Text>
						)}
						{addressLine2 && (
							<Text style={styles.companyLine}>{addressLine2}</Text>
						)}
						{addressLine3 && (
							<Text style={styles.companyLine}>{addressLine3}</Text>
						)}

						{legalLines.map((line) => (
							<Text key={line} style={styles.companyLine}>
								{line}
							</Text>
						))}

						{contactLine && (
							<Text style={styles.companyLine}>{contactLine}</Text>
						)}
						{websiteLine && (
							<Text style={styles.companyLine}>{websiteLine}</Text>
						)}
					</View>

					{/* Bloc facture */}
					<View style={styles.invoiceInfo}>
						<Text style={styles.invoiceTitle}>FACTURE</Text>
						<Text style={styles.invoiceInfoLine}>
							Facture n° {invoice.number}
						</Text>
						<Text style={styles.invoiceInfoLine}>
							Date : {formatDate(invoice.date)}
						</Text>
						{invoice.due_date && (
							<Text style={styles.invoiceInfoLine}>
								Échéance : {formatDate(invoice.due_date)}
							</Text>
						)}
					</View>
				</View>

				{/* CLIENT */}
				<Text style={styles.sectionTitle}>Client</Text>
				<View style={styles.sectionBox}>
					<View style={styles.customerBlock}>
						{customer?.company && (
							<Text style={styles.customerLine}>
								Société : {customer.company}
							</Text>
						)}
						<Text style={styles.customerLine}>
							Nom : {customer?.name || 'Client inconnu'}
						</Text>
						{customer?.address && (
							<Text style={styles.customerLine}>{customer.address}</Text>
						)}
						{customer?.email && (
							<Text style={styles.customerLine}>Email : {customer.email}</Text>
						)}
						{customer?.phone && (
							<Text style={styles.customerLine}>
								Téléphone : {customer.phone}
							</Text>
						)}
					</View>
				</View>

				{/* TABLE LIGNES */}
				<Text style={styles.sectionTitle}>Détail</Text>
				<View>
					<View style={styles.tableHeader}>
						<Text style={[styles.colDescription, styles.tableHeaderText]}>
							Description
						</Text>
						<Text style={[styles.colQty, styles.tableHeaderText]}>Qté</Text>
						<Text style={[styles.colUnit, styles.tableHeaderText]}>
							P.U. HT
						</Text>
						<Text style={[styles.colTva, styles.tableHeaderText]}>TVA</Text>
						<Text style={[styles.colTotal, styles.tableHeaderText]}>
							Total TTC
						</Text>
					</View>

					{invoice.items.map((item, idx) => {
						const key = `${item.name}-${item.quantity}-${item.unit_price_ht}-${item.tva_rate}-${item.total_ttc}`
						const isAlt = idx % 2 === 1

						const rowStyle = isAlt
							? [styles.tableRow, styles.tableRowAlt]
							: [styles.tableRow]

						return (
							<View style={rowStyle} key={key}>
								<Text style={styles.colDescription}>{item.name}</Text>
								<Text style={styles.colQty}>{item.quantity}</Text>
								<Text style={styles.colUnit}>
									{item.unit_price_ht.toFixed(2)}
								</Text>
								<Text style={styles.colTva}>{item.tva_rate}%</Text>
								<Text style={styles.colTotal}>{item.total_ttc.toFixed(2)}</Text>
							</View>
						)
					})}
				</View>

				{/* TOTAUX */}
				<View style={styles.totalsBlock}>
					<View style={styles.totalsRow}>
						<Text style={styles.totalsLabel}>Total HT</Text>
						<Text style={styles.totalsValue}>
							{formatCurrency(invoice.total_ht)}
						</Text>
					</View>
					<View style={styles.totalsRow}>
						<Text style={styles.totalsLabel}>TVA</Text>
						<Text style={styles.totalsValue}>
							{formatCurrency(invoice.total_tva)}
						</Text>
					</View>
					<View style={[styles.totalsRow, styles.totalsGrand]}>
						<Text style={styles.totalsGrandText}>Total TTC</Text>
						<Text style={styles.totalsGrandText}>
							{formatCurrency(invoice.total_ttc)}
						</Text>
					</View>
				</View>

				{/* COORDONNÉES BANCAIRES (si dispo) */}
				{(company?.iban || company?.bic || company?.bank_name) && (
					<View style={styles.bankBlock}>
						<Text style={styles.bankTitle}>Coordonnées bancaires</Text>
						{company?.bank_name && <Text>Banque : {company.bank_name}</Text>}
						{company?.account_holder && (
							<Text>Titulaire : {company.account_holder}</Text>
						)}
						{company?.iban && <Text>IBAN : {company.iban}</Text>}
						{company?.bic && <Text>BIC : {company.bic}</Text>}
					</View>
				)}

				{/* NOTES FACTURE */}
				{invoice.notes && (
					<View style={styles.notes}>
						<Text>Notes :</Text>
						<Text>{invoice.notes}</Text>
					</View>
				)}

				{/* PIED DE PAGE ENTREPRISE */}
				{(company?.invoice_footer || company?.default_payment_terms_days) && (
					<View style={styles.footerLegal}>
						{company?.default_payment_terms_days && (
							<Text>
								Paiement à {company.default_payment_terms_days} jours.
							</Text>
						)}
						{company?.invoice_footer && <Text>{company.invoice_footer}</Text>}
					</View>
				)}
			</Page>
		</Document>
	)
}
