// frontend/modules/stats/reports/lib/use-export-pdf.tsx
// ═══════════════════════════════════════════════════════════════════════════
// L'EXPORT PDF DU RAPPORT DE STOCK
// ═══════════════════════════════════════════════════════════════════════════
// Remplace `hooks/useAdvancedPDFExport.js` d'AppPos, qui postait les options à
// `/api/products/stock/statistics/export-pdf` et téléchargeait le blob rendu
// par le serveur. Le document est maintenant fabriqué sur le poste, par
// `@react-pdf/renderer` — l'outil du rapport Z et des factures.
//
// Ce que le hook fait, et rien de plus : demander au Go les nombres, les passer
// au composant PDF, poser le fichier. Il n'additionne rien.
// ═══════════════════════════════════════════════════════════════════════════

import { pdf } from '@react-pdf/renderer'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { StockReportPDF } from '../pdf/StockReportPDF'
import type { InfosEntreprise } from '../pdf/StockReportPDF'
import { useDetailStock } from './use-detail-stock'
import type { StatistiquesStock } from './use-statistiques-stock'

export interface OptionsExportPDF {
	reportType?: 'summary' | 'detailed'
	includeCompanyInfo?: boolean
	includeCharts?: boolean
	sortBy?: string
	sortOrder?: string
	groupByCategory?: boolean
	selectedCategories?: string[]
	includeUncategorized?: boolean
	isSimplified?: boolean
	companyInfo?: InfosEntreprise
}

export function useExportPDF(
	stats: StatistiquesStock | undefined,
	companyId?: string,
) {
	const [isExporting, setIsExporting] = useState(false)
	const chargerDetail = useDetailStock()

	const exportStockStatisticsToPDF = useCallback(
		async (options: OptionsExportPDF = {}) => {
			if (!stats) {
				toast.error("Les statistiques ne sont pas chargées, rien à exporter")
				return
			}

			setIsExporting(true)
			try {
				// Le détail n'est demandé QUE pour un rapport détaillé : c'est la
				// requête qui lit les 2999 fiches, et un rapport de synthèse n'en
				// imprime aucune.
				const detail =
					options.reportType === 'detailed'
						? await chargerDetail({
								groupByCategory: options.groupByCategory,
								selectedCategories: options.selectedCategories,
								includeUncategorized: options.includeUncategorized,
								isSimplified: options.isSimplified,
								sortBy: options.sortBy,
								sortOrder: options.sortOrder,
								companyId,
							})
						: null

				const blob = await pdf(
					<StockReportPDF
						stats={stats}
						detail={detail}
						entreprise={options.companyInfo}
						includeCompanyInfo={options.includeCompanyInfo}
						includeCharts={options.includeCharts}
					/>,
				).toBlob()

				telecharger(blob, nomDuFichier(options.reportType))
				toast.success('Rapport PDF enregistré')
			} catch (erreur) {
				console.error('Export PDF du rapport de stock :', erreur)
				toast.error("Le rapport PDF n'a pas pu être produit")
				throw erreur
			} finally {
				setIsExporting(false)
			}
		},
		[stats, chargerDetail, companyId],
	)

	return { isExporting, exportStockStatisticsToPDF }
}

function nomDuFichier(type?: string): string {
	const jour = new Date().toISOString().slice(0, 10)
	return `rapport-stock-${type === 'detailed' ? 'detaille' : 'synthese'}-${jour}.pdf`
}

function telecharger(blob: Blob, nom: string) {
	const url = URL.createObjectURL(blob)
	const lien = document.createElement('a')
	lien.href = url
	lien.download = nom
	document.body.appendChild(lien)
	lien.click()
	document.body.removeChild(lien)
	URL.revokeObjectURL(url)
}
