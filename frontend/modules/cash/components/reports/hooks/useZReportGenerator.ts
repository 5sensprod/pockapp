// frontend/modules/cash/components/reports/hooks/useZReportGenerator.ts
import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useZReport, useZReportCheck, useZReportList } from '@/lib/queries/cash'

interface UseZReportGeneratorProps {
	selectedRegisterId: string
	selectedDate: string
}

/**
 * Hook pour gérer la génération et l'état d'un rapport Z
 */
export function useZReportGenerator({
	selectedRegisterId,
	selectedDate,
}: UseZReportGeneratorProps) {
	const [shouldGenerate, setShouldGenerate] = useState(false)

	// Vérifier si un rapport existe déjà
	const { data: checkResult, isLoading: isLoadingCheck } = useZReportCheck(
		selectedRegisterId,
		selectedDate,
		{ enabled: !!selectedRegisterId && !!selectedDate },
	)

	// Charger le rapport Z
	const {
		data: rapportZ,
		isLoading: isLoadingRapport,
		refetch,
		isError,
		error,
	} = useZReport(selectedRegisterId, selectedDate, {
		enabled: shouldGenerate && !!selectedRegisterId && !!selectedDate,
	})

	// Liste historique
	const { data: zReportsList } = useZReportList(selectedRegisterId, {
		enabled: !!selectedRegisterId,
	})

	// Action de génération
	const handleGenerate = useCallback(() => {
		if (!selectedRegisterId) {
			toast.error('Veuillez sélectionner une caisse')
			return
		}
		if (!selectedDate) {
			toast.error('Veuillez sélectionner une date')
			return
		}

		if (checkResult?.exists) {
			toast.info('Ce rapport Z existe déjà, il sera affiché')
		}

		setShouldGenerate(true)
		refetch()
	}, [selectedRegisterId, selectedDate, checkResult, refetch])

	return {
		// État du rapport
		rapportZ,
		isLoadingRapport,
		isError,
		error,

		// Vérification
		checkResult,
		isLoadingCheck,

		// Historique
		zReportsList,

		// Actions
		handleGenerate,
		setShouldGenerate,
	}
}
