// frontend/lib/pos/useBarcodeScanner.ts
// Fix Biome exhaustive-deps: clearIdleTimer / tryEmit / resetBuffer mémorisés et listés.

import { useCallback, useEffect, useRef } from 'react'
import { type BarcodeRules, validateBarcode } from './Barcode'

export type BarcodeScanCallback = (barcode: string) => void

interface UseBarcodeOptions {
	maxDelay?: number
	minLength?: number
	endChar?: string
	enabled?: boolean

	idleFinalizeMs?: number
	ignoreWhenInInput?: boolean
	validateRules?: BarcodeRules
	duplicateWindowMs?: number
}

export function useBarcodeScanner(
	onScan: BarcodeScanCallback,
	options: UseBarcodeOptions = {},
) {
	const {
		maxDelay = 50,
		minLength = 4,
		endChar = 'Enter',
		enabled = true,

		idleFinalizeMs = 80,
		ignoreWhenInInput = true,
		validateRules,
		duplicateWindowMs = 250,
	} = options

	const bufferRef = useRef<string>('')
	const lastKeyTimeRef = useRef<number>(0)
	const idleTimerRef = useRef<number | null>(null)
	const lastEmittedRef = useRef<{ code: string; at: number } | null>(null)

	const clearIdleTimer = useCallback(() => {
		if (idleTimerRef.current != null) {
			window.clearTimeout(idleTimerRef.current)
			idleTimerRef.current = null
		}
	}, [])

	const resetBuffer = useCallback(() => {
		clearIdleTimer()
		bufferRef.current = ''
	}, [clearIdleTimer])

	const tryEmit = useCallback(() => {
		clearIdleTimer()
		const raw = bufferRef.current.trim()
		bufferRef.current = ''
		if (!raw) return

		// Validation stricte si fournie, sinon fallback minLength
		let code = raw
		if (validateRules) {
			const res = validateBarcode(raw, validateRules)
			if (!res.ok) return
			code = res.code
		} else {
			if (raw.length < minLength) return
		}

		const last = lastEmittedRef.current
		const now = Date.now()
		if (last && last.code === code && now - last.at <= duplicateWindowMs) return

		lastEmittedRef.current = { code, at: now }
		onScan(code)
	}, [clearIdleTimer, duplicateWindowMs, minLength, onScan, validateRules])

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			const target = event.target as HTMLElement

			if (ignoreWhenInInput) {
				if (
					target.tagName === 'INPUT' ||
					target.tagName === 'TEXTAREA' ||
					target.isContentEditable
				) {
					return
				}
			}

			const now = Date.now()
			const timeSinceLastKey = now - lastKeyTimeRef.current
			lastKeyTimeRef.current = now

			// Si trop long => on finalize ce qu'on a (scan sans Enter partiel) puis reset
			if (timeSinceLastKey > maxDelay && bufferRef.current.length > 0) {
				tryEmit()
				resetBuffer()
			}

			// Caractère de fin → envoyer le scan
			if (event.key === endChar) {
				event.preventDefault()
				tryEmit()
				resetBuffer()
				return
			}

			// Ajouter le caractère au buffer (uniquement imprimable)
			if (
				event.key.length === 1 &&
				!(event.ctrlKey || event.metaKey || event.altKey)
			) {
				bufferRef.current += event.key

				// Finalisation sur idle (scanette sans suffix)
				clearIdleTimer()
				idleTimerRef.current = window.setTimeout(() => {
					if (bufferRef.current.length > 0) {
						tryEmit()
						resetBuffer()
					}
				}, idleFinalizeMs)
			}
		},
		[
			clearIdleTimer,
			endChar,
			idleFinalizeMs,
			ignoreWhenInInput,
			maxDelay,
			resetBuffer,
			tryEmit,
		],
	)

	useEffect(() => {
		if (!enabled) return

		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
			resetBuffer()
		}
	}, [enabled, handleKeyDown, resetBuffer])
}
