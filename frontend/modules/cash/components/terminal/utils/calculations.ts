// frontend/modules/cash/components/terminal/utils/calculations.ts
import type { CartItem, VatBreakdown } from '../types/cart'

export const clamp = (n: number, min: number, max: number) => {
	return Math.max(min, Math.min(max, n))
}

export const getEffectiveUnitTtc = (item: CartItem): number => {
	const base = item.unitPrice
	const mode = item.lineDiscountMode
	const val = item.lineDiscountValue

	if (!mode || val == null) return base

	if (mode === 'percent') {
		const p = clamp(val, 0, 100)
		return +(base * (1 - p / 100)).toFixed(2)
	}

	return +clamp(val, 0, base).toFixed(2)
}

export const getLineTotalTtc = (item: CartItem): number => {
	return +(getEffectiveUnitTtc(item) * item.quantity).toFixed(2)
}

export const getLineAmounts = (item: CartItem) => {
	const ttc = getLineTotalTtc(item)
	const coef = 1 + item.tvaRate / 100
	const ht = ttc / coef
	const vat = ttc - ht
	return { ttc, ht, vat }
}

export const applyCartDiscountProRata = (
	items: CartItem[],
	discountTtc: number,
) => {
	if (discountTtc <= 0) return items.map((it) => getLineAmounts(it))

	const subtotal = items.reduce((sum, it) => sum + getLineTotalTtc(it), 0)
	if (subtotal <= 0) return items.map((it) => getLineAmounts(it))

	return items.map((it) => {
		const lineTtc = getLineTotalTtc(it)
		const ratio = lineTtc / subtotal
		const lineDiscount = discountTtc * ratio

		const finalTtc = lineTtc - lineDiscount
		const coef = 1 + it.tvaRate / 100
		const finalHt = finalTtc / coef
		const finalVat = finalTtc - finalHt

		return { ttc: finalTtc, ht: finalHt, vat: finalVat }
	})
}

export const calculateCartTotals = (
	cart: CartItem[],
	discountMode: 'percent' | 'amount',
	discountValue: number,
) => {
	const subtotal = cart.reduce((sum, item) => sum + getLineTotalTtc(item), 0)

	let discount = 0
	if (discountMode === 'percent') {
		discount = (subtotal * discountValue) / 100
	} else {
		discount = Math.min(discountValue, subtotal)
	}

	const finalLines = applyCartDiscountProRata(cart, discount)

	const total_ttc = finalLines.reduce((sum, line) => sum + line.ttc, 0)
	const total_ht = finalLines.reduce((sum, line) => sum + line.ht, 0)
	const total_vat = finalLines.reduce((sum, line) => sum + line.vat, 0)

	const breakdownMap = new Map<number, VatBreakdown>()

	for (const [index, item] of cart.entries()) {
		const rate = item.tvaRate
		const amounts = finalLines[index]

		let entry = breakdownMap.get(rate)

		if (!entry) {
			entry = {
				rate,
				base_ht: 0,
				vat: 0,
				total_ttc: 0,
			}
			breakdownMap.set(rate, entry)
		}

		entry.base_ht += amounts.ht
		entry.vat += amounts.vat
		entry.total_ttc += amounts.ttc
	}

	const breakdown = Array.from(breakdownMap.values())
		.map((entry) => ({
			rate: entry.rate,
			base_ht: +entry.base_ht.toFixed(2),
			vat: +entry.vat.toFixed(2),
			total_ttc: +entry.total_ttc.toFixed(2),
		}))
		.sort((a, b) => a.rate - b.rate)

	return {
		subtotalTtc: +subtotal.toFixed(2),
		discountAmount: +discount.toFixed(2),
		totalTtc: +total_ttc.toFixed(2),
		totalHt: +total_ht.toFixed(2),
		totalVat: +total_vat.toFixed(2),
		vatBreakdown: breakdown,
	}
}
