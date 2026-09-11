// frontend/lib/pricing/promo-price.ts
//
// LE PRIX PROMO EN VIGUEUR — une règle, écrite une fois.
//
// Cinq écrans ajoutent un produit à un document : la caisse, la création et
// l'édition de facture, la création et l'édition de devis. Chacun avait sa
// propre copie du calcul de ligne ; la règle « la promo s'applique-t-elle ? »
// ne doit pas en avoir cinq.
//
// ── CE QUE LE PRIX PROMO DEVIENT ──────────────────────────────────────────
// Jamais le prix de la ligne. Il devient une REMISE DE LIGNE sur le prix
// d'origine, que le ticket et la facture affichent déjà, et que le Z additionne
// dans `total_discounts` sans rien recalculer
// (`backend/reports/cash_reports.go`, `aggregateInvoiceIntoTotals`).
// Voir `backend/migrations/add_promo_price_to_products.go`.
//
// ── LA PÉRIODE (10 septembre 2026) ────────────────────────────────────────
// `promo_start` et `promo_end` sont deux dates calendaires « AAAA-MM-JJ »,
// bornes incluses, vides = sans borne. Le JOUR qui les juge est celui du
// SERVEUR, à Paris (`useJourServeur`, route `/api/time/today`) : cette fonction
// ne lit JAMAIS l'horloge du navigateur, et c'est pourquoi le jour est un
// paramètre obligatoire — un appelant qui l'oublie ne compile pas.
//
// La même règle existe en Go (`backend/promo/jour.go`, expiration des fiches)
// et en PHP (`server/api/catalog.php`, le site). Elle est gardée volontairement
// triviale, et ses cas de test sont les mêmes des trois côtés.

export interface PrixProduit {
	price_ttc?: number | null
	promo_price_ttc?: number | null
	sale_state?: string | null
	promo_start?: string | null
	promo_end?: string | null
}

/** Le jour du serveur, « AAAA-MM-JJ », ou `null` tant qu'il n'est pas connu. */
export type JourServeur = string | null

const arrondi = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Où en est la période d'une promo, ce jour-là.
 *
 * `jour-inconnu` n'est rendu QUE pour une fiche qui porte au moins une date :
 * une promo sans période ne dépend d'aucune horloge, elle n'a pas à attendre
 * la réponse du serveur.
 */
export type EtatPeriode =
	| 'sans-periode'
	| 'programmee'
	| 'en-cours'
	| 'expiree'
	| 'jour-inconnu'

export function periodePromo(
	produit: Pick<PrixProduit, 'promo_start' | 'promo_end'>,
	jour: JourServeur,
): EtatPeriode {
	const debut = produit.promo_start ?? ''
	const fin = produit.promo_end ?? ''
	if (debut === '' && fin === '') return 'sans-periode'
	if (!jour) return 'jour-inconnu'
	if (debut !== '' && jour < debut) return 'programmee'
	if (fin !== '' && jour > fin) return 'expiree'
	return 'en-cours'
}

/**
 * Le prix promo TTC unitaire en vigueur, ou `null`.
 *
 * Quatre conditions, toutes nécessaires :
 *  • le produit est soldé ou en promotion — le tag seul décide que la campagne
 *    est en cours, un prix promo oublié sur une fiche ne s'applique pas ;
 *  • un prix promo est saisi (> 0) ;
 *  • il est strictement inférieur au prix d'origine — une « promo » plus chère
 *    que le prix serait une majoration déguisée en remise ;
 *  • le jour du serveur est dans la période, quand la fiche en porte une. Jour
 *    inconnu et période posée : pas de remise — mieux vaut une remise à poser à
 *    la main qu'une promo finie appliquée d'office.
 */
export function prixPromoActif(
	produit: PrixProduit,
	jour: JourServeur,
): number | null {
	if (produit.sale_state !== 'sale' && produit.sale_state !== 'promo') {
		return null
	}
	const prix = Number(produit.price_ttc ?? 0)
	const promo = Number(produit.promo_price_ttc ?? 0)
	if (!(prix > 0) || !(promo > 0) || promo >= prix) return null
	const periode = periodePromo(produit, jour)
	if (periode !== 'sans-periode' && periode !== 'en-cours') return null
	return arrondi(promo)
}

