// frontend/lib/pos/posPrint.ts
import { isWailsEnv } from '@/lib/wails'

export type PrintReceiptPayload = {
	companyName?: string
	invoiceNumber: string
	dateLabel: string
	sellerName?: string
	items: Array<{
		name: string
		qty: number
		unitTtc: number
		totalTtc: number
		tvaRate?: number
		hasDiscount?: boolean | 0
		baseUnitTtc?: number
		discountText?: string | null
	}>
	grandSubtotal?: number
	lineDiscountsTotal?: number
	subtotalTtc: number
	discountAmount?: number
	discountPercent?: number
	totalTtc: number
	taxAmount: number
	totalSavings?: number
	vatBreakdown?: Array<{
		rate: number
		baseHt: number
		vat: number
		totalTtc: number
	}>
	paymentMethod: string
	received?: number
	change?: number
}

type PrintPosReceiptInput = {
	printerName: string
	width: 58 | 80
	companyId?: string
	receipt: PrintReceiptPayload
}

type OpenCashDrawerInput = {
	printerName: string
	width: 58 | 80
}

// ============================================================================
// CONFIGURATION - URL dynamique
// ============================================================================

function getPosApiBaseUrl(): string {
	if (isWailsEnv()) {
		// Mode Wails desktop : localhost
		return 'http://127.0.0.1:8090/api/pos'
	}
	// Mode web : utilise l'origin actuel (fonctionne en local ET en public)
	return `${document.location.origin}/api/pos`
}

// ============================================================================
// WAILS BINDINGS
// ============================================================================

function getGoApp(): any {
	return (window as any)?.go?.main?.App
}

async function callGo(method: string, payload: any) {
	try {
		const mod: any = await import('@/wailsjs/go/main/App')
		const fn = mod?.[method]
		if (typeof fn === 'function') return await fn(payload)
	} catch {}

	const goApp = getGoApp()
	const fn = goApp?.[method]
	if (typeof fn !== 'function') {
		throw new Error(`Binding Wails manquant: ${method}`)
	}
	return await fn(payload)
}

// ============================================================================
// API HTTP
// ============================================================================

async function printReceiptHttp(payload: PrintPosReceiptInput): Promise<void> {
	const response = await fetch(`${getPosApiBaseUrl()}/print`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			printerName: payload.printerName,
			width: payload.width,
			companyId: payload.companyId || '',
			receipt: payload.receipt,
		}),
	})
	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || `HTTP ${response.status}`)
	}
	return response.json()
}

async function openCashDrawerHttp(payload: OpenCashDrawerInput): Promise<void> {
	const response = await fetch(`${getPosApiBaseUrl()}/drawer/open`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			printerName: payload.printerName,
			width: payload.width,
		}),
	})
	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || `HTTP ${response.status}`)
	}
	return response.json()
}

async function testPrintHttp(payload: {
	printerName: string
	width: 58 | 80
}): Promise<void> {
	const response = await fetch(`${getPosApiBaseUrl()}/test-print`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			printerName: payload.printerName,
			width: payload.width,
		}),
	})
	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || `HTTP ${response.status}`)
	}
	return response.json()
}

// ============================================================================
// EXPORTS
// ============================================================================

export async function printReceipt(payload: PrintPosReceiptInput) {
	if (isWailsEnv()) {
		await callGo('PrintPosReceipt', {
			printerName: payload.printerName,
			width: payload.width,
			companyId: payload.companyId,
			receipt: payload.receipt,
		})
	} else {
		await printReceiptHttp(payload)
	}
}

export async function openCashDrawer(payload: OpenCashDrawerInput) {
	if (isWailsEnv()) {
		await callGo('OpenCashDrawer', {
			printerName: payload.printerName,
			width: payload.width,
		})
	} else {
		await openCashDrawerHttp(payload)
	}
}

export async function testPrint(payload: {
	printerName: string
	width: 58 | 80
}): Promise<void> {
	if (isWailsEnv()) {
		const testReceipt: PrintReceiptPayload = {
			companyName: 'TEST BOUTIQUE',
			invoiceNumber: 'TEST-001',
			dateLabel: new Date().toLocaleString('fr-FR'),
			items: [
				{
					name: 'Article Test',
					qty: 1,
					unitTtc: 10.0,
					totalTtc: 10.0,
				},
			],
			subtotalTtc: 10.0,
			totalTtc: 10.0,
			taxAmount: 1.67,
			paymentMethod: 'Test',
		}
		await callGo('PrintPosReceipt', {
			printerName: payload.printerName,
			width: payload.width,
			companyId: '',
			receipt: testReceipt,
		})
	} else {
		await testPrintHttp(payload)
	}
}

/**
 * Debug: Affiche l'URL utilisée
 */
export function getPosApiUrl(): string {
	return getPosApiBaseUrl()
}
