// frontend/lib/pricing/plafond-remise.ts
//
// LE PLAFOND DE REMISE DU VENDEUR, côté écran.
//
// Ce fichier ne DÉCIDE rien : la règle qui refuse est en Go
// (`backend/remise/plafond.go`). Il bride la saisie pour que le vendeur ne
// découvre pas le refus au moment d'encaisser. Les deux doivent dire la même
// chose :
//   • le prix de référence est celui de la FICHE, abaissé par la promo en
//     vigueur ou, pour une ligne Stock B, par le prix B ;
//   • le prix net unitaire ne descend pas sous référence × (1 − plafond),
//     quelle que soit la manière de le saisir : %, prix unitaire ou prix TTC
//     retapé ;
//   • un vendeur limité ne fait AUCUNE remise globale.

import {
	type CompteurDeStock,
	type JourServeur,
	type PrixProduitB,
	prixPromoActif,
	prixStockB,
} from './promo-price'

/** `null` = pas de plafond (admin, ou limite désactivée). */
export type PlafondRemise = number | null

export function plafondDe(
	user:
		| {
				role?: string
				discount_limit_enabled?: boolean
				max_discount_percent?: number
		  }
		| null
		| undefined,
): PlafondRemise {
	if (!user || user.role === 'admin' || !user.discount_limit_enabled) {
		return null
	}
	return Math.min(100, Math.max(0, Number(user.max_discount_percent ?? 0)))
}

/** Le prix unitaire TTC de référence d'une ligne. */
export function prixDeReference(
	pricing: PrixProduitB | undefined,
	compteur: CompteurDeStock | undefined,
	prixCatalogue: number,
	jour: JourServeur,
): number {
	const fiche = Number(pricing?.price_ttc ?? 0)
	const base = fiche > 0 ? fiche : prixCatalogue
	if (!pricing || !(fiche > 0)) return base
	const abaisse =
		compteur === 'stock_b' ? prixStockB(pricing) : prixPromoActif(pricing, jour)
	return abaisse !== null && abaisse < base ? abaisse : base
}

/** Le prix net unitaire minimal, arrondi au centime SUPÉRIEUR pour ne jamais
 *  proposer une valeur que le serveur refuserait. */
export function prixPlancher(reference: number, plafond: number): number {
	return Math.ceil(reference * (1 - plafond / 100) * 100 - 1e-6) / 100
}

// ── FACTURES ET DEVIS ─────────────────────────────────────────────────────
// Une ligne de document n'a pas le mode « prix unitaire » de la caisse : sa
// remise est un % ou un MONTANT sur le total de la ligne.

export interface LigneDocumentBridable {
	unit_price_ttc: number
	quantity: number
	lineDiscountMode?: 'percent' | 'amount'
	lineDiscountValue?: number
	lineDiscountRaw?: string
}

/** Ramène une ligne de facture ou de devis au prix net minimal `plancher`
 *  (unitaire). Comme en caisse, seul le pourcentage réécrit la saisie : un
 *  montant ou un prix se tapent chiffre à chiffre. */
export function briderLigneDocument<T extends LigneDocumentBridable>(
	it: T,
	plancher: number | null,
): T {
	if (plancher === null || !(it.quantity > 0)) return it
	let out = it
	if (out.unit_price_ttc < plancher) {
		out = { ...out, unit_price_ttc: plancher }
	}
	const base = out.unit_price_ttc * out.quantity
	const mode = out.lineDiscountMode ?? 'percent'
	const val = out.lineDiscountValue ?? 0
	const remise = mode === 'percent' ? (base * val) / 100 : val
	const remiseMax = Math.max(0, base - plancher * out.quantity)
	if (remise <= remiseMax + 0.001) return out

	if (mode === 'percent') {
		const pct = Math.floor((remiseMax / base) * 1000) / 10
		return { ...out, lineDiscountValue: pct, lineDiscountRaw: String(pct) }
	}
	return {
		...out,
		lineDiscountValue: Math.floor(remiseMax * 100) / 100,
	}
}
