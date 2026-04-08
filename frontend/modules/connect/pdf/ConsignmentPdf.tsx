// frontend/modules/connect/components/ConsignmentPdf.tsx
// Bordereau de dépôt-vente conforme aux usages commerciaux français
// Basé sur les articles L521-1 et suivants du Code de commerce

import type {
	CompaniesResponse,
	CustomersResponse,
} from '@/lib/pocketbase-types'
import type { ConsignmentItemDto } from '@/lib/queries/consignmentItems'
import {
	Document,
	Image,
	Page,
	StyleSheet,
	Text,
	View,
} from '@react-pdf/renderer'

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
	page: {
		padding: 28,
		fontSize: 9,
		fontFamily: 'Helvetica',
		lineHeight: 1.5,
		color: '#1a1a1a',
	},

	// ── En-tête ──
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 12,
		paddingBottom: 8,
		borderBottomWidth: 1.5,
		borderBottomColor: '#1a1a1a',
		borderBottomStyle: 'solid',
	},
	logo: {
		width: 70,
		height: 70,
		objectFit: 'contain',
		marginBottom: 6,
	},
	companyName: {
		fontSize: 14,
		fontFamily: 'Helvetica-Bold',
		marginBottom: 3,
	},
	companyLine: {
		fontSize: 9,
		color: '#444',
	},
	docTitleBlock: {
		alignItems: 'flex-end',
	},
	docTitle: {
		fontSize: 18,
		fontFamily: 'Helvetica-Bold',
		letterSpacing: 1,
		marginBottom: 4,
	},
	docSubtitle: {
		fontSize: 9,
		color: '#666',
		marginBottom: 2,
	},
	docRef: {
		fontSize: 10,
		fontFamily: 'Helvetica-Bold',
		marginBottom: 2,
	},
	docDate: {
		fontSize: 9,
		color: '#444',
	},

	// ── Parties (déposant / dépositaire) ──
	partiesRow: {
		flexDirection: 'row',
		gap: 10,
		marginBottom: 10,
	},
	partyBox: {
		flex: 1,
		padding: 7,
		borderWidth: 0.5,
		borderColor: '#ccc',
		borderStyle: 'solid',
		borderRadius: 3,
	},
	partyLabel: {
		fontSize: 8,
		fontFamily: 'Helvetica-Bold',
		color: '#888',
		textTransform: 'uppercase',
		letterSpacing: 0.8,
		marginBottom: 5,
		paddingBottom: 4,
		borderBottomWidth: 0.5,
		borderBottomColor: '#e0e0e0',
		borderBottomStyle: 'solid',
	},
	partyName: {
		fontSize: 10,
		fontFamily: 'Helvetica-Bold',
		marginBottom: 2,
	},
	partyLine: {
		fontSize: 9,
		color: '#444',
		marginBottom: 1,
	},

	// ── Tableau article ──
	sectionTitle: {
		fontSize: 9,
		fontFamily: 'Helvetica-Bold',
		marginBottom: 4,
		marginTop: 4,
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	table: {
		borderWidth: 0.5,
		borderColor: '#ccc',
		borderStyle: 'solid',
		borderRadius: 3,
		overflow: 'hidden',
	},
	tableHeader: {
		flexDirection: 'row',
		backgroundColor: '#f0f0f0',
		paddingVertical: 3,
		paddingHorizontal: 6,
		borderBottomWidth: 0.5,
		borderBottomColor: '#ccc',
		borderBottomStyle: 'solid',
	},
	tableHeaderCell: {
		fontSize: 8,
		fontFamily: 'Helvetica-Bold',
		textTransform: 'uppercase',
		letterSpacing: 0.3,
		color: '#555',
	},
	tableRow: {
		flexDirection: 'row',
		paddingVertical: 5,
		paddingHorizontal: 6,
		borderBottomWidth: 0.5,
		borderBottomColor: '#eee',
		borderBottomStyle: 'solid',
	},
	tableRowLast: {
		borderBottomWidth: 0,
	},
	colDescription: { flex: 3 },
	colStatus: { flex: 1, textAlign: 'center' },
	colSellerPrice: { flex: 1.2, textAlign: 'right' },
	colStorePrice: { flex: 1.2, textAlign: 'right' },
	colCommission: { flex: 1, textAlign: 'right' },
	cellText: { fontSize: 8 },
	cellBold: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
	cellMuted: { fontSize: 7, color: '#888', marginTop: 1 },

	// ── Récap financier ──
	summaryBlock: {
		marginTop: 8,
		marginLeft: 'auto',
		width: 210,
		padding: 8,
		borderWidth: 0.8,
		borderColor: '#1a1a1a',
		borderStyle: 'solid',
		borderRadius: 3,
	},
	summaryRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 3,
	},
	summaryLabel: { fontSize: 8, color: '#444' },
	summaryValue: { fontSize: 8 },
	summaryDivider: {
		marginVertical: 4,
		borderTopWidth: 0.5,
		borderTopColor: '#ccc',
		borderTopStyle: 'solid',
	},
	summaryTotalRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 2,
	},
	summaryTotalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
	summaryTotalValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },

	// ── Conditions générales ──
	conditionsBlock: {
		marginTop: 8,
		padding: 7,
		backgroundColor: '#f8f8f8',
		borderWidth: 0.5,
		borderColor: '#ddd',
		borderStyle: 'solid',
		borderRadius: 3,
	},
	conditionsTitle: {
		fontSize: 8,
		fontFamily: 'Helvetica-Bold',
		marginBottom: 4,
		textTransform: 'uppercase',
		letterSpacing: 0.4,
	},
	conditionItem: {
		flexDirection: 'row',
		marginBottom: 2,
		gap: 3,
	},
	conditionBullet: { fontSize: 7, color: '#888', width: 10 },
	conditionText: { fontSize: 7, color: '#555', flex: 1, lineHeight: 1.3 },

	// ── Signatures ──
	signaturesRow: {
		flexDirection: 'row',
		gap: 16,
		marginTop: 12,
	},
	signatureBox: {
		flex: 1,
		borderTopWidth: 0.5,
		borderTopColor: '#aaa',
		borderTopStyle: 'solid',
		paddingTop: 6,
	},
	signatureLabel: {
		fontSize: 8,
		color: '#888',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
		marginBottom: 2,
	},
	signatureName: {
		fontSize: 9,
		fontFamily: 'Helvetica-Bold',
	},
	signatureSpace: {
		height: 28,
	},
	signatureMention: {
		fontSize: 7,
		color: '#aaa',
		marginTop: 2,
	},

	// ── Pied de page légal ──
	footer: {
		position: 'absolute',
		bottom: 16,
		left: 28,
		right: 28,
		borderTopWidth: 0.5,
		borderTopColor: '#ddd',
		borderTopStyle: 'solid',
		paddingTop: 6,
	},
	footerText: {
		fontSize: 7,
		color: '#999',
		textAlign: 'center',
	},
})

