// frontend/lib/pos/useCustomerDisplay.ts
import { useEffect, useRef } from 'react'
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

/**
 * Hook pour gérer l'affichage automatique sur l'afficheur client VFD
 */
/**
 * Hook pour gérer l'affichage automatique sur l'afficheur client VFD
 */
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

	useEffect(() => {
		const settings = loadCustomerDisplaySettings()

		// Ne rien faire si désactivé ou pas en mode auto
		if (!settings.enabled || !settings.autoDisplay) {
			return
		}

		let line1 = ''
		let line2 = ''

		// Logique d'affichage selon l'état
		if (change !== undefined && change > 0) {
			// Affichage du rendu de monnaie
			line1 = 'RENDU'
			line2 = `${change.toFixed(2)} EUR`
		} else if (received !== undefined && paymentMethod) {
			// Affichage du paiement en cours
			line1 = paymentMethod.substring(0, 20)
			line2 = `Recu: ${received.toFixed(2)} EUR`
		} else if (currentItem) {
			// Affichage de l'article actuel
			line1 = currentItem.name.substring(0, 20)
			// Calculer le total si pas fourni
			// const itemTotal =
			// 	currentItem.totalPrice ?? currentItem.unitPrice * currentItem.quantity
			line2 = `${currentItem.quantity}x ${currentItem.unitPrice.toFixed(2)} EUR`
		} else if (total > 0) {
			// Affichage du total
			line1 = `Total: ${total.toFixed(2)} EUR`
			line2 = `${itemCount} article${itemCount > 1 ? 's' : ''}`
		} else {
			// Message d'accueil par défaut
			line1 = settings.welcomeMessage || 'Bienvenue'
			line2 = ''
		}

		// Optimisation: ne pas envoyer si identique au dernier affichage
		const displayKey = `${line1}|${line2}`
		if (displayKey === lastDisplayedRef.current) {
			return
		}

		lastDisplayedRef.current = displayKey

		// Envoi du texte à l'afficheur
		sendText.mutate({
			text: {
				line1,
				line2,
				clearFirst: true,
			},
		})
	}, [total, itemCount, currentItem, paymentMethod, received, change, sendText])

	return {
		displayText: (line1: string, line2 = '') => {
			sendText.mutate({
				text: {
					line1: line1.substring(0, 20),
					line2: line2.substring(0, 20),
					clearFirst: true,
				},
			})
		},
		displayWelcome: () => {
			const settings = loadCustomerDisplaySettings()
			sendText.mutate({
				text: {
					line1: settings.welcomeMessage || 'Bienvenue',
					line2: '',
					clearFirst: true,
				},
			})
		},
		isSending: sendText.isPending,
	}
}
