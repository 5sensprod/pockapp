// frontend/modules/connect/pdf/OrderPdf.tsx
//
// Composant @react-pdf/renderer pour générer le PDF d'un bon de commande.
// Calqué sur InvoicePdf — layout A4 identique, contenu adapté.

import type {
	CompaniesResponse,
	CustomersResponse,
} from '@/lib/pocketbase-types'
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
		alignItems: 'flex-start',
		marginBottom: 12,
		paddingBottom: 10,
		borderBottomWidth: 1,
		borderBottomColor: '#ddd',
		borderBottomStyle: 'solid',
	},
	companyBlock: { maxWidth: '60%' },
	logo: { width: 80, height: 80, marginBottom: 8, objectFit: 'contain' },
	companyName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
	companyLine: { fontSize: 10, color: '#444' },
	docInfo: { alignItems: 'flex-end' },
	docTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		color: '#1a1a1a',
		marginBottom: 4,
	},
	docNumber: {
		fontSize: 13,
		fontWeight: 'bold',
		color: '#333',
		marginBottom: 4,
	},
	docMeta: { fontSize: 10, color: '#555', marginBottom: 2 },
	section: { marginBottom: 12 },
	sectionTitle: {
		fontSize: 10,
		fontWeight: 'bold',
		color: '#888',
		textTransform: 'uppercase',
		marginBottom: 4,
	},
	customerName: { fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
	customerLine: { fontSize: 10, color: '#444', marginBottom: 1 },
	table: {
		marginTop: 8,
		borderWidth: 1,
		borderColor: '#ddd',
		borderStyle: 'solid',
		borderRadius: 4,
	},
	tableHeader: {
		flexDirection: 'row',
		backgroundColor: '#f5f5f5',
		borderBottomWidth: 1,
		borderBottomColor: '#ddd',
		borderBottomStyle: 'solid',
		paddingHorizontal: 8,
		paddingVertical: 5,
	},
	tableRow: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: '#eee',
		borderBottomStyle: 'solid',
		paddingHorizontal: 8,
		paddingVertical: 5,
	},
	tableRowLast: {
		flexDirection: 'row',
		paddingHorizontal: 8,
		paddingVertical: 5,
	},
	colDesc: { flex: 3 },
	colQty: { flex: 1, textAlign: 'right' },
	colPU: { flex: 1.2, textAlign: 'right' },
	colVat: { flex: 0.8, textAlign: 'right' },
	colTotal: { flex: 1.2, textAlign: 'right' },
	thText: { fontSize: 9, fontWeight: 'bold', color: '#555' },
	tdText: { fontSize: 10 },
	totalsBlock: { marginTop: 12, alignItems: 'flex-end' },
	totalRow: { flexDirection: 'row', gap: 16, marginBottom: 3 },
	totalLabel: { fontSize: 10, color: '#555', width: 80, textAlign: 'right' },
	totalValue: { fontSize: 10, width: 70, textAlign: 'right' },
	grandTotalLabel: {
		fontSize: 12,
		fontWeight: 'bold',
		width: 80,
		textAlign: 'right',
	},
	grandTotalValue: {
		fontSize: 12,
		fontWeight: 'bold',
		width: 70,
		textAlign: 'right',
	},
	notes: {
		marginTop: 16,
		padding: 8,
		backgroundColor: '#fafafa',
		borderWidth: 1,
		borderColor: '#eee',
		borderStyle: 'solid',
		borderRadius: 4,
	},
	notesTitle: {
		fontSize: 9,
		fontWeight: 'bold',
		color: '#888',
		textTransform: 'uppercase',
		marginBottom: 4,
	},
	notesText: { fontSize: 10, color: '#444' },
	footer: {
		position: 'absolute',
		bottom: 24,
		left: 36,
		right: 36,
		borderTopWidth: 1,
		borderTopColor: '#eee',
		borderTopStyle: 'solid',
		paddingTop: 6,
	},
	footerText: { fontSize: 8, color: '#999', textAlign: 'center' },
})

const fmt = (n: number) =>
	new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(n)

