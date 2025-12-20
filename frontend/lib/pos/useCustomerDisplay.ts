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

interface UseCustomerDisplayProps {
	total?: number
	itemCount?: number
	currentItem?: CartItem | null
	paymentMethod?: string
	received?: number
	change?: number
}

export function useCustomerDisplay({
	total = 0,
	itemCount = 0,
	currentItem = null,
	paymentMethod,
	received,
	change,
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

		// Ne rien faire si désactivé ou pas en mode auto
		if (!settings.enabled || !settings.autoDisplay) return

		let line1 = ''
		let line2 = ''

		if (change !== undefined && change > 0) {
			line1 = 'RENDU'
			line2 = `${change.toFixed(2)} EUR`
		} else if (received !== undefined && paymentMethod) {
			line1 = paymentMethod.substring(0, 20)
			line2 = `Recu: ${received.toFixed(2)} EUR`
		} else if (currentItem) {
			line1 = currentItem.name.substring(0, 20)
			line2 = `${currentItem.quantity}x ${currentItem.unitPrice.toFixed(2)} EUR`
		} else if (total > 0) {
			line1 = `Total: ${total.toFixed(2)} EUR`
			line2 = `${itemCount} article${itemCount > 1 ? 's' : ''}`
		} else {
			line1 = settings.welcomeMessage || 'Bienvenue'
			line2 = ''
		}

		sendLines(line1, line2)
	}, [
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
			sendLines(settings.welcomeMessage || 'Bienvenue', '')
		},

		displayTotal: (totalTtc: number, count = 0) => {
			sendLines(
				`Total: ${totalTtc.toFixed(2)} EUR`,
				`${count} article${count > 1 ? 's' : ''}`,
			)
		},

		// ✅ NOUVEAU : message de remerciement
		displayThankYou: () => {
			sendLines('Axe Musique', 'vous remercie')
		},

		isSending: sendText.isPending,
	}
}
