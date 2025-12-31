// frontend/modules/cash/components/terminal/hooks/useBarcodeScanner.ts
import * as React from 'react'

interface UseBarcodeScannerProps {
	enabled: boolean
	onScan: (barcode: string) => void
	onEscape?: () => void
}

export function useBarcodeScanner({
	enabled,
	onScan,
	onEscape,
}: UseBarcodeScannerProps) {
	React.useEffect(() => {
		if (!enabled) return

		let scanBuffer = ''
		let scanTimeout: NodeJS.Timeout | null = null

		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target.getAttribute('contenteditable') === 'true'
			) {
				return
			}

			if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
				e.preventDefault()
				scanBuffer += e.key

				if (scanTimeout) clearTimeout(scanTimeout)

				scanTimeout = setTimeout(() => {
					scanBuffer = ''
				}, 100)
			}

			if (e.key === 'Enter' && scanBuffer.length > 0) {
				e.preventDefault()
				onScan(scanBuffer)
				scanBuffer = ''
			}

			if (e.key === 'Escape') {
				e.preventDefault()
				if (onEscape) onEscape()
			}
		}

		document.addEventListener('keydown', handleKeyDown)

		return () => {
			document.removeEventListener('keydown', handleKeyDown)
			if (scanTimeout) clearTimeout(scanTimeout)
		}
	}, [enabled, onScan, onEscape])
}
