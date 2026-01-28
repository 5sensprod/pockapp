// frontend/modules/connect/components/InvoicePdf.tsx
// ✅ VERSION CORRIGÉE - Support TVA multi-taux avec vat_breakdown stocké
// ✅ Titre dynamique selon le type de document (FACTURE/AVOIR/TICKET)
// ✅ Utilise payment_terms du client en priorité

import type {
	CompaniesResponse,
	CustomersResponse,
} from '@/lib/pocketbase-types'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import {
	Document,
	Image,
	Page,
	StyleSheet,
	Text,
	View,
} from '@react-pdf/renderer'

const styles = StyleSheet.create({
	page: {
		padding: 36,
		fontSize: 11,
		fontFamily: 'Helvetica',
		lineHeight: 1.4,
	},

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

	customerBlock: {
		marginBottom: 4,
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
	totalsDiscount: {
		fontSize: 11,
		fontStyle: 'italic',
		color: '#16a34a',
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

// ✅ Type pour la ventilation TVA
interface VatBreakdown {
	rate: number
	base_ht: number
	vat: number
	total_ttc: number
}

// ✅ Helper pour convertir payment_terms en jours
const getPaymentTermsDays = (
	paymentTerms?: string,
): number | 'immediate' | null => {
	switch (paymentTerms) {
		case 'immediate':
			return 'immediate'
		case '30_days':
			return 30
		case '45_days':
			return 45
		case '60_days':
			return 60
		default:
			return null
	}
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

	const soldBy = (invoice as any)?.expand?.sold_by
	const sellerName =
		soldBy?.name ||
		soldBy?.username ||
		soldBy?.email ||
		(invoice as any)?.sold_by ||
		''

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

	if (company?.legal_form) legalLines.push(company.legal_form)

	if (typeof company?.share_capital === 'number' && company.share_capital > 0) {
		const capitalStr = company.share_capital.toLocaleString('fr-FR', {
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		})
		legalLines.push(`Capital social : ${capitalStr} €`)
	}

	if (company?.siren) legalLines.push(`SIREN : ${company.siren}`)
	if (company?.siret) legalLines.push(`SIRET : ${company.siret}`)
	if (company?.rcs) legalLines.push(`RCS : ${company.rcs}`)
	if (company?.ape_naf) legalLines.push(`Code APE/NAF : ${company.ape_naf}`)
	if (company?.vat_number)
		legalLines.push(`TVA intracom : ${company.vat_number}`)

	const contactParts: string[] = []
	if (company?.phone) contactParts.push(`Tél. : ${company.phone}`)
	if (company?.email) contactParts.push(`Email : ${company.email}`)
	const contactLine =
		contactParts.length > 0 ? contactParts.join(' - ') : undefined

	const websiteLine = company?.website ? `Site : ${company.website}` : undefined

	const cartDiscountTtc = (invoice as any)?.cart_discount_ttc || 0
	const cartDiscountMode = (invoice as any)?.cart_discount_mode || 'percent'
	const cartDiscountValue = (invoice as any)?.cart_discount_value || 0

	const lineDiscountsTotalTtc = (invoice as any)?.line_discounts_total_ttc || 0
	const hasDiscounts = cartDiscountTtc > 0 || lineDiscountsTotalTtc > 0
	const subTotalBeforeDiscounts =
		invoice.total_ttc + cartDiscountTtc + lineDiscountsTotalTtc

	// ✅ Calculer les délais de paiement
	// PRIORITÉ 1: payment_terms du client
	// PRIORITÉ 2: default_payment_terms_days de la company
	const customerPaymentTerms = (customer as any)?.payment_terms
	const customerPaymentDays = getPaymentTermsDays(customerPaymentTerms)

	const paymentTermsText = (() => {
		// 1. Utiliser payment_terms du client si disponible
		if (customerPaymentDays === 'immediate') {
			return 'Paiement immédiat.'
		}
		if (typeof customerPaymentDays === 'number') {
			return `Paiement à ${customerPaymentDays} jours.`
		}

		// 2. Fallback sur company.default_payment_terms_days
		if (company?.default_payment_terms_days) {
			return `Paiement à ${company.default_payment_terms_days} jours.`
		}

		// 3. Aucun délai défini
		return null
	})()

	const getVatBreakdown = (): VatBreakdown[] => {
		const storedBreakdown = (invoice as any)?.vat_breakdown

		if (Array.isArray(storedBreakdown) && storedBreakdown.length > 0) {
			return storedBreakdown
				.map((entry: any) => ({
					rate: entry.rate || 0,
					base_ht: entry.base_ht || 0,
					vat: entry.vat || 0,
					total_ttc: entry.total_ttc || 0,
				}))
				.sort((a: VatBreakdown, b: VatBreakdown) => a.rate - b.rate)
		}

		const vatBreakdownMap = new Map<
			number,
			{ rate: number; base_ht: number; vat: number; total_ttc: number }
		>()

		for (const item of invoice.items) {
			const rate = item.tva_rate || 0

			// ✅ Récupérer ou créer l'entrée de manière sûre
			let entry = vatBreakdownMap.get(rate)
			if (!entry) {
				entry = { rate, base_ht: 0, vat: 0, total_ttc: 0 }
				vatBreakdownMap.set(rate, entry)
			}

			const lineTotal = item.quantity * item.unit_price_ht
			const lineDiscount = (item as any).line_discount_amount_ht || 0
			const baseHt = lineTotal - lineDiscount

			const vat = (baseHt * rate) / 100
			const ttc = baseHt + vat

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

	// ✅ Déterminer le titre du document selon son type
	// LOGIQUE: Credit note > Ticket > Facture
	const getDocumentTitle = (): string => {
		// 🔍 DEBUG - Logs détaillés
		console.log('🔍 PDF getDocumentTitle appelée', {
			number: invoice.number,
			invoice_type: invoice.invoice_type,
			is_pos_ticket: invoice.is_pos_ticket,
		})

		// 1️⃣ PRIORITÉ 1: Vérifier si c'est un AVOIR (credit_note)
		// Un avoir peut être lié à un ticket OU une facture, mais c'est d'abord un AVOIR
		if (invoice.invoice_type === 'credit_note') {
			console.log('✅ → Retourne AVOIR (invoice_type === credit_note)')
			return 'AVOIR'
		}

		// 2️⃣ PRIORITÉ 2: Vérifier si c'est un TICKET (POS)
		// Seulement si ce n'est PAS un avoir
		if (invoice.is_pos_ticket === true || invoice.number?.startsWith('TIK-')) {
			console.log('✅ → Retourne TICKET (is_pos_ticket ou TIK-)')
			return 'TICKET'
		}

		// 3️⃣ Par défaut: FACTURE B2B standard
		console.log('✅ → Retourne FACTURE (défaut)')
		return 'FACTURE'
	}

	const documentTitle = getDocumentTitle()

	console.log('📄 Titre final du document:', documentTitle)
	const documentLabel =
		documentTitle === 'AVOIR'
			? 'Avoir n°'
			: documentTitle === 'TICKET'
				? 'Ticket n°'
				: 'Facture n°'

	return (
		<Document>
			<Page size='A4' style={styles.page}>
				<View style={styles.header}>
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

					<View style={styles.invoiceInfo}>
						<Text style={styles.invoiceTitle}>{documentTitle}</Text>
						<Text style={styles.invoiceInfoLine}>
							{documentLabel} {invoice.number}
						</Text>
						<Text style={styles.invoiceInfoLine}>
							Date : {formatDate(invoice.date)}
						</Text>
						{invoice.due_date && (
							<Text style={styles.invoiceInfoLine}>
								Échéance : {formatDate(invoice.due_date)}
							</Text>
						)}
						{sellerName && (
							<Text style={styles.invoiceInfoLine}>Vendeur : {sellerName}</Text>
						)}
					</View>
				</View>

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
						<Text style={[styles.colDiscount, styles.tableHeaderText]}>
							Remise
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
								<Text style={styles.colDiscount}>{discountText}</Text>
								<Text style={styles.colTva}>{item.tva_rate}%</Text>
								<Text style={styles.colTotal}>{item.total_ttc.toFixed(2)}</Text>
							</View>
						)
					})}
				</View>

				<View style={styles.totalsBlock}>
					{hasDiscounts && (
						<View style={styles.totalsRow}>
							<Text style={styles.totalsLabel}>Sous-total</Text>
							<Text style={styles.totalsValue}>
								{formatCurrency(subTotalBeforeDiscounts)}
							</Text>
						</View>
					)}

					{lineDiscountsTotalTtc > 0 && (
						<View style={styles.totalsRow}>
							<Text style={styles.totalsDiscount}>Remises lignes</Text>
							<Text style={styles.totalsDiscount}>
								-{formatCurrency(lineDiscountsTotalTtc)}
							</Text>
						</View>
					)}

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
							{formatCurrency(invoice.total_ht)}
						</Text>
					</View>

					{/* ✅ VENTILATION TVA MULTI-TAUX */}
					<View style={styles.totalsTvaSection}>
						{vatBreakdown.length > 1 ? (
							<>
								<View style={styles.totalsRow}>
									<Text style={styles.totalsLabel}>Total TVA</Text>
									<Text style={styles.totalsValue}>
										{formatCurrency(invoice.total_tva)}
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
									{formatCurrency(invoice.total_tva)}
								</Text>
							</View>
						)}
					</View>

					<View style={[styles.totalsRow, styles.totalsGrand]}>
						<Text style={styles.totalsGrandText}>Total TTC</Text>
						<Text style={styles.totalsGrandText}>
							{formatCurrency(invoice.total_ttc)}
						</Text>
					</View>
				</View>

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

				{invoice.notes && (
					<View style={styles.notes}>
						<Text>Notes :</Text>
						<Text>{invoice.notes}</Text>
					</View>
				)}

				{/* ✅ FOOTER LÉGAL - Utilise payment_terms du client en priorité */}
				{(company?.invoice_footer || paymentTermsText) && (
					<View style={styles.footerLegal}>
						{paymentTermsText && <Text>{paymentTermsText}</Text>}
						{company?.invoice_footer && <Text>{company.invoice_footer}</Text>}
					</View>
				)}
			</Page>
		</Document>
	)
}
