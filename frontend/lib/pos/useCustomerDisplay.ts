// frontend/lib/pos/useCustomerDisplay.ts
import { useCallback, useEffect, useRef } from 'react'
import { useSendTextToDisplayMutation } from './customerDisplayQueries'
import { loadCustomerDisplaySettings } from './customerDisplaySettings'

interface CartItem {
	name: string
	quantity: number
	unitPrice: number
	totalPrice?: number
}

// ✅ Ajout d'une phase pour contrôler l'affichage
type DisplayPhase = 'idle' | 'item' | 'total' | 'payment' | 'change' | 'success'

interface UseCustomerDisplayProps {
	total?: number
	itemCount?: number
	currentItem?: CartItem | null
	paymentMethod?: string
	received?: number
	change?: number
	phase?: DisplayPhase // ✅ Nouvelle prop
}

export function useCustomerDisplay({
	total = 0,
	itemCount = 0,
	currentItem = null,
	paymentMethod,
	received,
	change,
	phase = 'idle', // ✅ Par défaut idle
}: UseCustomerDisplayProps) {
	const sendText = useSendTextToDisplayMutation()
	const lastDisplayedRef = useRef<string>('')

	const sendLines = useCallback(
		(line1: string, line2 = '') => {
			const settings = loadCustomerDisplaySettings()
			if (!settings.enabled) return

			const l1 = line1.substring(0, 20)
			const l2 = line2.substring(0, 20)
			const displayKey = `${l1}|${l2}`

			if (displayKey === lastDisplayedRef.current) return
			lastDisplayedRef.current = displayKey

			sendText.mutate({
				text: {
					line1: l1,
					line2: l2,
					clearFirst: true,
				},
			})
		},
		[sendText],
	)

	useEffect(() => {
		const settings = loadCustomerDisplaySettings()

		if (!settings.enabled || !settings.autoDisplay) return

		let line1 = ''
		let line2 = ''

		// ✅ Priorité basée sur la phase explicite
		switch (phase) {
			case 'success':
				line1 = 'Axe Musique'
				line2 = 'vous remercie'
				break

			case 'change':
				if (change !== undefined && change > 0) {
					line1 = 'RENDU'
					line2 = `${change.toFixed(2)} EUR`
				}
				break

			case 'payment':
				if (received !== undefined && paymentMethod) {
					line1 = paymentMethod.substring(0, 20)
					line2 = `Recu: ${received.toFixed(2)} EUR`
				} else if (total > 0) {
					line1 = `A PAYER`
					line2 = `${total.toFixed(2)} EUR`
				}
				break

			case 'total':
				line1 = `Total: ${total.toFixed(2)} EUR`
				line2 = `${itemCount} article${itemCount > 1 ? 's' : ''}`
				break

			case 'item':
				if (currentItem) {
					line1 = currentItem.name.substring(0, 20)
					line2 = `${currentItem.quantity}x ${currentItem.unitPrice.toFixed(2)} EUR`
				}
				break

			default:
				if (total > 0) {
					line1 = `Total: ${total.toFixed(2)} EUR`
					line2 = `${itemCount} article${itemCount > 1 ? 's' : ''}`
				} else {
					line1 = settings.welcomeLine1 || 'Bienvenue'
					line2 = settings.welcomeLine2 || ''
				}
				break
		}

		if (line1) {
			sendLines(line1, line2)
		}
	}, [
		phase,
		total,
		itemCount,
		currentItem,
		paymentMethod,
		received,
		change,
		sendLines,
	])

	return {
		displayText: (line1: string, line2 = '') => sendLines(line1, line2),

		displayWelcome: () => {
			const settings = loadCustomerDisplaySettings()
			sendLines(
				settings.welcomeLine1 || 'Bienvenue',
				settings.welcomeLine2 || '',
			)
		},

		displayTotal: (totalTtc: number, count = 0) => {
			sendLines(
				`Total: ${totalTtc.toFixed(2)} EUR`,
				`${count} article${count > 1 ? 's' : ''}`,
			)
		},

		displayThankYou: () => {
			sendLines('Axe Musique', 'vous remercie')
		},

		isSending: sendText.isPending,
	}
}
