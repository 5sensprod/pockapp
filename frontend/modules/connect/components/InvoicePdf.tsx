// frontend/modules/connect/components/InvoicePdf.tsx

import type {
	CompaniesResponse,
	CustomersResponse,
} from '@/lib/pocketbase-types'
import type { InvoiceResponse } from '@/lib/queries/invoices'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

// Styles PDF
const styles = StyleSheet.create({
	page: {
		padding: 32,
		fontSize: 11,
		fontFamily: 'Helvetica',
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 24,
	},
	companyBlock: {
		maxWidth: '60%',
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
		fontSize: 11,
		textAlign: 'right',
	},
	invoiceTitle: {
		fontSize: 16,
		fontWeight: 'bold',
		marginBottom: 4,
	},
	sectionTitle: {
		fontSize: 12,
		fontWeight: 'bold',
		marginBottom: 6,
		marginTop: 16,
	},
	customerBlock: {
		marginBottom: 12,
		fontSize: 11,
	},
	customerLine: {
		fontSize: 11,
	},
	tableHeader: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: '#ccc',
		borderBottomStyle: 'solid',
		paddingBottom: 4,
		marginTop: 8,
	},
	tableRow: {
		flexDirection: 'row',
		paddingVertical: 4,
		borderBottomWidth: 0.5,
		borderBottomColor: '#eee',
		borderBottomStyle: 'solid',
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
	totalsBlock: {
		marginTop: 12,
		marginLeft: 'auto',
		width: 220,
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
		fontSize: 13,
		fontWeight: 'bold',
		marginTop: 4,
		borderTopWidth: 1,
		borderTopColor: '#000',
		borderTopStyle: 'solid',
		paddingTop: 4,
	},
	notes: {
		marginTop: 16,
		fontSize: 10,
		color: '#555',
	},
	footerLegal: {
		marginTop: 24,
		fontSize: 9,
		color: '#444',
	},
	bankBlock: {
		marginTop: 16,
		fontSize: 10,
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
}

export function InvoicePdfDocument({
	invoice,
	customer,
	company,
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

	return (
		<Document>
			<Page size='A4' style={styles.page}>
				{/* HEADER : Entreprise + Infos facture */}
				<View style={styles.header}>
					{/* Bloc entreprise / infos légales */}
					<View style={styles.companyBlock}>
						<Text style={styles.companyName}>{companyName}</Text>

						{/* Adresse */}
						{company?.address_line1 && (
							<Text style={styles.companyLine}>{company.address_line1}</Text>
						)}
						{company?.address_line2 && (
							<Text style={styles.companyLine}>{company.address_line2}</Text>
						)}
						{(company?.zip_code || company?.city || company?.country) && (
							<Text style={styles.companyLine}>
								{company?.zip_code || ''} {company?.city || ''}{' '}
								{company?.country ? `(${company.country})` : ''}
							</Text>
						)}

						{/* Infos légales */}
						{company?.legal_form && (
							<Text style={styles.companyLine}>{company.legal_form}</Text>
						)}
						{company?.share_capital != null && (
							<Text style={styles.companyLine}>
								Capital social :{' '}
								{company.share_capital.toLocaleString('fr-FR', {
									minimumFractionDigits: 0,
									maximumFractionDigits: 0,
								})}{' '}
								€
							</Text>
						)}
						{company?.siren && (
							<Text style={styles.companyLine}>SIREN : {company.siren}</Text>
						)}
						{company?.siret && (
							<Text style={styles.companyLine}>SIRET : {company.siret}</Text>
						)}
						{company?.rcs && (
							<Text style={styles.companyLine}>RCS : {company.rcs}</Text>
						)}
						{company?.ape_naf && (
							<Text style={styles.companyLine}>
								Code APE/NAF : {company.ape_naf}
							</Text>
						)}
						{company?.vat_number && (
							<Text style={styles.companyLine}>
								TVA intracom : {company.vat_number}
							</Text>
						)}

						{/* Contacts */}
						{(company?.phone || company?.email) && (
							<Text style={styles.companyLine}>
								{company?.phone ? `Tél. : ${company.phone}` : ''}{' '}
								{company?.email ? ` - Email : ${company.email}` : ''}
							</Text>
						)}
						{company?.website && (
							<Text style={styles.companyLine}>Site : {company.website}</Text>
						)}
					</View>

					{/* Bloc facture */}
					<View style={styles.invoiceInfo}>
						<Text style={styles.invoiceTitle}>FACTURE</Text>
						<Text>Facture n° {invoice.number}</Text>
						<Text>Date : {formatDate(invoice.date)}</Text>
						{invoice.due_date && (
							<Text>Échéance : {formatDate(invoice.due_date)}</Text>
						)}
						{/* ✅ On NE met plus le statut ici */}
					</View>
				</View>

				{/* CLIENT */}
				<Text style={styles.sectionTitle}>Client</Text>
				<View style={styles.customerBlock}>
					{/* Société (si pro) */}
					{customer?.company && (
						<Text style={styles.customerLine}>
							Société : {customer.company}
						</Text>
					)}
					{/* Nom du client (toujours, même particulier) */}
					<Text style={styles.customerLine}>
						Nom : {customer?.name || 'Client inconnu'}
					</Text>
					{/* Adresse libre */}
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

				{/* TABLE LIGNES */}
				<Text style={styles.sectionTitle}>Détail</Text>
				<View style={styles.tableHeader}>
					<Text style={styles.colDescription}>Description</Text>
					<Text style={styles.colQty}>Qté</Text>
					<Text style={styles.colUnit}>P.U. HT</Text>
					<Text style={styles.colTva}>TVA</Text>
					<Text style={styles.colTotal}>Total TTC</Text>
				</View>

				{invoice.items.map((item, idx) => (
					<View style={styles.tableRow} key={idx}>
						<Text style={styles.colDescription}>{item.name}</Text>
						<Text style={styles.colQty}>{item.quantity}</Text>
						<Text style={styles.colUnit}>{item.unit_price_ht.toFixed(2)}</Text>
						<Text style={styles.colTva}>{item.tva_rate}%</Text>
						<Text style={styles.colTotal}>{item.total_ttc.toFixed(2)}</Text>
					</View>
				))}

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
						<Text>Total TTC</Text>
						<Text>{formatCurrency(invoice.total_ttc)}</Text>
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

				{/* PIED DE PAGE ENTREPRISE (champ invoice_footer) */}
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
