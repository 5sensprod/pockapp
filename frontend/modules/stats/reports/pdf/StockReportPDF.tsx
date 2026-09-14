// frontend/modules/stats/reports/pdf/StockReportPDF.tsx
// ═══════════════════════════════════════════════════════════════════════════
// LE PDF DU RAPPORT DE STOCK
// ═══════════════════════════════════════════════════════════════════════════
// AppPos fabriquait ce document sur le serveur, en PDFKit (1155 lignes,
// `AppServe/utils/pdf/`). Il est refait ici avec `@react-pdf/renderer`, qui est
// déjà l'outil du rapport Z, des factures et des devis : aucune route Go du
// dépôt ne produit de PDF hors du ticket de caisse.
//
// ⚠️ CE COMPOSANT N'ADDITIONNE RIEN. Tous les nombres qu'il met en page ont été
// calculés par `/api/reports/stock-statistics` et
// `/api/reports/stock-statistics/products`, y compris les sous-totaux de
// catégorie. Ajouter ici une somme, même « juste pour vérifier », créerait une
// seconde implémentation des mêmes règles — la forme exacte de la régression du
// 20 mai 2026, sur un document qui part chez le comptable.
// ═══════════════════════════════════════════════════════════════════════════

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { DetailStock } from '../lib/use-detail-stock'
import type { StatistiquesStock } from '../lib/use-statistiques-stock'

export interface InfosEntreprise {
	name?: string
	address?: string
	siret?: string
}

interface StockReportPDFProps {
	stats: StatistiquesStock
	/** Absent pour un rapport de synthèse. */
	detail?: DetailStock | null
	entreprise?: InfosEntreprise
	includeCompanyInfo?: boolean
	includeCharts?: boolean
	genereLe?: Date
}

// `@react-pdf/renderer` avec Helvetica ne couvre pas le séparateur fin
// insécable produit par `Intl` : il le dessine comme une barre oblique. C'est
// la même raison, et la même parade, que dans `ZReportPDF.tsx`.
export function formatEuros(montant: number): string {
	if (!Number.isFinite(montant)) return '0,00 €'
	const fixe = Math.abs(montant).toFixed(2)
	const [entier, decimales] = fixe.split('.')
	const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
	return `${montant < 0 ? '-' : ''}${groupe},${decimales} €`
}

export function formatNombre(valeur: number): string {
	if (!Number.isFinite(valeur)) return '0'
	return String(Math.round(valeur * 100) / 100).replace(
		/\B(?=(\d{3})+(?!\d))/g,
		' ',
	)
}

export function formatPourcent(valeur: number): string {
	if (!Number.isFinite(valeur)) return '0,0 %'
	return `${valeur.toFixed(1).replace('.', ',')} %`
}

/** Le libellé d'un taux, comme à l'écran (`utils/formatters.js`). */
export function libelleTaux(taux: number): string {
	if (taux === 0) return 'Occasion (0%)'
	if (taux === 5.5) return 'Réduit (5.5%)'
	if (taux === 20) return 'Normal (20%)'
	return `${taux}%`
}