// ─── Types & Props ────────────────────────────────────────────────────────────

export interface ConsignmentPdfProps {
	item: ConsignmentItemDto
	customer: CustomersResponse
	company: CompaniesResponse
	companyLogoUrl?: string | null
	/** Numéro de bordereau, ex: "DV-2024-001" */
	referenceNumber?: string
	/** Commission du magasin en % */
	commissionRate?: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number) =>
	new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
		amount,
	)

const formatDate = (dateStr?: string) =>
	dateStr
		? new Date(dateStr).toLocaleDateString('fr-FR', {
				day: '2-digit',
				month: 'long',
				year: 'numeric',
			})
		: new Date().toLocaleDateString('fr-FR', {
				day: '2-digit',
				month: 'long',
				year: 'numeric',
			})

const statusLabel = (status: ConsignmentItemDto['status']) => {
	switch (status) {
		case 'available':
			return 'En vente'
		case 'sold':
			return 'Vendu'
		case 'returned':
			return 'Rendu'
		default:
			return 'En vente'
	}
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function ConsignmentPdfDocument({
	item,
	customer,
	company,
	companyLogoUrl,
	referenceNumber,
	commissionRate = 20,
}: ConsignmentPdfProps) {
	const companyName = company.trade_name || company.name || 'Votre entreprise'

	// Adresse entreprise
	const companyAddress = [
		company.address_line1,
		company.address_line2,
		[company.zip_code, company.city].filter(Boolean).join(' '),
	].filter(Boolean)

	// Infos légales entreprise
	const legalParts: string[] = []
	if (company.legal_form) legalParts.push(company.legal_form)
	if (company.siret) legalParts.push(`SIRET : ${company.siret}`)
	if (company.rcs) legalParts.push(`RCS : ${company.rcs}`)
	if (company.vat_number) legalParts.push(`TVA : ${company.vat_number}`)

	// Calcul commission et net déposant
	const commission = (item.store_price * commissionRate) / 100
	const netSeller = item.store_price - commission

	// Numéro de référence
	const ref =
		referenceNumber ||
		`DV-${new Date(item.created).getFullYear()}-${item.id.slice(0, 6).toUpperCase()}`

	return (
		<Document
			title={`Bordereau de dépôt-vente ${ref}`}
			author={companyName}
			subject='Contrat de dépôt-vente'
			keywords='dépôt-vente, instrument occasion, bordereau'
		>
			<Page size='A4' style={styles.page}>
				{/* ── En-tête ── */}
				<View style={styles.header}>
					<View>
						{companyLogoUrl && (
							<Image src={companyLogoUrl} style={styles.logo} />
						)}
						<Text style={styles.companyName}>{companyName}</Text>
						{companyAddress.map((line) => (
							<Text key={line} style={styles.companyLine}>
								{line}
							</Text>
						))}
						{company.phone && (
							<Text style={styles.companyLine}>Tél. : {company.phone}</Text>
						)}
						{company.email && (
							<Text style={styles.companyLine}>{company.email}</Text>
						)}
					</View>
					<View style={styles.docTitleBlock}>
						<Text style={styles.docTitle}>DÉPÔT-VENTE</Text>
						<Text style={styles.docSubtitle}>
							Bordereau de dépôt de bien d'occasion
						</Text>
						<Text style={styles.docRef}>Réf. : {ref}</Text>
						<Text style={styles.docDate}>
							Établi le {formatDate(item.created)}
						</Text>
					</View>
				</View>

				{/* ── Parties ── */}
				<View style={styles.partiesRow}>
					{/* Déposant (client) */}
					<View style={styles.partyBox}>
						<Text style={styles.partyLabel}>Déposant (vendeur)</Text>
						<Text style={styles.partyName}>{customer.name}</Text>
						{customer.company && (
							<Text style={styles.partyLine}>{customer.company}</Text>
						)}
						{customer.address && (
							<Text style={styles.partyLine}>{customer.address}</Text>
						)}
						{customer.email && (
							<Text style={styles.partyLine}>Email : {customer.email}</Text>
						)}
						{customer.phone && (
							<Text style={styles.partyLine}>Tél. : {customer.phone}</Text>
						)}
					</View>

					{/* Dépositaire (magasin) */}
					<View style={styles.partyBox}>
						<Text style={styles.partyLabel}>Dépositaire (magasin)</Text>
						<Text style={styles.partyName}>{companyName}</Text>
						{companyAddress.map((line) => (
							<Text key={line} style={styles.partyLine}>
								{line}
							</Text>
						))}
						{company.phone && (
							<Text style={styles.partyLine}>Tél. : {company.phone}</Text>
						)}
						{company.email && (
							<Text style={styles.partyLine}>{company.email}</Text>
						)}
						{legalParts.length > 0 && (
							<Text style={[styles.partyLine, { marginTop: 4 }]}>
								{legalParts.join(' — ')}
							</Text>
						)}
					</View>
				</View>

				{/* ── Article déposé ── */}
				<Text style={styles.sectionTitle}>Article déposé</Text>
				<View style={styles.table}>
					<View style={styles.tableHeader}>
						<Text style={[styles.tableHeaderCell, styles.colDescription]}>
							Description de l'article
						</Text>
						<Text style={[styles.tableHeaderCell, styles.colStatus]}>
							Statut
						</Text>
						<Text style={[styles.tableHeaderCell, styles.colSellerPrice]}>
							Prix vendeur
						</Text>
						<Text style={[styles.tableHeaderCell, styles.colStorePrice]}>
							Prix de vente
						</Text>
						<Text style={[styles.tableHeaderCell, styles.colCommission]}>
							Commission
						</Text>
					</View>

					<View style={[styles.tableRow, styles.tableRowLast]}>
						<View style={styles.colDescription}>
							<Text style={styles.cellBold}>{item.description}</Text>
							{item.notes ? (
								<Text style={styles.cellMuted}>{item.notes}</Text>
							) : null}
							<Text style={styles.cellMuted}>
								Déposé le {formatDate(item.created)}
							</Text>
						</View>
						<View style={styles.colStatus}>
							<Text style={styles.cellText}>{statusLabel(item.status)}</Text>
						</View>
						<View style={styles.colSellerPrice}>
							<Text style={styles.cellText}>
								{formatCurrency(item.seller_price)}
							</Text>
						</View>
						<View style={styles.colStorePrice}>
							<Text style={styles.cellBold}>
								{formatCurrency(item.store_price)}
							</Text>
						</View>
						<View style={styles.colCommission}>
							<Text style={styles.cellText}>{commissionRate} %</Text>
						</View>
					</View>
				</View>

				{/* ── Récap financier ── */}
				<View style={styles.summaryBlock}>
					<View style={styles.summaryRow}>
						<Text style={styles.summaryLabel}>Prix de vente affiché</Text>
						<Text style={styles.summaryValue}>
							{formatCurrency(item.store_price)}
						</Text>
					</View>
					<View style={styles.summaryRow}>
						<Text style={styles.summaryLabel}>
							Commission magasin ({commissionRate} %)
						</Text>
						<Text style={styles.summaryValue}>
							- {formatCurrency(commission)}
						</Text>
					</View>
					<View style={styles.summaryDivider} />
					<View style={styles.summaryTotalRow}>
						<Text style={styles.summaryTotalLabel}>
							Net reversé au déposant
						</Text>
						<Text style={styles.summaryTotalValue}>
							{formatCurrency(netSeller)}
						</Text>
					</View>
					<View style={{ marginTop: 4 }}>
						<Text style={[styles.summaryLabel, { fontSize: 7, color: '#aaa' }]}>
							* Somme reversée au déposant après la vente de l'article
						</Text>
					</View>
				</View>

				{/* ── Conditions générales ── */}
				<View style={styles.conditionsBlock}>
					<Text style={styles.conditionsTitle}>Conditions du dépôt-vente</Text>

					{[
						`Le déposant atteste être l'unique propriétaire de l'article et avoir le droit de le céder.`,
						`L'article est déposé pour une durée de 90 jours à compter de la date du présent bordereau. Au-delà, le déposant s'engage à reprendre l'article sous 15 jours sur demande du dépositaire.`,
						`Le dépositaire s'engage à conserver l'article avec diligence et à en assurer la présentation en magasin. Sa responsabilité est engagée en cas de perte ou de détérioration due à sa négligence.`,
						`En cas de vente, le dépositaire versera au déposant la somme nette indiquée ci-dessus dans un délai de 15 jours suivant la vente, déduction faite de la commission convenue.`,
						`Le prix de vente affiché pourra faire l'objet d'une négociation avec l'acheteur. Toute remise accordée sera imputée proportionnellement sur la part du déposant et sur la commission du dépositaire.`,
						`Le déposant peut récupérer son article à tout moment, sous réserve d'un préavis de 48 heures et hors période de négociation engagée avec un acheteur.`,
						`Le présent contrat est soumis au droit français. En cas de litige, les parties s'engagent à rechercher une solution amiable avant toute action judiciaire.`,
					].map((text, i) => (
						<View key={text} style={styles.conditionItem}>
							<Text style={styles.conditionBullet}>{i + 1}.</Text>
							<Text style={styles.conditionText}>{text}</Text>
						</View>
					))}
				</View>

				{/* ── Signatures ── */}
				<View style={styles.signaturesRow}>
					<View style={styles.signatureBox}>
						<Text style={styles.signatureLabel}>
							Le déposant — Lu et approuvé
						</Text>
						<Text style={styles.signatureName}>{customer.name}</Text>
						<View style={styles.signatureSpace} />
						<Text style={styles.signatureMention}>
							Signature précédée de la mention « Bon pour accord »
						</Text>
					</View>
					<View style={styles.signatureBox}>
						<Text style={styles.signatureLabel}>
							Le dépositaire — Lu et approuvé
						</Text>
						<Text style={styles.signatureName}>{companyName}</Text>
						<View style={styles.signatureSpace} />
						<Text style={styles.signatureMention}>
							Signature et cachet du magasin
						</Text>
					</View>
				</View>

				{/* ── Pied de page légal ── */}
				<View style={styles.footer} fixed>
					<Text style={styles.footerText}>
						{companyName}
						{legalParts.length > 0 ? ` — ${legalParts.join(' — ')}` : ''}
						{' — '}
						Document établi le {formatDate(item.created)}
						{' — '}
						Réf. {ref}
					</Text>
				</View>
			</Page>
		</Document>
	)
}
