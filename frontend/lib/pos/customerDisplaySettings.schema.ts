// frontend/lib/pos/customerDisplaySettings.schema.ts
import { z } from 'zod'

export const customerDisplaySettingsSchema = z.object({
	enabled: z.boolean(),
	portName: z.string(),
	baudRate: z.enum(['9600', '19200']),
	protocol: z.enum([
		'LD220',
		'EPSON_D101',
		'AEDEX',
		'UTC_S',
		'UTC_P',
		'ADM788',
		'DSP800',
		'CD5220',
		'EMAX',
		'LOGIC_CONTROL',
	]),
	autoDisplay: z.boolean(),
	welcomeMessage: z.string(),
	brightness: z.number().min(0).max(100),
})

// Type inféré du schéma (ligne corrigée ici !)
export type CustomerDisplaySettings = z.infer<
	typeof customerDisplaySettingsSchema
>

// Valeurs par défaut (pour loadCustomerDisplaySettings)
export const defaultCustomerDisplaySettings: CustomerDisplaySettings = {
	enabled: false,
	portName: '',
	baudRate: '9600',
	protocol: 'EPSON_D101',
	autoDisplay: true,
	welcomeMessage: 'Bienvenue',
	brightness: 100,
}

// Payload pour envoyer du texte à l'afficheur
export const displayTextPayloadSchema = z.object({
	line1: z.string().max(20).default(''),
	line2: z.string().max(20).default(''),
	clearFirst: z.boolean().default(true),
})

export type DisplayTextPayload = z.infer<typeof displayTextPayloadSchema>