/**
 * La même remise, exprimée en pourcentage NON ARRONDI — pour les factures et
 * les devis, dont la remise « montant » est un total de ligne qui ne suivrait
 * pas un changement de quantité.
 *
 * Non arrondi exprès : `arrondi(base × % / 100)` redonne alors exactement
 * `(prix − promo) × quantité`, quelle que soit la quantité. Un pourcentage
 * arrondi à deux décimales dériverait d'un centime dès trois unités.
 */
export function remisePromoPourcent(
	produit: PrixProduit,
	jour: JourServeur,
): number | null {
	const promo = prixPromoActif(produit, jour)
	if (promo === null) return null
	return (1 - promo / Number(produit.price_ttc)) * 100
}

/** La remise d'une ligne de CAISSE, prête à poser à l'ajout au panier — ou
 *  rien. Le panier a un mode « prix unitaire » (`unit`) que `cartItemToPosItem`
 *  convertit en remise de ligne à chaque quantité : le prix promo s'y pose tel
 *  quel. */
export function remiseCaisse(
	produit: PrixProduit,
	jour: JourServeur,
): {
	lineDiscountMode?: 'unit'
	lineDiscountValue?: number
	lineDiscountRaw?: string
} {
	const promo = prixPromoActif(produit, jour)
	if (promo === null) return {}
	return {
		lineDiscountMode: 'unit',
		lineDiscountValue: promo,
		lineDiscountRaw: String(promo),
	}
}

// ── LE STOCK B ────────────────────────────────────────────────────────────
// Une unité B se vend à `stock_b_price_ttc`, posé comme le prix promo : en
// remise de ligne sur le prix d'origine. Sans prix B, AUCUNE remise
// automatique — ni la promo : une unité B n'est pas une unité neuve soldée, et
// c'est au vendeur de fixer sa remise. Le prix B n'a pas de période.

export interface PrixProduitB extends PrixProduit {
	stock_b_price_ttc?: number | null
}

export type CompteurDeStock = 'stock' | 'stock_b'

/** Le prix TTC unitaire d'une unité Stock B, ou `null` s'il n'est pas saisi
 *  ou n'est pas une baisse. */
export function prixStockB(produit: PrixProduitB): number | null {
	const prix = Number(produit.price_ttc ?? 0)
	const prixB = Number(produit.stock_b_price_ttc ?? 0)
	if (!(prix > 0) || !(prixB > 0) || prixB >= prix) return null
	return arrondi(prixB)
}

/** Le compteur d'une ligne ajoutée au panier : le neuf s'il en reste, sinon le
 *  B s'il y en a. Sans stock ni d'un côté ni de l'autre, le neuf — c'était la
 *  règle avant le Stock B, et un stock négatif reste une information. */
export function compteurParDefaut(produit: {
	stock?: number | null
	stock_b?: number | null
}): CompteurDeStock {
	return Number(produit.stock ?? 0) <= 0 && Number(produit.stock_b ?? 0) > 0
		? 'stock_b'
		: 'stock'
}

/** La remise d'une ligne de caisse selon son compteur, EXPLICITE : les champs
 *  absents valent « pas de remise », pour qu'une bascule Neuf ↔ B efface la
 *  remise précédente au lieu d'en hériter. */
export function remiseCaisseSelonCompteur(
	produit: PrixProduitB,
	compteur: CompteurDeStock,
	jour: JourServeur,
): {
	lineDiscountMode: 'unit' | undefined
	lineDiscountValue: number | undefined
	lineDiscountRaw: string
} {
	const prix =
		compteur === 'stock_b' ? prixStockB(produit) : prixPromoActif(produit, jour)
	if (prix === null) {
		return {
			lineDiscountMode: undefined,
			lineDiscountValue: undefined,
			lineDiscountRaw: '',
		}
	}
	return {
		lineDiscountMode: 'unit',
		lineDiscountValue: prix,
		lineDiscountRaw: String(prix),
	}
}

/** La remise d'une ligne de facture ou de devis, prête à poser à l'ajout du
 *  produit — ou la ligne sans remise, comme avant. */
export function remiseInitialeDeLigne(
	produit: PrixProduit,
	jour: JourServeur,
): {
	lineDiscountMode: 'percent'
	lineDiscountValue: number
	lineDiscountRaw?: string
} {
	const pourcent = remisePromoPourcent(produit, jour)
	if (pourcent === null) {
		return { lineDiscountMode: 'percent', lineDiscountValue: 0 }
	}
	return {
		lineDiscountMode: 'percent',
		lineDiscountValue: pourcent,
		// L'affichage arrondit ; la valeur, elle, reste exacte.
		lineDiscountRaw: pourcent.toFixed(2),
	}
}
