// frontend/modules/connect/pages/invoices/invoice-detail.presenters.ts
//
// Présentation pure : ces fonctions transforment un document en chiffres et en
// étiquettes prêts à rendre. Aucune règle métier nouvelle — elles sont sorties
// telles quelles de InvoiceDetailPage, pour être gelées par un test AVANT
// d'être déplacées.
//
// C'est le seul endroit de l'écran qui manipule des chiffres fiscaux. Le geler
// est la précaution qui compte : la ventilation TVA d'un document part chez le
// comptable.

import type { InvoiceItem, InvoiceResponse } from '@/lib/types/invoice.types'
import { round2 } from '../../utils/formatters'

export type VatBreakdown = {
	rate: number
	base_ht: number
	vat: number
	total_ttc: number
}

/**
 * L'étiquette de remise d'une ligne, et s'il y en a une.
 *
 * Trois formes, dans cet ordre : un pourcentage ; un écart au prix unitaire
 * reconstruit depuis `unit_price_ttc_before_discount` quand le champ est là ;
 * la valeur brute sinon — ce dernier cas sert les documents anciens, qui ne
 * portaient pas le prix d'avant remise.
 */
export function getLineDiscountLabel(item: InvoiceItem): {
	label: string
	hasDiscount: boolean
} {
	const mode = item?.line_discount_mode
	const value = item?.line_discount_value
	if (!mode || value == null) return { label: '-', hasDiscount: false }

	if (mode === 'percent') {
		const p = Math.max(0, Math.min(100, Number(value) || 0))
		if (p <= 0) return { label: '-', hasDiscount: false }
		return { label: `-${p}%`, hasDiscount: true }
	}

	const beforeUnitTtc = Number(item?.unit_price_ttc_before_discount)
	const unitHt = Number(item?.unit_price_ht ?? 0)
	const tvaRate = Number(item?.tva_rate ?? 20)
	const effectiveUnitTtc = round2(unitHt * (1 + tvaRate / 100))

	if (Number.isFinite(beforeUnitTtc) && beforeUnitTtc > 0) {
		const diff = round2(Math.max(0, beforeUnitTtc - effectiveUnitTtc))
		if (diff <= 0) return { label: '-', hasDiscount: false }
		return { label: `-${diff.toFixed(2)} €/u`, hasDiscount: true }
	}

	const v = round2(Math.max(0, Number(value) || 0))
	if (v <= 0) return { label: '-', hasDiscount: false }
	return { label: `-${v.toFixed(2)} €`, hasDiscount: true }
}

export function getSoldByLabel(invoice: InvoiceResponse): string {
	const soldBy = invoice.expand?.sold_by
	return (
		soldBy?.name ||
		soldBy?.username ||
		soldBy?.email ||
		(invoice.sold_by ? String(invoice.sold_by) : '-')
	)
}

/**
 * La ventilation TVA, reconstruite ligne à ligne.
 *
 * ATTENTION — cas connu, non corrigé ici délibérément : sur une facture de
 * solde, les lignes déductives sont posées à `tva_rate: 0`
 * (backend/deposit.go), et l'écart s'y range donc sous « TVA 0 % ». Les totaux
 * du document restent justes ; c'est la ventilation par ligne qui est
 * trompeuse. Lu dans le code, jamais observé sur un document réel.
 * Voir l'audit §10 Q2.
 */
export function computeVatBreakdown(
	items: readonly InvoiceItem[],
): VatBreakdown[] {
	const map = new Map<number, VatBreakdown>()
	for (const it of items) {
		const rate = Number(it?.tva_rate ?? 20)
		const ht = Number(it?.total_ht ?? 0)
		const ttc = Number(it?.total_ttc ?? 0)
		const vat = ttc - ht
		let entry = map.get(rate)
		if (!entry) {
			entry = { rate, base_ht: 0, vat: 0, total_ttc: 0 }
			map.set(rate, entry)
		}
		entry.base_ht = round2(entry.base_ht + ht)
		entry.vat = round2(entry.vat + vat)
		entry.total_ttc = round2(entry.total_ttc + ttc)
	}
	return Array.from(map.values()).sort((a, b) => a.rate - b.rate)
}

export interface DiscountSummary {
	hasAnyDiscount: boolean
	totalTtc: number
	grandSubtotal: number
	lineDiscountsTtc: number
	cartDiscountTtc: number
	cartDiscountLabel: string
}

/** Le sous-total d'avant remises, remonté depuis le total et les remises. */
export function computeDiscounts(invoice: InvoiceResponse): DiscountSummary {
	const totalTtc = Number(invoice.total_ttc ?? 0)
	const lineDiscountsTtc = Number(invoice.line_discounts_total_ttc ?? 0)
	const cartDiscountTtc = Number(invoice.cart_discount_ttc ?? 0)
	const subtotalAfterLine = round2(totalTtc + cartDiscountTtc)
	const grandSubtotal = round2(subtotalAfterLine + lineDiscountsTtc)
	const hasAnyDiscount = lineDiscountsTtc > 0 || cartDiscountTtc > 0

	let cartDiscountLabel = ''
	const mode = invoice.cart_discount_mode
	const value = invoice.cart_discount_value
	if (cartDiscountTtc > 0 && mode && value != null) {
		if (mode === 'percent') cartDiscountLabel = `(${Number(value) || 0}%)`
		else cartDiscountLabel = `(${round2(Number(value) || 0).toFixed(2)} €)`
	}

	return {
		hasAnyDiscount,
		totalTtc: round2(totalTtc),
		grandSubtotal,
		lineDiscountsTtc: round2(lineDiscountsTtc),
		cartDiscountTtc: round2(cartDiscountTtc),
		cartDiscountLabel,
	}
}
