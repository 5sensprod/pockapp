// frontend/lib/pos/printerQueries.ts
// Adapté pour fonctionner en mode Wails (bindings) ET en mode HTTP (réseau)

import { queryOptions, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listWindowsPrinters } from './listPrinters'
import { openCashDrawer, printReceipt, testPrint } from './posPrint'
import { loadPosPrinterSettings } from './printerSettings'
import type { PrintReceiptPayload } from './printerSettings.schema'

// ========================================
// Query Keys Factory
// ========================================
export const printerKeys = {
	all: ['printers'] as const,
	lists: () => [...printerKeys.all, 'list'] as const,
	settings: () => [...printerKeys.all, 'settings'] as const,
}

// ========================================
// Query Options
// ========================================
export const printersQueryOptions = queryOptions({
	queryKey: printerKeys.lists(),
	queryFn: async () => {
		// ✅ MODIFIÉ : Fonctionne maintenant en Wails ET en HTTP
		return listWindowsPrinters()
	},
	staleTime: 1000 * 60 * 5, // 5 minutes
	gcTime: 1000 * 60 * 10, // 10 minutes
	retry: 1,
})

// ========================================
// Mutations
// ========================================

type PrintReceiptInput = {
	receipt: PrintReceiptPayload
	printerName?: string
	width?: 58 | 80
	companyId?: string
}

export function usePrintReceiptMutation() {
	return useMutation({
		mutationFn: async ({
			receipt,
			printerName,
			width,
			companyId,
		}: PrintReceiptInput) => {
			const settings = loadPosPrinterSettings()

			if (!settings.enabled) {
				throw new Error('Imprimante désactivée dans les paramètres')
			}

			const finalPrinterName = printerName || settings.printerName
			if (!finalPrinterName) {
				throw new Error('Aucune imprimante sélectionnée')
			}

			const finalWidth = width || settings.width

			// ✅ MODIFIÉ : Utilise la nouvelle fonction qui détecte automatiquement Wails/HTTP
			await printReceipt({
				printerName: finalPrinterName,
				width: finalWidth,
				receipt,
				companyId,
			})

			// Ouverture tiroir auto si espèces
			if (
				settings.autoOpenDrawer &&
				receipt.paymentMethod.toLowerCase().includes('espèce')
			) {
				await openCashDrawer({
					printerName: finalPrinterName,
					width: finalWidth,
				})
			}

			return { success: true }
		},
		onSuccess: () => {
			toast.success('Ticket imprimé avec succès')
		},
		onError: (error: Error) => {
			toast.error(`Échec d'impression: ${error.message}`)
		},
	})
}

export function useOpenCashDrawerMutation() {
	return useMutation({
		mutationFn: async () => {
			const settings = loadPosPrinterSettings()

			if (!settings.enabled || !settings.printerName) {
				throw new Error('Imprimante non configurée')
			}

			// ✅ MODIFIÉ : Utilise la nouvelle fonction qui détecte automatiquement Wails/HTTP
			await openCashDrawer({
				printerName: settings.printerName,
				width: settings.width,
			})

			return { success: true }
		},
		onSuccess: () => {
			toast.success('Tiroir caisse ouvert')
		},
		onError: (error: Error) => {
			toast.error(`Échec: ${error.message}`)
		},
	})
}

// ========================================
// Test Mutations
// ========================================
export function useTestPrintMutation() {
	return useMutation({
		mutationFn: async ({
			printerName,
			width,
		}: {
			printerName: string
			width: 58 | 80
		}) => {
			// ✅ MODIFIÉ : Utilise la nouvelle fonction qui détecte automatiquement Wails/HTTP
			await testPrint({
				printerName,
				width,
			})

			return { success: true }
		},
		onSuccess: () => {
			toast.success("Ticket de test envoyé à l'imprimante")
		},
		onError: (error: Error) => {
			toast.error(`Échec du test: ${error.message}`)
		},
	})
}
