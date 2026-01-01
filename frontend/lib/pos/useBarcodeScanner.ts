// frontend/lib/pos/useBarcodeScanner.ts
// Détecte les scans de code-barres via clavier (mode HID)
// La scanette tape très vite (< 50ms entre chaque caractère) contrairement à un humain

import { useCallback, useEffect, useRef } from 'react'

export type BarcodeScanCallback = (barcode: string) => void

interface UseBarcodeOptions {
	/** Délai max entre 2 caractères pour considérer que c'est un scan (ms) */
	maxDelay?: number
	/** Longueur minimum du code-barres */
	minLength?: number
	/** Caractère de fin (par défaut Enter) */
	endChar?: string
	/** Activer/désactiver la détection */
	enabled?: boolean
}

/**
 * Hook pour détecter les scans de code-barres via clavier HID
 *
 * @example
 * ```tsx
 * useBarcodeScanner((barcode) => {
 *   console.log('Code scanné:', barcode)
 *   // Chercher le produit...
 * })
 * ```
 */
export function useBarcodeScanner(
	onScan: BarcodeScanCallback,
	options: UseBarcodeOptions = {},
) {
	const {
		maxDelay = 50, // 50ms entre chaque caractère max
		minLength = 4, // Minimum 4 caractères
		endChar = 'Enter', // Terminer par Enter
		enabled = true,
	} = options

	const bufferRef = useRef<string>('')
	const lastKeyTimeRef = useRef<number>(0)

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			// Ignorer si on est dans un input/textarea
			const target = event.target as HTMLElement
			if (
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.isContentEditable
			) {
				return
			}

			const now = Date.now()
			const timeSinceLastKey = now - lastKeyTimeRef.current
			lastKeyTimeRef.current = now

			// Si trop de temps s'est écoulé, reset le buffer
			if (timeSinceLastKey > maxDelay && bufferRef.current.length > 0) {
				bufferRef.current = ''
			}

			// Caractère de fin → envoyer le scan
			if (event.key === endChar) {
				event.preventDefault()

				const barcode = bufferRef.current.trim()
				bufferRef.current = ''

				if (barcode.length >= minLength) {
					console.log('[BarcodeScanner] Scan détecté:', barcode)
					onScan(barcode)
				}
				return
			}

			// Ajouter le caractère au buffer (uniquement les caractères imprimables)
			if (event.key.length === 1) {
				bufferRef.current += event.key
			}
		},
		[onScan, maxDelay, minLength, endChar],
	)

	useEffect(() => {
		if (!enabled) return

		window.addEventListener('keydown', handleKeyDown)
		console.log('[BarcodeScanner] Écoute clavier activée')

		return () => {
			window.removeEventListener('keydown', handleKeyDown)
			console.log('[BarcodeScanner] Écoute clavier désactivée')
		}
	}, [handleKeyDown, enabled])
}

/**
 * Version avec état pour afficher le dernier scan
 */
import { useState } from 'react'

export function useBarcodeScannerWithState(
	onScan?: BarcodeScanCallback,
	options: UseBarcodeOptions = {},
) {
	const [lastScan, setLastScan] = useState<string | null>(null)
	const [scanCount, setScanCount] = useState(0)

	useBarcodeScanner((barcode) => {
		setLastScan(barcode)
		setScanCount((c) => c + 1)
		onScan?.(barcode)
	}, options)

	return { lastScan, scanCount }
}
