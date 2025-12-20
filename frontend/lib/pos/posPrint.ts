// frontend/lib/pos/posPrint.ts
// ✅ Version robuste: compatible tant que les bindings Wails ne sont pas régénérés.
// - Essaie d’abord l’import typed (quand App.d.ts est à jour)
// - Fallback sur window.go.main.App (quand TS ne voit pas encore OpenCashDrawer/PrintPosReceipt)

import { isWailsEnv } from '@/lib/wails'
import { toast } from 'sonner'

export type PrintReceiptPayload = {
	companyName?: string
	invoiceNumber: string
	dateLabel: string
	sellerName?: string // ✅ AJOUTER
	items: Array<{
		name: string
		qty: number
		unitTtc: number
		totalTtc: number
		// ✅ AJOUTER pour remises
		hasDiscount?: boolean
		baseUnitTtc?: number
		discountText?: string
	}>
	// ✅ AJOUTER totaux détaillés
	grandSubtotal?: number // Sous-total avant TOUTES remises
	lineDiscountsTotal?: number // Total remises lignes
	subtotalTtc: number // Après remises lignes
	discountAmount?: number // Remise globale
	discountPercent?: number // Pourcentage remise globale
	totalTtc: number
	taxAmount: number
	totalSavings?: number // ✅ Économie totale
	paymentMethod: string
	received?: number
	change?: number
	width: 58 | 80
	printerName: string
}
type PrintPosReceiptInput = {
	printerName: string
	width: 58 | 80
	companyId?: string
	receipt: any
}

type OpenCashDrawerInput = {
	printerName: string
	width: 58 | 80
}

function getGoApp(): any {
	return (window as any)?.go?.main?.App
}

async function callGo(method: string, payload: any) {
	// 1) Typed import (si App.d.ts inclut bien la méthode)
	try {
		const mod: any = await import('@/wailsjs/go/main/App')
		const fn = mod?.[method]
		if (typeof fn === 'function') return await fn(payload)
	} catch {
		// ignore -> fallback window.go
	}

	// 2) Fallback runtime
	const goApp = getGoApp()
	const fn = goApp?.[method]
	if (typeof fn !== 'function') {
		throw new Error(
			`Binding Wails manquant: ${method}. Relance "wails dev" ou "wails generate module" pour régénérer wailsjs.`,
		)
	}
	return await fn(payload)
}

export async function printReceipt(payload: PrintPosReceiptInput) {
	if (!isWailsEnv()) {
		toast.error("Impression disponible uniquement dans l'app (Wails).")
		return
	}

	await callGo('PrintPosReceipt', {
		printerName: payload.printerName,
		width: payload.width,
		companyId: payload.companyId,
		receipt: payload.receipt,
	})
}

export async function openCashDrawer(payload: OpenCashDrawerInput) {
	if (!isWailsEnv()) return

	await callGo('OpenCashDrawer', {
		printerName: payload.printerName,
		width: payload.width,
	})
}