const styles = StyleSheet.create({
	page: { padding: 32, fontSize: 9, fontFamily: 'Helvetica', color: '#111' },
	entete: {
		borderBottom: '2pt solid #111',
		paddingBottom: 8,
		marginBottom: 14,
	},
	titre: { fontSize: 16, fontWeight: 'bold' },
	sousTitre: { fontSize: 8, color: '#555', marginTop: 3 },
	societe: { fontSize: 8, color: '#333', marginTop: 6 },
	section: { marginBottom: 14 },
	titreSection: {
		fontSize: 11,
		fontWeight: 'bold',
		marginBottom: 6,
		paddingBottom: 3,
		borderBottom: '1pt solid #ccc',
	},
	grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	carte: {
		width: '48%',
		border: '1pt solid #ddd',
		borderRadius: 3,
		padding: 8,
		marginBottom: 8,
	},
	carteTitre: { fontSize: 8, color: '#555' },
	carteValeur: { fontSize: 14, fontWeight: 'bold', marginTop: 3 },
	carteNote: { fontSize: 7, color: '#777', marginTop: 3 },
	ligne: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingVertical: 2,
	},
	ligneBordee: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingVertical: 2,
		borderTop: '1pt solid #eee',
		marginTop: 2,
	},
	gras: { fontWeight: 'bold' },
	enteteTableau: {
		flexDirection: 'row',
		backgroundColor: '#f0f0f0',
		paddingVertical: 3,
		paddingHorizontal: 2,
		fontWeight: 'bold',
		fontSize: 8,
	},
	ligneTableau: {
		flexDirection: 'row',
		paddingVertical: 2,
		paddingHorizontal: 2,
		borderBottom: '0.5pt solid #eee',
		fontSize: 8,
	},
	titreGroupe: {
		fontSize: 10,
		fontWeight: 'bold',
		marginTop: 8,
		marginBottom: 3,
		backgroundColor: '#eef2f7',
		padding: 4,
	},
	sousTotal: {
		flexDirection: 'row',
		justifyContent: 'flex-end',
		gap: 12,
		paddingVertical: 3,
		borderTop: '1pt solid #ccc',
		fontSize: 8,
		fontWeight: 'bold',
	},
	note: {
		fontSize: 7,
		color: '#555',
		marginTop: 10,
		padding: 6,
		backgroundColor: '#f7f7f7',
	},
	pied: {
		position: 'absolute',
		bottom: 18,
		left: 32,
		right: 32,
		fontSize: 7,
		color: '#777',
		textAlign: 'center',
	},
	// Les colonnes du rapport détaillé. Leurs largeurs font 100 % : une colonne
	// ajoutée sans retirer ailleurs déborde de la page, sans erreur.
	colSku: { width: '14%' },
	colNom: { width: '34%' },
	colStock: { width: '8%', textAlign: 'right' },
	colAchat: { width: '11%', textAlign: 'right' },
	colVente: { width: '11%', textAlign: 'right' },
	colValeur: { width: '11%', textAlign: 'right' },
	colMarge: { width: '11%', textAlign: 'right' },
})

