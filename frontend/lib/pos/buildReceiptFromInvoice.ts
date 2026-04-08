// frontend/lib/pos/buildReceiptFromInvoice.ts
//
// Transforme un InvoiceResponse (ticket POS persisté en base) en
// PrintReceiptPayload prêt à passer à printReceipt() ou openReceiptPreviewWindow().
//
// ⚠️  Cette fonction est PURE : aucun hook, aucun side-effect.
//     Elle peut être appelée depuis n'importe quel contexte (hook, callback…).

import type { PrintReceiptPayload } from '@/lib/pos/posPrint'
import type { InvoiceResponse } from '@/lib/types/invoice.types'

/**
 * Extension du type PrintReceiptPayload pour inclure companyLogoBase64.
 * Ce champ est accepté par le serveur mais absent du type TS de posPrint.ts.
 * Il est utilisé de la même façon que dans buildReceiptPayload de CashTerminalPage.
 */
export type PrintReceiptPayloadWithLogo = PrintReceiptPayload & {
	companyLogoBase64?: string
}

/**
 * Construit le payload d'impression à partir d'un ticket déjà enregistré en base.
 *
 * Mapping :
 *   invoice.items              → receipt.items  (name / qty / unit_price_ttc / tva_rate / remises)
 *   invoice.total_ttc          → receipt.totalTtc
 *   invoice.total_tva          → receipt.taxAmount
 *   invoice.vat_breakdown      → receipt.vatBreakdown
 *   invoice.cart_discount_ttc  → receipt.discountAmount
 *   invoice.cart_discount_mode + invoice.cart_discount_value → receipt.discountPercent
 *   invoice.line_discounts_total_ttc → receipt.lineDiscountsTotal
 *   invoice.payment_method     → receipt.paymentMethod  (libellé humain via map)
 *   invoice.number             → receipt.invoiceNumber
 *   invoice.date / created     → receipt.dateLabel
 *   invoice.sold_by (expand)   → receipt.sellerName
 *
 * @param invoice     L'InvoiceResponse complet (items inclus, expand optionnel)
 * @param companyLogoBase64  Logo encodé en base64 (data:image/…;base64,…) — optionnel
 */
