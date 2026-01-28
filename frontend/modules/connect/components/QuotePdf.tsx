// frontend/modules/connect/components/QuotePdf.tsx
// ✅ VERSION HARMONISÉE - Support TVA multi-taux avec vat_breakdown stocké
// ✅ VERSION OPTIMISÉE - Marges réduites, sans titres de section, cases signature réduites
// ✅ AJOUT REMISES - Affichage des remises comme dans InvoicePdf.tsx

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

// Styles PDF - VERSION OPTIMISÉE
const styles = StyleSheet.create({
	page: {
		padding: 20, // Réduit de 36 à 20
		fontSize: 10, // Réduit de 11 à 10
		fontFamily: 'Helvetica',
		lineHeight: 1.3, // Réduit de 1.4 à 1.3
	},

	// HEADER
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 12, // Réduit de 24 à 12
		paddingBottom: 8, // Réduit de 12 à 8
		borderBottomWidth: 1,
		borderBottomColor: '#ddd',
		borderBottomStyle: 'solid',
	},
	companyBlock: {
		maxWidth: '60%',
	},
	logo: {
		width: 60, // Réduit de 80 à 60
		height: 60, // Réduit de 80 à 60
		marginBottom: 4, // Réduit de 8 à 4
		objectFit: 'contain',
	},
	companyName: {
		fontSize: 16, // Réduit de 18 à 16
		fontWeight: 'bold',
		marginBottom: 2, // Réduit de 4 à 2
	},
	companyLine: {
		fontSize: 9, // Réduit de 10 à 9
		color: '#444',
	},
	quoteInfo: {
		alignItems: 'flex-end',
	},
	quoteTitle: {
		fontSize: 18, // Réduit de 20 à 18
		fontWeight: 'bold',
		marginBottom: 4, // Réduit de 6 à 4
		color: '#2563eb',
	},
	quoteInfoLine: {
		fontSize: 10, // Réduit de 11 à 10
	},
	validityBadge: {
		marginTop: 4, // Réduit de 8 à 4
		padding: 4, // Réduit de 6 à 4
		backgroundColor: '#dbeafe',
		borderRadius: 4,
	},
	validityText: {
		fontSize: 9, // Réduit de 10 à 9
		color: '#1e40af',
		textAlign: 'center',
	},

	// SECTIONS - Sans titre
	sectionBox: {
		borderWidth: 0.5,
		borderColor: '#ddd',
		borderStyle: 'solid',
		borderRadius: 4,
		padding: 6, // Réduit de 8 à 6
		marginBottom: 8, // Réduit pour économiser de l'espace
	},

	// CLIENT
	customerBlock: {
		marginBottom: 2, // Réduit de 4 à 2
		fontSize: 10, // Réduit de 11 à 10
	},
	customerLine: {
		fontSize: 10, // Réduit de 11 à 10
	},

	// TABLE
	tableHeader: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: '#ccc',
		borderBottomStyle: 'solid',
		paddingVertical: 3, // Réduit de 4 à 3
		marginTop: 6, // Réduit de 10 à 6
		backgroundColor: '#f3f3f3',
	},
	tableHeaderText: {
		fontSize: 9, // Réduit de 10 à 9
		fontWeight: 'bold',
	},
	tableRow: {
		flexDirection: 'row',
		paddingVertical: 3, // Réduit de 4 à 3
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
	// ✅ AJOUT: Colonne remise
	colDiscount: {
		flex: 0.9,
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
		marginTop: 8, // Réduit de 14 à 8
		marginLeft: 'auto',
		width: 230,
		padding: 6, // Réduit de 8 à 6
		borderWidth: 0.8,
		borderColor: '#ccc',
		borderStyle: 'solid',
		borderRadius: 4,
	},
	totalsRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 2, // Réduit de 3 à 2
	},
	totalsLabel: {
		fontSize: 10, // Réduit de 11 à 10
	},
	totalsValue: {
		fontSize: 10, // Réduit de 11 à 10
	},
	totalsGrand: {
		marginTop: 3, // Réduit de 4 à 3
		paddingTop: 4, // Réduit de 6 à 4
		borderTopWidth: 1,
		borderTopColor: '#000',
		borderTopStyle: 'solid',
	},
	totalsGrandText: {
		fontSize: 12, // Réduit de 13 à 12
		fontWeight: 'bold',
	},
	// ✅ AJOUT: Style pour les remises
	totalsDiscount: {
		fontSize: 10,
		fontStyle: 'italic',
		color: '#16a34a',
	},
	// ✅ Styles pour la ventilation TVA
	totalsTvaBreakdown: {
		fontSize: 9, // Réduit de 10 à 9
		color: '#555',
		fontStyle: 'italic',
		paddingLeft: 8,
	},
	totalsTvaSection: {
		marginTop: 2,
		paddingTop: 3, // Réduit de 4 à 3
		borderTopWidth: 0.5,
		borderTopColor: '#ddd',
		borderTopStyle: 'solid',
	},

	// NOTES
	notes: {
		marginTop: 10, // Réduit de 18 à 10
		fontSize: 9, // Réduit de 10 à 9
		color: '#555',
	},
	footerLegal: {
		marginTop: 10, // Réduit de 20 à 10
		fontSize: 8, // Réduit de 9 à 8
		color: '#444',
		borderTopWidth: 0.5,
		borderTopColor: '#ddd',
		borderTopStyle: 'solid',
		paddingTop: 6, // Réduit de 8 à 6
	},

	// DISCLAIMER DEVIS - Simplifié, sans encadrement
	disclaimerText: {
		marginTop: 10, // Réduit de 20 à 10
		fontSize: 8, // Réduit de 9 à 8
		color: '#666',
		fontStyle: 'italic',
	},

	// SIGNATURE - Hauteur réduite
	signatureBlock: {
		marginTop: 12, // Réduit de 30 à 12
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
	signatureBox: {
		width: '45%',
		padding: 6, // Réduit de 10 à 6
		borderWidth: 0.5,
		borderColor: '#ddd',
		borderStyle: 'solid',
		borderRadius: 4,
		minHeight: 40, // Réduit de 80 à 40
	},
	signatureTitle: {
		fontSize: 9, // Réduit de 10 à 9
		fontWeight: 'bold',
		marginBottom: 2, // Réduit de 4 à 2
	},
	signatureSubtitle: {
		fontSize: 8, // Réduit de 9 à 8
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

	const sellerName = quote.seller_name || ''

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

	// ✅ Calcul des remises (comme dans InvoicePdf.tsx)
	const cartDiscountMode = (quote as any).cart_discount_mode || ''
	const cartDiscountValue = (quote as any).cart_discount_value || 0
	const cartDiscountTtc = (quote as any).cart_discount_ttc || 0
	const lineDiscountsTotalTtc = (quote as any).line_discounts_total_ttc || 0

	const hasDiscounts = lineDiscountsTotalTtc > 0 || cartDiscountTtc > 0

	// Calcul du sous-total avant remises (si remises présentes)
	const subTotalBeforeDiscounts =
		quote.total_ttc + lineDiscountsTotalTtc + cartDiscountTtc

	// ✅ Utiliser la ventilation stockée, ou recalculer en fallback
	const getVatBreakdown = (): VatBreakdown[] => {
		// 1. Si la ventilation est stockée en base, l'utiliser directement
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
			const lineTotal = item.quantity * item.unit_price_ht

			// ✅ Prendre en compte les remises ligne
			const lineDiscount = (item as any).line_discount_amount_ht || 0
			const baseHt = lineTotal - lineDiscount

			const vat = (baseHt * rate) / 100
			const ttc = baseHt + vat

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

			entry.base_ht += baseHt
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

				{/* CLIENT - Sans titre "Client" */}
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

				{/* TABLE LIGNES - Sans titre "Détail de l'offre" */}
				<View>
					<View style={styles.tableHeader}>
						<Text style={[styles.colDescription, styles.tableHeaderText]}>
							Description
						</Text>
						<Text style={[styles.colQty, styles.tableHeaderText]}>Qté</Text>
						<Text style={[styles.colUnit, styles.tableHeaderText]}>
							P.U. HT
						</Text>
						{/* ✅ AJOUT: Colonne Remise */}
						<Text style={[styles.colDiscount, styles.tableHeaderText]}>
							Remise
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

						// ✅ AJOUT: Affichage de la remise ligne
						const lineDiscount = (item as any).line_discount_value || 0
						const lineDiscountMode =
							(item as any).line_discount_mode || 'percent'
						const discountText =
							lineDiscount > 0
								? `${lineDiscount.toFixed(2)}${lineDiscountMode === 'percent' ? '%' : '€'}`
								: '-'

						return (
							<View style={rowStyle} key={key}>
								<Text style={styles.colDescription}>{item.name}</Text>
								<Text style={styles.colQty}>{item.quantity}</Text>
								<Text style={styles.colUnit}>
									{item.unit_price_ht.toFixed(2)}
								</Text>
								{/* ✅ AJOUT: Affichage de la remise */}
								<Text style={styles.colDiscount}>{discountText}</Text>
								<Text style={styles.colTva}>{item.tva_rate}%</Text>
								<Text style={styles.colTotal}>{item.total_ttc.toFixed(2)}</Text>
							</View>
						)
					})}
				</View>

				{/* TOTAUX */}
				<View style={styles.totalsBlock}>
					{/* ✅ AJOUT: Sous-total avant remises (si remises présentes) */}
					{hasDiscounts && (
						<View style={styles.totalsRow}>
							<Text style={styles.totalsLabel}>Sous-total</Text>
							<Text style={styles.totalsValue}>
								{formatCurrency(subTotalBeforeDiscounts)}
							</Text>
						</View>
					)}

					{/* ✅ AJOUT: Remises lignes */}
					{lineDiscountsTotalTtc > 0 && (
						<View style={styles.totalsRow}>
							<Text style={styles.totalsDiscount}>Remises lignes</Text>
							<Text style={styles.totalsDiscount}>
								-{formatCurrency(lineDiscountsTotalTtc)}
							</Text>
						</View>
					)}

					{/* ✅ AJOUT: Remise globale */}
					{cartDiscountTtc > 0 && (
						<View style={styles.totalsRow}>
							<Text style={styles.totalsDiscount}>
								Remise globale
								{cartDiscountMode === 'percent' &&
									cartDiscountValue > 0 &&
									` (${cartDiscountValue}%)`}
							</Text>
							<Text style={styles.totalsDiscount}>
								-{formatCurrency(cartDiscountTtc)}
							</Text>
						</View>
					)}

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

				{/* DISCLAIMER DEVIS - Simplifié sans titre ni encadrement */}
				<Text style={styles.disclaimerText}>
					Ce document est un devis et ne constitue pas une facture. Les prix
					indiqués sont valables jusqu'à la date de validité mentionnée
					ci-dessus. Passé ce délai, nous nous réservons le droit de modifier
					les tarifs.
				</Text>

				{/* BLOC SIGNATURE - Hauteur réduite */}
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
