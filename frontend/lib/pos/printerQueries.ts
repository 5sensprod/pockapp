import { isWailsEnv } from '@/lib/wails'
// frontend/lib/pos/printerQueries.ts
import {
	queryOptions,
	useMutation,
	// useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { listWindowsPrinters } from './listPrinters'
import { openCashDrawer, printReceipt } from './posPrint'
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
		if (!isWailsEnv()) {
			return []
		}
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
}

export function usePrintReceiptMutation() {
	return useMutation({
		mutationFn: async ({ receipt, printerName, width }: PrintReceiptInput) => {
			const settings = loadPosPrinterSettings()

			if (!isWailsEnv()) {
				throw new Error(
					"Impression disponible uniquement dans l'application desktop",
				)
			}

			if (!settings.enabled) {
				throw new Error('Imprimante désactivée dans les paramètres')
			}

			const finalPrinterName = printerName || settings.printerName
			if (!finalPrinterName) {
				throw new Error('Aucune imprimante sélectionnée')
			}

			const finalWidth = width || settings.width

			// Impression
			await printReceipt({
				printerName: finalPrinterName,
				width: finalWidth,
				receipt,
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

			if (!isWailsEnv()) {
				throw new Error(
					"Tiroir caisse disponible uniquement dans l'application desktop",
				)
			}

			if (!settings.enabled || !settings.printerName) {
				throw new Error('Imprimante non configurée')
			}

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
			const testReceipt: PrintReceiptPayload = {
				companyName: 'TEST BOUTIQUE',
				invoiceNumber: 'TEST-001',
				dateLabel: new Date().toLocaleString('fr-FR'),
				items: [
					{
						name: 'Article Test',
						qty: 1,
						unitTtc: 10.0,
						totalTtc: 10.0,
					},
				],
				subtotalTtc: 10.0,
				totalTtc: 10.0,
				taxAmount: 1.67,
				paymentMethod: 'Test',
			}

			await printReceipt({
				printerName,
				width,
				receipt: testReceipt,
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
