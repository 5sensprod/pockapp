// frontend/lib/pos/printerSettings.schema.ts
import { z } from 'zod'

export const posPrinterSettingsSchema = z.object({
	enabled: z.boolean(),
	printerName: z.string().min(1, 'Sélectionnez une imprimante'),
	width: z.union([z.literal(58), z.literal(80)]),
	autoPrint: z.boolean(),
	autoOpenDrawer: z.boolean(),
})

export type PosPrinterSettings = z.infer<typeof posPrinterSettingsSchema>

export const printReceiptPayloadSchema = z.object({
	companyName: z.string().optional(),
	invoiceNumber: z.string(),
	dateLabel: z.string(),
	items: z.array(
		z.object({
			name: z.string(),
			qty: z.number().positive(),
			unitTtc: z.number().positive(),
			totalTtc: z.number().positive(),
		}),
	),
	subtotalTtc: z.number(),
	discountAmount: z.number().optional(),
	totalTtc: z.number().positive(),
	taxAmount: z.number(),
	paymentMethod: z.string(),
	received: z.number().optional(),
	change: z.number().optional(),
})

export type PrintReceiptPayload = z.infer<typeof printReceiptPayloadSchema>