export function StockReportPDF({
	stats,
	detail,
	entreprise,
	includeCompanyInfo = true,
	includeCharts = true,
	genereLe = new Date(),
}: StockReportPDFProps) {
	const { summary, financial, performance, categories } = stats
	const tauxDeMarque =
		financial.retail_value > 0
			? (financial.potential_margin / financial.retail_value) * 100
			: 0
	const tvaEstimee = financial.retail_value_ttc
		? financial.retail_value_ttc - financial.retail_value
		: financial.tax_amount

	return (
		<Document>
			<Page size="A4" style={styles.page}>
				<View style={styles.entete}>
					<Text style={styles.titre}>Rapport de stock</Text>
					<Text style={styles.sousTitre}>
						{`Établi le ${genereLe.toLocaleDateString('fr-FR')} à ${genereLe.toLocaleTimeString(
							'fr-FR',
							{ hour: '2-digit', minute: '2-digit' },
						)} — ${formatNombre(summary.products_in_stock)} produits valorisés`}
					</Text>
					{includeCompanyInfo && entreprise?.name ? (
						<Text style={styles.societe}>
							{[entreprise.name, entreprise.address, entreprise.siret && `SIRET ${entreprise.siret}`]
								.filter(Boolean)
								.join(' — ')}
						</Text>
					) : null}
				</View>

				{/* ── Les quatre métriques ────────────────────────────────── */}
				<View style={styles.section}>
					<Text style={styles.titreSection}>Synthèse</Text>
					<View style={styles.grille}>
						<Carte
							titre="Produits en stock"
							valeur={formatNombre(summary.products_in_stock)}
							note={`${formatNombre(summary.simple_products)} fiches au total, ${formatNombre(
								summary.excluded_products,
							)} sans stock ou sans prix`}
						/>
						<Carte
							titre="Coût d'achat du stock (HT)"
							valeur={formatEuros(financial.inventory_value)}
							note={`Moyenne ${formatEuros(performance.avg_inventory_per_product)} par produit`}
						/>
						<Carte
							titre="Valeur de vente du stock (HT)"
							valeur={formatEuros(financial.retail_value)}
							note={`${formatEuros(financial.retail_value_ttc)} TTC`}
						/>
						<Carte
							titre="Marge commerciale brute (HT)"
							valeur={formatEuros(financial.potential_margin)}
							note={`Taux de marque ${formatPourcent(tauxDeMarque)} — taux de marge ${formatPourcent(
								financial.margin_percentage,
							)}`}
						/>
					</View>
				</View>

				{/* ── La ventilation par taux ─────────────────────────────── */}
				<View style={styles.section}>
					<Text style={styles.titreSection}>
						{`Répartition par taux de TVA — ${formatEuros(tvaEstimee)} estimés`}
					</Text>
					<View style={styles.enteteTableau}>
						<Text style={{ width: '24%' }}>Taux</Text>
						<Text style={{ width: '14%', textAlign: 'right' }}>Produits</Text>
						<Text style={{ width: '20%', textAlign: 'right' }}>Achat HT</Text>
						<Text style={{ width: '21%', textAlign: 'right' }}>Vente HT</Text>
						<Text style={{ width: '21%', textAlign: 'right' }}>TVA</Text>
					</View>
					{Object.entries(financial.tax_breakdown)
						.sort((a, b) => a[1].rate - b[1].rate)
						.map(([cle, tranche]) => (
							<View key={cle} style={styles.ligneTableau}>
								<Text style={{ width: '24%' }}>{libelleTaux(tranche.rate)}</Text>
								<Text style={{ width: '14%', textAlign: 'right' }}>
									{formatNombre(tranche.product_count)}
								</Text>
								<Text style={{ width: '20%', textAlign: 'right' }}>
									{formatEuros(tranche.inventory_value)}
								</Text>
								<Text style={{ width: '21%', textAlign: 'right' }}>
									{formatEuros(tranche.retail_value)}
								</Text>
								<Text style={{ width: '21%', textAlign: 'right' }}>
									{formatEuros(tranche.tax_amount)}
								</Text>
							</View>
						))}
				</View>

				{/* ── Le camembert, en tableau ────────────────────────────── */}
				{includeCharts && categories.rootCategories.length > 0 ? (
					<View style={styles.section} wrap={false}>
						<Text style={styles.titreSection}>
							Répartition par catégorie racine
						</Text>
						<View style={styles.enteteTableau}>
							<Text style={{ width: '44%' }}>Catégorie</Text>
							<Text style={{ width: '14%', textAlign: 'right' }}>Produits</Text>
							<Text style={{ width: '21%', textAlign: 'right' }}>Achat HT</Text>
							<Text style={{ width: '21%', textAlign: 'right' }}>Marge HT</Text>
						</View>
						{categories.rootCategories.map((part) => (
							<View key={part.name} style={styles.ligneTableau}>
								<Text style={{ width: '44%' }}>{part.name}</Text>
								<Text style={{ width: '14%', textAlign: 'right' }}>
									{formatNombre(part.products)}
								</Text>
								<Text style={{ width: '21%', textAlign: 'right' }}>
									{formatEuros(part.value)}
								</Text>
								<Text style={{ width: '21%', textAlign: 'right' }}>
									{formatEuros(part.margin)}
								</Text>
							</View>
						))}
					</View>
				) : null}

				<Text style={styles.note}>
					Tous les montants sont hors taxes. La marge est la différence entre le
					prix de vente HT et le prix d&apos;achat HT, multipliée par le stock.
					La TVA affichée est une ESTIMATION : celle que ce stock porterait
					s&apos;il était vendu entièrement au prix affiché. Ce n&apos;est pas
					une TVA collectée, et elle ne se rapproche d&apos;aucune déclaration.
				</Text>

				<Text
					style={styles.pied}
					render={({ pageNumber, totalPages }) =>
						`Rapport de stock — page ${pageNumber} sur ${totalPages}`
					}
					fixed
				/>
			</Page>

			{/* ── Le rapport détaillé ─────────────────────────────────────── */}
			{detail ? (
				<Page size="A4" style={styles.page}>
					<View style={styles.entete}>
						<Text style={styles.titre}>
							{detail.simplified
								? 'Rapport détaillé — totaux par catégorie'
								: 'Rapport détaillé — produits en stock'}
						</Text>
						<Text style={styles.sousTitre}>
							{`${formatNombre(detail.totals.product_count)} produits — ${formatEuros(
								detail.totals.inventory_value,
							)} d'achat HT`}
						</Text>
					</View>

					{detail.groups.map((groupe) => (
						<View key={groupe.category_id || 'sans-categorie'}>
							{groupe.category_name ? (
								<Text style={styles.titreGroupe}>
									{`${groupe.category_name} — ${formatNombre(groupe.product_count)} produits`}
								</Text>
							) : null}

							{groupe.lines?.length ? (
								<>
									<View style={styles.enteteTableau} fixed>
										<Text style={styles.colSku}>Référence</Text>
										<Text style={styles.colNom}>Désignation</Text>
										<Text style={styles.colStock}>Stock</Text>
										<Text style={styles.colAchat}>Achat HT</Text>
										<Text style={styles.colVente}>Vente HT</Text>
										<Text style={styles.colValeur}>Valeur HT</Text>
										<Text style={styles.colMarge}>Marge HT</Text>
									</View>
									{groupe.lines.map((ligne) => (
										<View key={ligne.id} style={styles.ligneTableau} wrap={false}>
											<Text style={styles.colSku}>{ligne.sku}</Text>
											<Text style={styles.colNom}>{ligne.designation}</Text>
											<Text style={styles.colStock}>
												{formatNombre(ligne.stock)}
											</Text>
											<Text style={styles.colAchat}>
												{formatEuros(ligne.purchase_price)}
											</Text>
											<Text style={styles.colVente}>
												{formatEuros(ligne.price_ht)}
											</Text>
											<Text style={styles.colValeur}>
												{formatEuros(ligne.inventory_value)}
											</Text>
											<Text style={styles.colMarge}>
												{formatEuros(ligne.margin)}
											</Text>
										</View>
									))}
								</>
							) : null}

							<View style={styles.sousTotal}>
								<Text>{`Achat HT ${formatEuros(groupe.inventory_value)}`}</Text>
								<Text>{`Vente HT ${formatEuros(groupe.retail_value)}`}</Text>
								<Text>{`Marge HT ${formatEuros(groupe.margin)}`}</Text>
							</View>
						</View>
					))}

					<View style={styles.section}>
						<View style={styles.ligneBordee}>
							<Text style={styles.gras}>
								{`Total — ${formatNombre(detail.totals.product_count)} produits`}
							</Text>
							<Text style={styles.gras}>
								{`${formatEuros(detail.totals.inventory_value)} d'achat HT · ${formatEuros(
									detail.totals.retail_value,
								)} de vente HT · ${formatEuros(detail.totals.margin)} de marge`}
							</Text>
						</View>
					</View>

					<Text
						style={styles.pied}
						render={({ pageNumber, totalPages }) =>
							`Rapport de stock — page ${pageNumber} sur ${totalPages}`
						}
						fixed
					/>
				</Page>
			) : null}
		</Document>
	)
}

function Carte({
	titre,
	valeur,
	note,
}: {
	titre: string
	valeur: string
	note: string
}) {
	return (
		<View style={styles.carte}>
			<Text style={styles.carteTitre}>{titre}</Text>
			<Text style={styles.carteValeur}>{valeur}</Text>
			<Text style={styles.carteNote}>{note}</Text>
		</View>
	)
}
