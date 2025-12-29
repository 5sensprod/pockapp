// frontend/modules/connect/components/QuotePdf.tsx
// ✅ VERSION HARMONISÉE - Support TVA multi-taux avec vat_breakdown stocké

import type { QuoteResponse } from '@/lib/types/invoice.types'
import {
	Document,
	Image,
	Page,
	StyleSheet,
	Text,
	View,
} from '@react-pdf/renderer'

// Type flexible pour le client (compatible avec expand et CustomersResponse)
interface CustomerInfo {
	id?: string
	name?: string
	email?: string
	phone?: string
	address?: string
	company?: string
}

// Type flexible pour l'entreprise
interface CompanyInfo {
	id?: string
	name?: string
	trade_name?: string
	logo?: string
	address_line1?: string
	address_line2?: string
	zip_code?: string
	city?: string
	country?: string
	legal_form?: string
	share_capital?: number
	siren?: string
	siret?: string
	rcs?: string
	ape_naf?: string
	vat_number?: string
	phone?: string
	email?: string
	website?: string
	iban?: string
	bic?: string
	bank_name?: string
	account_holder?: string
	invoice_footer?: string
	default_payment_terms_days?: number
}

// ✅ Type pour la ventilation TVA
interface VatBreakdown {
	rate: number
	base_ht: number
	vat: number
	total_ttc: number
}

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
	quoteInfo: {
		alignItems: 'flex-end',
	},
	quoteTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		marginBottom: 6,
		color: '#2563eb',
	},
	quoteInfoLine: {
		fontSize: 11,
	},
	validityBadge: {
		marginTop: 8,
		padding: 6,
		backgroundColor: '#dbeafe',
		borderRadius: 4,
	},
	validityText: {
		fontSize: 10,
		color: '#1e40af',
		textAlign: 'center',
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
	// ✅ Styles pour la ventilation TVA
	totalsTvaBreakdown: {
		fontSize: 10,
		color: '#555',
		fontStyle: 'italic',
		paddingLeft: 8,
	},
	totalsTvaSection: {
		marginTop: 2,
		paddingTop: 4,
		borderTopWidth: 0.5,
		borderTopColor: '#ddd',
		borderTopStyle: 'solid',
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

	// DISCLAIMER DEVIS
	disclaimerBox: {
		marginTop: 20,
		padding: 10,
		backgroundColor: '#fef3c7',
		borderRadius: 4,
		borderWidth: 0.5,
		borderColor: '#f59e0b',
		borderStyle: 'solid',
	},
	disclaimerTitle: {
		fontSize: 10,
		fontWeight: 'bold',
		color: '#92400e',
		marginBottom: 4,
	},
	disclaimerText: {
		fontSize: 9,
		color: '#78350f',
	},

	// SIGNATURE
	signatureBlock: {
		marginTop: 30,
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
	signatureBox: {
		width: '45%',
		padding: 10,
		borderWidth: 0.5,
		borderColor: '#ddd',
		borderStyle: 'solid',
		borderRadius: 4,
		minHeight: 80,
	},
	signatureTitle: {
		fontSize: 10,
		fontWeight: 'bold',
		marginBottom: 4,
	},
	signatureSubtitle: {
		fontSize: 9,
		color: '#666',
	},
})

export interface QuotePdfProps {
	quote: QuoteResponse
	customer?: CustomerInfo
	company?: CompanyInfo
	companyLogoUrl?: string | null
}

export function QuotePdfDocument({
	quote,
	customer,
	company,
	companyLogoUrl,
}: QuotePdfProps) {
	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat('fr-FR', {
			style: 'currency',
			currency: quote.currency || 'EUR',
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

	// ✅ NOUVEAU: vendeur / commercial (issued_by)
	const issuedBy = quote.expand?.issued_by
	const sellerName =
		issuedBy?.name ||
		issuedBy?.username ||
		issuedBy?.email ||
		(quote.issued_by ? String(quote.issued_by) : '')

	// Lignes calculées
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

	// ✅ Utiliser la ventilation stockée, ou recalculer en fallback
	const getVatBreakdown = (): VatBreakdown[] => {
		// 1. Si la ventilation est stockée en base, l'uti	liser directement
		const storedBreakdown = (quote as any).vat_breakdown as
			| VatBreakdown[]
			| undefined

		if (
			storedBreakdown &&
			Array.isArray(storedBreakdown) &&
			storedBreakdown.length > 0
		) {
			return storedBreakdown.sort((a, b) => a.rate - b.rate)
		}

		console.log('⚠️ [QuotePDF] Fallback - recalcul depuis items')

		// 2. Fallback : recalculer depuis les items
		const vatBreakdownMap = new Map<number, VatBreakdown>()

		for (const item of quote.items) {
			const rate = item.tva_rate
			const ht = item.total_ht
			const vat = item.total_ttc - item.total_ht
			const ttc = item.total_ttc

			let entry = vatBreakdownMap.get(rate)

			if (!entry) {
				entry = {
					rate,
					base_ht: 0,
					vat: 0,
					total_ttc: 0,
				}
				vatBreakdownMap.set(rate, entry)
			}

			entry.base_ht += ht
			entry.vat += vat
			entry.total_ttc += ttc
		}

		return Array.from(vatBreakdownMap.values())
			.map((entry) => ({
				rate: entry.rate,
				base_ht: Math.round(entry.base_ht * 100) / 100,
				vat: Math.round(entry.vat * 100) / 100,
				total_ttc: Math.round(entry.total_ttc * 100) / 100,
			}))
			.sort((a, b) => a.rate - b.rate)
	}

	const vatBreakdown = getVatBreakdown()

	return (
		<Document>
			<Page size='A4' style={styles.page}>
				{/* HEADER : Entreprise + Infos devis */}
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

					{/* Bloc devis */}
					<View style={styles.quoteInfo}>
						<Text style={styles.quoteTitle}>DEVIS</Text>
						<Text style={styles.quoteInfoLine}>Devis n° {quote.number}</Text>
						<Text style={styles.quoteInfoLine}>
							Date : {formatDate(quote.date)}
						</Text>
						{sellerName && (
							<Text style={styles.quoteInfoLine}>Vendeur : {sellerName}</Text>
						)}
						{quote.valid_until && (
							<View style={styles.validityBadge}>
								<Text style={styles.validityText}>
									Valide jusqu'au {formatDate(quote.valid_until)}
								</Text>
							</View>
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
				<Text style={styles.sectionTitle}>Détail de l'offre</Text>
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

					{quote.items.map((item, idx) => {
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
							{formatCurrency(quote.total_ht)}
						</Text>
					</View>

					{/* ✅ VENTILATION TVA MULTI-TAUX */}
					<View style={styles.totalsTvaSection}>
						{vatBreakdown.length > 1 ? (
							<>
								<View style={styles.totalsRow}>
									<Text style={styles.totalsLabel}>Total TVA</Text>
									<Text style={styles.totalsValue}>
										{formatCurrency(quote.total_tva)}
									</Text>
								</View>
								{vatBreakdown.map((vb) => (
									<View key={vb.rate} style={styles.totalsRow}>
										<Text style={styles.totalsTvaBreakdown}>
											dont TVA {vb.rate}% sur {vb.base_ht.toFixed(2)} € HT
										</Text>
										<Text style={styles.totalsTvaBreakdown}>
											{vb.vat.toFixed(2)} €
										</Text>
									</View>
								))}
							</>
						) : vatBreakdown.length === 1 ? (
							<View style={styles.totalsRow}>
								<Text style={styles.totalsLabel}>
									TVA {vatBreakdown[0].rate}% sur{' '}
									{vatBreakdown[0].base_ht.toFixed(2)} € HT
								</Text>
								<Text style={styles.totalsValue}>
									{formatCurrency(vatBreakdown[0].vat)}
								</Text>
							</View>
						) : (
							<View style={styles.totalsRow}>
								<Text style={styles.totalsLabel}>TVA</Text>
								<Text style={styles.totalsValue}>
									{formatCurrency(quote.total_tva)}
								</Text>
							</View>
						)}
					</View>

					<View style={[styles.totalsRow, styles.totalsGrand]}>
						<Text style={styles.totalsGrandText}>Total TTC</Text>
						<Text style={styles.totalsGrandText}>
							{formatCurrency(quote.total_ttc)}
						</Text>
					</View>
				</View>

				{/* NOTES DEVIS */}
				{quote.notes && (
					<View style={styles.notes}>
						<Text>Notes :</Text>
						<Text>{quote.notes}</Text>
					</View>
				)}

				{/* DISCLAIMER DEVIS */}
				<View style={styles.disclaimerBox}>
					<Text style={styles.disclaimerTitle}>Information importante</Text>
					<Text style={styles.disclaimerText}>
						Ce document est un devis et ne constitue pas une facture. Les prix
						indiqués sont valables jusqu'à la date de validité mentionnée
						ci-dessus. Passé ce délai, nous nous réservons le droit de modifier
						les tarifs.
					</Text>
				</View>

				{/* BLOC SIGNATURE */}
				<View style={styles.signatureBlock}>
					<View style={styles.signatureBox}>
						<Text style={styles.signatureTitle}>Bon pour accord</Text>
						<Text style={styles.signatureSubtitle}>
							Date et signature du client
						</Text>
					</View>
					<View style={styles.signatureBox}>
						<Text style={styles.signatureTitle}>Pour {companyName}</Text>
						<Text style={styles.signatureSubtitle}>Signature</Text>
					</View>
				</View>

				{/* PIED DE PAGE ENTREPRISE */}
				{(company?.invoice_footer || company?.default_payment_terms_days) && (
					<View style={styles.footerLegal}>
						{company?.default_payment_terms_days && (
							<Text>
								Conditions de paiement : {company.default_payment_terms_days}{' '}
								jours après acceptation.
							</Text>
						)}
						{company?.invoice_footer && <Text>{company.invoice_footer}</Text>}
					</View>
				)}
			</Page>
		</Document>
	)
}