export function buildReceiptFromInvoice(
	invoice: InvoiceResponse,
	companyLogoBase64?: string,
): PrintReceiptPayloadWithLogo {
	// ── Libellé du moyen de paiement ──────────────────────────────────────────
	const paymentMethodLabel = resolvePaymentLabel(
		invoice.payment_method,
		(invoice as any).payment_method_label,
	)

	// ── Date d'impression : heure de création du ticket ───────────────────────
	const dateLabel = invoice.created
		? new Date(invoice.created).toLocaleString('fr-FR')
		: invoice.date
			? new Date(invoice.date).toLocaleString('fr-FR')
			: new Date().toLocaleString('fr-FR')

	// ── Vendeur (champ sold_by — peut être un ID ou un expand) ────────────────
	const sellerName = resolveSellerName(invoice)

	// ── Lignes d'articles ──────────────────────────────────────────────────────
	const items: PrintReceiptPayload['items'] = (invoice.items ?? []).map(
		(item) => {
			const hasDiscount =
				item.line_discount_mode != null &&
				item.line_discount_value != null &&
				item.line_discount_value > 0

			// Prix unitaire TTC avant remise éventuelle
			const baseUnitTtc =
				(item as any).unit_price_ttc_before_discount ??
				(item as any).unit_price_ttc ??
				// fallback : recalcul depuis HT + tva
				item.unit_price_ht * (1 + (item.tva_rate ?? 0) / 100)

			// Prix unitaire effectif (après remise ligne)
			let effectiveUnitTtc = baseUnitTtc
			let discountText: string | null = null

			if (hasDiscount) {
				if (item.line_discount_mode === 'percent') {
					effectiveUnitTtc =
						baseUnitTtc * (1 - (item.line_discount_value ?? 0) / 100)
					// On arrondit à 2 décimales max pour éviter les -9.999999999999993%
					const cleanPercent = Number.parseFloat(
						Number(item.line_discount_value ?? 0).toFixed(2),
					)
					discountText = `-${cleanPercent}%`
				} else {
					// mode 'amount' : la valeur est la remise totale sur la ligne
					const discountPerUnit =
						(item.line_discount_value ?? 0) / (item.quantity || 1)
					effectiveUnitTtc = baseUnitTtc - discountPerUnit
					const discount = baseUnitTtc - effectiveUnitTtc
					discountText = `-${discount.toFixed(2)}€`
				}
			}

			return {
				name: item.name,
				qty: item.quantity,
				unitTtc: effectiveUnitTtc,
				totalTtc: Math.abs(item.total_ttc ?? effectiveUnitTtc * item.quantity),
				tvaRate: item.tva_rate,
				hasDiscount: hasDiscount === true,
				baseUnitTtc: hasDiscount ? baseUnitTtc : undefined,
				discountText: hasDiscount ? discountText : null,
			}
		},
	)

	// ── Remise globale panier ──────────────────────────────────────────────────
	const discountAmount =
		invoice.cart_discount_ttc && invoice.cart_discount_ttc > 0
			? invoice.cart_discount_ttc
			: undefined

	const discountPercent =
		invoice.cart_discount_mode === 'percent' &&
		invoice.cart_discount_value &&
		invoice.cart_discount_value > 0
			? Number.parseFloat(Number(invoice.cart_discount_value).toFixed(2))
			: undefined

	// ── Remises sur lignes (total) ─────────────────────────────────────────────
	const lineDiscountsTotal =
		invoice.line_discounts_total_ttc && invoice.line_discounts_total_ttc > 0
			? invoice.line_discounts_total_ttc
			: undefined

	// ── Sous-total avant remise panier ─────────────────────────────────────────
	// subtotalTtc = totalTtc + remise panier (on reconstitue)
	const subtotalTtc = invoice.total_ttc + (discountAmount ?? 0)

	// ── Grand sous-total (avant toutes remises) ────────────────────────────────
	const grandSubtotal = subtotalTtc + (lineDiscountsTotal ?? 0)

	// ── Économies totales ──────────────────────────────────────────────────────
	const totalSavings =
		(lineDiscountsTotal ?? 0) + (discountAmount ?? 0) > 0
			? (lineDiscountsTotal ?? 0) + (discountAmount ?? 0)
			: undefined

	// ── Ventilation TVA ────────────────────────────────────────────────────────
	const vatBreakdown = Array.isArray(invoice.vat_breakdown)
		? invoice.vat_breakdown.map((vb: any) => ({
				rate: vb.rate,
				baseHt: vb.base_ht ?? vb.baseHt,
				vat: vb.vat ?? vb.vat_amount,
				totalTtc: vb.total_ttc ?? vb.totalTtc,
			}))
		: undefined

	return {
		companyLogoBase64,
		invoiceNumber: invoice.number,
		dateLabel,
		sellerName,
		items,
		grandSubtotal: lineDiscountsTotal ? grandSubtotal : undefined,
		lineDiscountsTotal,
		subtotalTtc,
		discountAmount,
		discountPercent,
		totalTtc: Math.abs(invoice.total_ttc),
		taxAmount: Math.abs(invoice.total_tva),
		totalSavings,
		vatBreakdown,
		paymentMethod: paymentMethodLabel,
		// received / change non disponibles a posteriori — champs absents du modèle
	}
}

// ── Helpers internes ───────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
	cb: 'CB',
	especes: 'Espèces',
	cheque: 'Chèque',
	virement: 'Virement',
	autre: 'Autre',
	multi: 'Multi-paiement',
}

function resolvePaymentLabel(
	method?: string | null,
	label?: string | null,
): string {
	if (label) return label
	if (!method) return 'Autre'
	return PAYMENT_LABELS[method] ?? method
}

function resolveSellerName(invoice: InvoiceResponse): string {
	// 1. expand sold_by (objet user)
	const soldByExpand = (invoice as any).expand?.sold_by
	if (soldByExpand) {
		return (
			soldByExpand.name || soldByExpand.username || soldByExpand.email || ''
		)
	}
	// 2. champ texte brut sold_by (fallback)
	if (
		typeof invoice.sold_by === 'string' &&
		invoice.sold_by.length > 0 &&
		// un ID PocketBase fait 15 chars — on ne veut pas afficher l'ID brut
		invoice.sold_by.length < 12
	) {
		return invoice.sold_by
	}
	return ''
}