const fmtDate = (iso: string) =>
	new Intl.DateTimeFormat('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(new Date(iso))

interface OrderPdfDocumentProps {
	order: any
	customer: CustomersResponse | null
	company: CompaniesResponse | null
	companyLogoUrl: string | null
}

export function OrderPdfDocument({
	order,
	customer,
	company,
	companyLogoUrl,
}: OrderPdfDocumentProps) {
	const items: any[] = order.items ?? []
	const co = company as any

	return (
		<Document>
			<Page size='A4' style={styles.page}>
				{/* ── En-tête ──────────────────────────────────────────────── */}
				<View style={styles.header}>
					<View style={styles.companyBlock}>
						{companyLogoUrl && (
							<Image src={companyLogoUrl} style={styles.logo} />
						)}
						{co && (
							<>
								<Text style={styles.companyName}>{co.name ?? ''}</Text>
								{co.address && (
									<Text style={styles.companyLine}>{co.address}</Text>
								)}
								{co.city && (
									<Text style={styles.companyLine}>
										{co.postal_code ?? ''} {co.city}
									</Text>
								)}
								{co.siret && (
									<Text style={styles.companyLine}>SIRET : {co.siret}</Text>
								)}
								{co.vat_number && (
									<Text style={styles.companyLine}>TVA : {co.vat_number}</Text>
								)}
							</>
						)}
					</View>

					<View style={styles.docInfo}>
						<Text style={styles.docTitle}>BON DE COMMANDE</Text>
						<Text style={styles.docNumber}>{order.number}</Text>
						<Text style={styles.docMeta}>Date : {fmtDate(order.created)}</Text>
						{order.delivery_date && (
							<Text style={styles.docMeta}>
								Livraison prévue : {fmtDate(order.delivery_date)}
							</Text>
						)}
					</View>
				</View>

				{/* ── Client ───────────────────────────────────────────────── */}
				{(customer || order.customer_name) && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Client</Text>
						<Text style={styles.customerName}>
							{(customer as any)?.name ?? order.customer_name}
						</Text>
						{(customer as any)?.address && (
							<Text style={styles.customerLine}>
								{(customer as any).address}
							</Text>
						)}
						{(customer as any)?.city && (
							<Text style={styles.customerLine}>
								{(customer as any).postal_code ?? ''} {(customer as any).city}
							</Text>
						)}
						{(customer as any)?.email && (
							<Text style={styles.customerLine}>
								{(customer as any).email}
							</Text>
						)}
						{(customer as any)?.phone && (
							<Text style={styles.customerLine}>
								{(customer as any).phone}
							</Text>
						)}
					</View>
				)}

				{/* ── Lignes ───────────────────────────────────────────────── */}
				<View style={styles.table}>
					<View style={styles.tableHeader}>
						<Text style={[styles.thText, styles.colDesc]}>Description</Text>
						<Text style={[styles.thText, styles.colQty]}>Qté</Text>
						<Text style={[styles.thText, styles.colPU]}>PU HT</Text>
						<Text style={[styles.thText, styles.colVat]}>TVA</Text>
						<Text style={[styles.thText, styles.colTotal]}>Total HT</Text>
					</View>

					{items.map((item, idx) => {
						const isLast = idx === items.length - 1
						const rowStyle = isLast ? styles.tableRowLast : styles.tableRow
						const vatPct = Math.round((item.vat_rate ?? 0) * 100)
						return (
							<View key={item.id ?? idx} style={rowStyle}>
								<Text style={[styles.tdText, styles.colDesc]}>
									{item.description}
								</Text>
								<Text style={[styles.tdText, styles.colQty]}>
									{item.quantity}
								</Text>
								<Text style={[styles.tdText, styles.colPU]}>
									{fmt(item.unit_price_ht ?? 0)}
								</Text>
								<Text style={[styles.tdText, styles.colVat]}>{vatPct} %</Text>
								<Text style={[styles.tdText, styles.colTotal]}>
									{fmt(item.total_ht ?? 0)}
								</Text>
							</View>
						)
					})}
				</View>

				{/* ── Totaux ───────────────────────────────────────────────── */}
				<View style={styles.totalsBlock}>
					<View style={styles.totalRow}>
						<Text style={styles.totalLabel}>Total HT</Text>
						<Text style={styles.totalValue}>{fmt(order.total_ht ?? 0)}</Text>
					</View>
					<View style={styles.totalRow}>
						<Text style={styles.totalLabel}>TVA</Text>
						<Text style={styles.totalValue}>{fmt(order.total_tva ?? 0)}</Text>
					</View>
					<View style={styles.totalRow}>
						<Text style={styles.grandTotalLabel}>Total TTC</Text>
						<Text style={styles.grandTotalValue}>
							{fmt(order.total_ttc ?? 0)}
						</Text>
					</View>
				</View>

				{/* ── Notes ────────────────────────────────────────────────── */}
				{order.notes && (
					<View style={styles.notes}>
						<Text style={styles.notesTitle}>Notes</Text>
						<Text style={styles.notesText}>{order.notes}</Text>
					</View>
				)}

				{/* ── Pied de page ─────────────────────────────────────────── */}
				{co && (
					<View style={styles.footer} fixed>
						<Text style={styles.footerText}>
							{co.name ?? ''}
							{co.siret ? ` — SIRET : ${co.siret}` : ''}
							{co.email ? ` — ${co.email}` : ''}
						</Text>
					</View>
				)}
			</Page>
		</Document>
	)
}
