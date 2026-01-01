// frontend/lib/pos/useCustomerDisplay.ts
// ✅ NOUVEAU - Basé sur display.ts avec contrôle délégué

import { useCallback, useEffect, useRef } from 'react'
import { updateDisplay } from './display'
import { loadDisplayWelcomeSettings } from './displaySettings'

interface CartItem {
	name: string
	quantity: number
	unitPrice: number
	totalPrice?: number
}

type DisplayPhase = 'idle' | 'item' | 'total' | 'payment' | 'change' | 'success'

interface UseCustomerDisplayProps {
	total?: number
	itemCount?: number
	currentItem?: CartItem | null
	paymentMethod?: string
	received?: number
	change?: number
	phase?: DisplayPhase
	enabled?: boolean // ✅ Nouveau : contrôle manuel de l'activation
}

/**
 * Hook pour gérer l'affichage client automatique selon l'état du panier
 *
 * ⚠️ Ce hook envoie des commandes au display. Assurez-vous d'avoir le contrôle
 * en appelant takeControl() avant d'utiliser ce hook, ou gérez les erreurs.
 *
 * @example
 * ```tsx
 * function CheckoutPage() {
 *   const { hasControl } = useDisplay()
 *
 *   // Prendre le contrôle au montage
 *   useEffect(() => {
 *     takeControl()
 *     return () => releaseControl()
 *   }, [])
 *
 *   // Utiliser le hook seulement si on a le contrôle
 *   useCustomerDisplay({
 *     total: cart.total,
 *     itemCount: cart.items.length,
 *     phase: checkoutPhase,
 *     enabled: hasControl,
 *   })
 * }
 * ```
 */
export function useCustomerDisplay({
	total = 0,
	itemCount = 0,
	currentItem = null,
	paymentMethod,
	received,
	change,
	phase = 'idle',
	enabled = true,
}: UseCustomerDisplayProps) {
	const lastDisplayedRef = useRef<string>('')

	const sendLines = useCallback(
		async (line1: string, line2 = '') => {
			if (!enabled) return

			const l1 = line1.substring(0, 20)
			const l2 = line2.substring(0, 20)
			const displayKey = `${l1}|${l2}`

			// Éviter les updates inutiles
			if (displayKey === lastDisplayedRef.current) return
			lastDisplayedRef.current = displayKey

			try {
				await updateDisplay(l1, l2, false)
			} catch (err) {
				// Erreur silencieuse si pas de contrôle
				// L'utilisateur verra le message d'erreur via toast dans display.ts
				console.warn('[useCustomerDisplay] Update failed:', err)
			}
		},
		[enabled],
	)

	// Effect pour affichage automatique selon la phase
	useEffect(() => {
		if (!enabled) return

		// ✅ NOUVEAU : Charger les messages de bienvenue depuis localStorage
		const settings = loadDisplayWelcomeSettings()

		let line1 = ''
		let line2 = ''

		// Priorité basée sur la phase
		if (phase === 'success') {
			line1 = 'Axe Musique'
			line2 = 'vous remercie'
		} else if (phase === 'change') {
			if (change !== undefined && change > 0) {
				line1 = 'RENDU'
				line2 = `${change.toFixed(2)} EUR`
			}
		} else if (phase === 'payment') {
			if (received !== undefined && paymentMethod) {
				line1 = paymentMethod.substring(0, 20)
				line2 = `Recu: ${received.toFixed(2)} EUR`
			} else if (total > 0) {
				line1 = 'A PAYER'
				line2 = `${total.toFixed(2)} EUR`
			}
		} else if (phase === 'total') {
			line1 = `Total: ${total.toFixed(2)} EUR`
			line2 = `${itemCount} article${itemCount > 1 ? 's' : ''}`
		} else if (phase === 'item') {
			if (currentItem) {
				line1 = currentItem.name.substring(0, 20)
				line2 = `${currentItem.quantity}x ${currentItem.unitPrice.toFixed(2)} EUR`
			}
		} else {
			// idle
			if (total > 0) {
				line1 = `Total: ${total.toFixed(2)} EUR`
				line2 = `${itemCount} article${itemCount > 1 ? 's' : ''}`
			} else {
				line1 = settings.welcomeLine1
				line2 = settings.welcomeLine2
			}
		}

		if (line1) {
			sendLines(line1, line2)
		}
	}, [
		enabled,
		phase,
		total,
		itemCount,
		currentItem,
		paymentMethod,
		received,
		change,
		sendLines,
	])

	// Fonctions helper pour contrôle manuel
	return {
		/**
		 * Afficher un texte personnalisé
		 */
		displayText: (line1: string, line2 = '') => sendLines(line1, line2),

		/**
		 * Afficher le message de bienvenue (utilise les settings)
		 */
		displayWelcome: () => {
			const settings = loadDisplayWelcomeSettings()
			sendLines(settings.welcomeLine1, settings.welcomeLine2)
		},

		/**
		 * Afficher le total
		 */
		displayTotal: (totalTtc: number, count = 0) => {
			sendLines(
				`Total: ${totalTtc.toFixed(2)} EUR`,
				`${count} article${count > 1 ? 's' : ''}`,
			)
		},

		/**
		 * Afficher le message de remerciement
		 */
		displayThankYou: () => {
			sendLines('Axe Musique', 'vous remercie')
		},

		/**
		 * Afficher un produit scanné
		 */
		displayItem: (item: CartItem) => {
			sendLines(
				item.name.substring(0, 20),
				`${item.quantity}x ${item.unitPrice.toFixed(2)} EUR`,
			)
		},

		/**
		 * Afficher le paiement en cours
		 */
		displayPayment: (method: string, amount: number) => {
			sendLines(method.substring(0, 20), `Recu: ${amount.toFixed(2)} EUR`)
		},

		/**
		 * Afficher le rendu
		 */
		displayChange: (changeAmount: number) => {
			sendLines('RENDU', `${changeAmount.toFixed(2)} EUR`)
		},
	}
}
