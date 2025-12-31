// frontend/modules/cash/components/reports/hooks/usePrintReport.ts
import { useCallback } from 'react'
import { toast } from 'sonner'

/**
 * Hook pour gérer l'impression et l'export de rapports
 */
export function usePrintReport() {
	const handlePrint = useCallback(() => {
		window.print()
	}, [])

	const handleExport = useCallback(() => {
		// TODO: Implémenter l'export PDF avec @react-pdf/renderer
		toast.info('Export PDF en cours de développement')
	}, [])

	return {
		handlePrint,
		handleExport,
	}
}
