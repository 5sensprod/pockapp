// frontend/lib/pos/customerDisplayQueries.ts
import { isWailsEnv } from '@/lib/wails'
import { queryOptions, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { loadCustomerDisplaySettings } from './customerDisplaySettings'
import type { DisplayTextPayload } from './customerDisplaySettings.schema'

// Utilise les fonctions depuis window.go.main.App (comme dans app.go)
declare global {
	interface Window {
		go?: {
			main?: {
				App?: {
					ListSerialPorts: () => Promise<string[]>
					SendDisplayText: (input: {
						portName: string
						baudRate: string
						protocol: string
						line1: string
						line2: string
						clearFirst: boolean
					}) => Promise<void>
					TestDisplay: (input: {
						portName: string
						baudRate: string
						protocol: string
					}) => Promise<void>
				}
			}
		}
	}
}

// ========================================
// Fonctions Wails Helpers
// ========================================
async function listPorts(): Promise<string[]> {
	if (!isWailsEnv() || !window.go?.main?.App?.ListSerialPorts) {
		console.log('❌ ListSerialPorts not available')
		return []
	}
	console.log('✅ Calling ListSerialPorts...')
	const ports = await window.go.main.App.ListSerialPorts()
	console.log('📡 Ports found:', ports)
	return ports
}

async function sendText(payload: {
	portName: string
	baudRate: string
	protocol: string
	line1: string
	line2: string
	clearFirst: boolean
}): Promise<void> {
	if (!isWailsEnv() || !window.go?.main?.App?.SendDisplayText) {
		throw new Error('Customer display not available in web environment')
	}
	return window.go.main.App.SendDisplayText(payload)
}

async function testDisplay(payload: {
	portName: string
	baudRate: string
	protocol: string
}): Promise<void> {
	if (!isWailsEnv() || !window.go?.main?.App?.TestDisplay) {
		throw new Error('Customer display not available in web environment')
	}
	return window.go.main.App.TestDisplay(payload)
}

// ========================================
// Query Keys Factory
// ========================================
export const customerDisplayKeys = {
	all: ['customerDisplay'] as const,
	ports: () => [...customerDisplayKeys.all, 'ports'] as const,
	settings: () => [...customerDisplayKeys.all, 'settings'] as const,
}

// ========================================
// Query Options
// ========================================
export const customerDisplayPortsQueryOptions = queryOptions({
	queryKey: customerDisplayKeys.ports(),
	queryFn: async () => {
		if (!isWailsEnv()) {
			return []
		}
		return listPorts()
	},
	staleTime: 1000 * 60 * 5, // 5 minutes
	gcTime: 1000 * 60 * 10, // 10 minutes
	retry: 1,
})

// ========================================
// Mutations
// ========================================

type SendTextInput = {
	text: DisplayTextPayload
	portName?: string
	baudRate?: string
	protocol?: string
}

export function useSendTextToDisplayMutation() {
	return useMutation({
		mutationFn: async ({
			text,
			portName,
			baudRate,
			protocol,
		}: SendTextInput) => {
			const settings = loadCustomerDisplaySettings()

			if (!isWailsEnv()) {
				throw new Error(
					"Afficheur client disponible uniquement dans l'application desktop",
				)
			}

			if (!settings.enabled) {
				throw new Error('Afficheur client désactivé dans les paramètres')
			}

			const finalPortName = portName || settings.portName
			if (!finalPortName) {
				throw new Error('Aucun port sélectionné')
			}

			const finalBaudRate = baudRate || settings.baudRate
			const finalProtocol = protocol || settings.protocol

			await sendText({
				portName: finalPortName,
				baudRate: finalBaudRate,
				protocol: finalProtocol,
				line1: text.line1,
				line2: text.line2,
				clearFirst: text.clearFirst,
			})

			return { success: true }
		},
		onError: (error: Error) => {
			toast.error(`Échec affichage: ${error.message}`)
		},
	})
}

// ========================================
// Test Mutations
// ========================================
export function useTestDisplayMutation() {
	return useMutation({
		mutationFn: async ({
			portName,
			baudRate,
			protocol,
		}: {
			portName: string
			baudRate: string
			protocol: string
		}) => {
			await testDisplay({
				portName,
				baudRate,
				protocol,
			})

			return { success: true }
		},
		onSuccess: () => {
			toast.success("Message de test envoyé à l'afficheur")
		},
		onError: (error: Error) => {
			toast.error(`Échec du test: ${error.message}`)
		},
	})
}
