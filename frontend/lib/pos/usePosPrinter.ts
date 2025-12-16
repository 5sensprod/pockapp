// frontend/lib/pos/usePosPrinter.ts
import { isWailsEnv } from '@/lib/wails'
import {
	useOpenCashDrawerMutation,
	usePrintReceiptMutation,
} from './printerQueries'
import { loadPosPrinterSettings } from './printerSettings'
import type { PrintReceiptPayload } from './printerSettings.schema'

/**
 * Hook principal pour gérer l'impression POS
 * Utilise React Query pour la gestion d'état et les mutations
 */
export function usePosPrinter() {
	const printMutation = usePrintReceiptMutation()
	const drawerMutation = useOpenCashDrawerMutation()

	const settings = loadPosPrinterSettings()
	const isReady = isWailsEnv() && settings.enabled && !!settings.printerName

	return {
		// Actions
		print: (receipt: PrintReceiptPayload) =>
			printMutation.mutateAsync({ receipt }),
		openDrawer: () => drawerMutation.mutateAsync(),

		// États
		isPrinting: printMutation.isPending,
		isOpeningDrawer: drawerMutation.isPending,
		isReady,

		// Erreurs
		printError: printMutation.error,
		drawerError: drawerMutation.error,

		// Réinitialisation
		reset: () => {
			printMutation.reset()
			drawerMutation.reset()
		},
	}
}
