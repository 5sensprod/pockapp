import type { RapportZ } from '@/lib/types/cash.types'
import { pdf } from '@react-pdf/renderer'
// frontend/modules/cash/components/reports/hooks/usePrintReport.tsx
import { useCallback } from 'react'
import { toast } from 'sonner'
import { ZReportPDF } from '../ZReportPDF'

/**
 * Hook pour gérer l'impression et l'export de rapports
 */
export function usePrintReport() {
	const handlePrint = useCallback(() => {
		window.print()
	}, [])

	const handleExport = useCallback(async (rapport?: RapportZ) => {
		if (!rapport) {
			toast.error('Aucun rapport à exporter')
			return
		}

		try {
			toast.info('Génération du PDF en cours...')

			// Générer le PDF avec @react-pdf/renderer
			const blob = await pdf(<ZReportPDF rapport={rapport} />).toBlob()

			// Créer un nom de fichier avec le numéro du rapport et la date
			const fileName = `${rapport.number}_${rapport.date}.pdf`

			// Créer un lien de téléchargement
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = fileName
			link.click()

			// Nettoyer
			URL.revokeObjectURL(url)

			toast.success('PDF exporté avec succès')
		} catch (error) {
			console.error('Erreur export PDF:', error)
			toast.error("Erreur lors de l'export PDF")
		}
	}, [])

	return {
		handlePrint,
		handleExport,
	}
}
