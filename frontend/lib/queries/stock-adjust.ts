// frontend/lib/queries/stock-adjust.ts
//
// LE CHEMIN UNIQUE DES MOUVEMENTS DE STOCK — PocketBase, et lui seul.
//
// Quatre motifs bougent le stock dans PocketApp : l'inventaire physique, le
// reclassement d'un retour, la vente et le retour client. Ils écrivaient chacun
// de leur côté, dans AppPos, par trois routes différentes
// (`updateAppPosProductStock`, `incrementAppPosProductsStock`,
// `decrementAppPosProductsStock`). Ce fichier les rassemble.
//
// ── CE QUI EST BRANCHÉ ────────────────────────────────────────────────────
// Les QUATRE motifs, depuis le 19 août 2026 : l'inventaire et le reclassement
// (front D), puis la VENTE — caisse, facture, conversion de devis (front E).
// `lib/apppos/stock-utils.ts`, qui portait la vente, est supprimé.
//
// ── LE PONT ENTRE LES DEUX BASES ──────────────────────────────────────────
// Les appelants tiennent des identifiants NeDB — une entrée d'inventaire, une
// ligne de facture, un panier. PocketBase les porte en `legacy_id`
// (2999 / 2999 produits, mesuré le 18 août 2026). Un identifiant est donc
// résolu ici, jamais supposé : voir `productFilter`.
//
// ── CE QUE CETTE COUCHE NE FAIT PAS ───────────────────────────────────────
// Elle n'écrit PAS dans AppPos, et n'a pas à le faire : « on n'écrit jamais
// dans AppPos » (`CLAUDE.md`), et « pas de double écriture » (DECISIONS,
// 2026-08-13). **Le stock d'AppPos ne bouge donc plus depuis PocketApp** : il
// reste à la valeur qu'il avait, et seul AppPos lui-même le fait encore vivre.
// C'est la contrepartie assumée de la bascule ; elle prend fin quand AppPos
// sort, à la prochaine release.

import type PocketBase from 'pocketbase'

/** Où va la marchandise rendue. `restock` la remet au stock neuf, `stock_b` au
 *  compteur Stock B (depuis le 10 septembre 2026) ; `sav` la sort du stock et ne
 *  laisse qu'une trace.
 *  Déclaré ici et non dans `lib/apppos` : c'est une notion de métier, pas une
 *  notion de l'API qu'on quitte. */
export type ReturnDestination = 'restock' | 'sav' | 'stock_b'

/** Pourquoi le stock bouge À LA MAIN. Exigé par la fiche produit depuis le
 *  10 septembre 2026 : avant, tout y était journalisé comme un inventaire. */
export type ManualStockReason =
	| 'restock'
	| 'correction'
	| 'loss'
	| 'to_stock_b'
	| 'other'

/** Pourquoi le stock bouge. Explicite au point d'appel, jamais déduit. */
export type StockReason = 'inventory' | 'return' | 'sale' | ManualStockReason

/** Les motifs proposés à l'écran, dans l'ordre d'affichage.
 *  ⚠️ `to_stock_b` n'y est PAS : le passage en Stock B est un TRANSFERT
 *  (`transferToStockB`), un geste à part — pas une valeur qu'on saisit. */
export const MANUAL_STOCK_REASONS: ReadonlyArray<{
	value: ManualStockReason
	label: string
}> = [
	{ value: 'restock', label: 'Réassort / réception fournisseur' },
	{ value: 'correction', label: 'Correction d’inventaire' },
	{ value: 'loss', label: 'Casse ou perte' },
	{ value: 'other', label: 'Autre (préciser)' },
]

export interface StockMovement {
	/** Identifiant PocketBase OU clé stable NeDB (`legacy_id`). Résolu ici. */
	productId: string
	/** Mouvement relatif : +2 pour un retour, -1 pour une vente. */
	delta?: number
	/** Valeur absolue : ce que l'inventaire a compté. Prime sur `delta`. */
	absolute?: number
	/** Le compteur visé par `delta` et `absolute`. Le neuf par défaut. */
	counter?: 'stock' | 'stock_b'
	/** Unités à passer du neuf au Stock B, en UN mouvement. Prime sur le reste ;
	 *  refusé par le serveur si le neuf n'en a pas assez. */
	transferToB?: number
	productName?: string
	productSku?: string
	/** Ce qui n'appartient qu'à cette ligne — la destination d'un retour, la
	 *  quantité vendue. Fusionné par-dessus la métadonnée du lot. */
	metadata?: Record<string, unknown>
}

export interface StockAdjustResult {
	/** L'identifiant tel que l'appelant l'a donné. */
	productId: string
	/** L'identifiant PocketBase, une fois résolu. `null` si introuvable. */
	recordId: string | null
	stockBefore: number | null
	stockAfter: number | null
	/** Le compteur Stock B, tel que le serveur l'a lu et écrit. */
	stockBBefore?: number | null
	stockBAfter?: number | null
	applied: boolean
	error?: string
}

export interface StockAdjustOptions {
	reason: StockReason
	/** Ticket, facture ou session d'inventaire à l'origine du mouvement. */
	sourceId?: string
	operator?: string
	/** Ce que le motif a de particulier : la destination d'un retour, l'entrée
	 *  d'inventaire, le ticket. Le journal le porte tel quel. */
	metadata?: Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// RÉSOLUTION ET CALCUL — désormais côté serveur
// ---------------------------------------------------------------------------
// `productFilter`, `looksLikePocketBaseId` et `nextStock` vivaient ici. Ils ont
// suivi le mouvement dans `backend/routes/stock_routes.go` (19 août 2026) :
// c'est là que la lecture et l'écriture doivent tenir ensemble, donc là que la
// résolution de l'identifiant doit se faire. Le serveur interroge les deux
// champs — `id` et `legacy_id` — avec des paramètres liés (`dbx.Params`), ce
// qui règle en passant l'échappement des guillemets que ce fichier bricolait.
//
// Ne pas les réintroduire ici : recalculer le stock côté client, c'est le
// calculer sur une valeur qu'un autre poste a déjà pu changer.

/** Le type d'événement du journal, par motif. */
export function eventTypeFor(reason: StockReason) {
	switch (reason) {
		case 'inventory':
			return 'stock_adjusted_inventory' as const
		case 'return':
			return 'stock_return' as const
		case 'sale':
			return 'stock_sale' as const
		case 'restock':
			return 'stock_restock' as const
		case 'correction':
			return 'stock_correction' as const
		case 'loss':
			return 'stock_loss' as const
		case 'to_stock_b':
			return 'stock_to_stock_b' as const
		case 'other':
			return 'stock_other' as const
	}
}

/** La source du journal, par motif. */
export function eventSourceFor(reason: StockReason) {
	switch (reason) {
		case 'inventory':
			return 'inventory_session' as const
		case 'return':
			return 'return' as const
		case 'sale':
			return 'sale' as const
		default:
			// Tous les motifs manuels. `manual` est déjà compté par le garde-fou
			// de purge (`backend/catalog/load/guard.go`).
			return 'manual' as const
	}
}

// ---------------------------------------------------------------------------
// ÉCRITURE
// ---------------------------------------------------------------------------

/** La forme rendue par `POST /api/stock/adjust`. */
interface ReponseServeur {
	results: Array<{
		product_id: string
		record_id: string
		product_name: string
		product_sku: string
		stock_before: number | null
		stock_after: number | null
		stock_b_before?: number | null
		stock_b_after?: number | null
		applied: boolean
		error?: string
	}>
}

/**
 * Applique les mouvements et les journalise, côté serveur, ensemble.
 *
 * ── LE MOUVEMENT PASSE PAR LE SERVEUR ─────────────────────────────────────
 * Ce fichier lisait le stock puis le réécrivait, en deux appels REST. Deux
 * postes vendant le même produit en même temps lisaient tous deux 10 et
 * écrivaient tous deux 9 : deux ventes, une seule unité retirée. Depuis le
 * 19 août 2026, le nombre est calculé et écrit dans une transaction unique,
 * par `backend/routes/stock_routes.go` — voir ce fichier pour la raison pour
 * laquelle la transaction suffit.
 *
 * ── LE JOURNAL EST DANS LA MÊME TRANSACTION ───────────────────────────────
 * Jusqu'au 10 septembre 2026, `product_events` s'écrivait ici, APRÈS le
 * mouvement, en best-effort : une trace ratée laissait un stock modifié sans
 * historique. Le motif part désormais dans le corps (`journal`), et la route
 * écrit l'événement dans la transaction du stock. Un journal refusé annule le
 * mouvement, rendu en échec sur sa ligne. Ne pas réintroduire d'écriture du
 * journal ici — un test le garde.
 *
 * Chaque produit reste traité séparément : un produit introuvable n'empêche
 * pas les autres de passer, et il est rendu dans le résultat plutôt qu'avalé.
 */
export async function applyStockMovements(
	pb: PocketBase,
	movements: StockMovement[],
	options: StockAdjustOptions,
): Promise<StockAdjustResult[]> {
	if (movements.length === 0) return []

	let reponse: ReponseServeur
	try {
		reponse = await pb.send('/api/stock/adjust', {
			method: 'POST',
			body: {
				movements: movements.map((m) => ({
					product_id: m.productId,
					delta: m.delta,
					absolute: m.absolute,
					counter: m.counter ?? '',
					transfer_to_b: m.transferToB,
					product_name: m.productName ?? '',
					product_sku: m.productSku ?? '',
					metadata: m.metadata ?? null,
				})),
				// Le motif du lot. La route l'écrit dans la transaction du stock :
				// un journal refusé annule le mouvement.
				journal: {
					event_type: eventTypeFor(options.reason),
					source: eventSourceFor(options.reason),
					source_id: options.sourceId ?? '',
					operator: options.operator ?? '',
					metadata: options.metadata ?? null,
				},
			},
		})
	} catch (error) {
		// La route est locale, servie par le même PocketBase que le reste : si
		// elle ne répond pas, rien n'a bougé. On rend l'échec ligne par ligne,
		// dans la forme que les appelants attendent déjà.
		const message =
			error instanceof Error ? error.message : 'mouvement de stock refusé'
		return movements.map((m) => ({
			productId: m.productId,
			recordId: null,
			stockBefore: null,
			stockAfter: null,
			applied: false,
			error: message,
		}))
	}

	const resultats: StockAdjustResult[] = []

	// Le serveur rend les résultats dans l'ordre reçu : on rapproche par
	// position, et non par `product_id` — deux lignes du même produit sont
	// légitimes dans un même ticket.
	for (const [index, movement] of movements.entries()) {
		const ligne = reponse.results?.[index]

		if (!ligne) {
			resultats.push({
				productId: movement.productId,
				recordId: null,
				stockBefore: null,
				stockAfter: null,
				applied: false,
				error: 'réponse du serveur incomplète',
			})
			continue
		}

		resultats.push({
			productId: movement.productId,
			recordId: ligne.record_id || null,
			stockBefore: ligne.stock_before,
			stockAfter: ligne.stock_after,
			stockBBefore: ligne.stock_b_before ?? null,
			stockBAfter: ligne.stock_b_after ?? null,
			applied: ligne.applied,
			...(ligne.error ? { error: ligne.error } : {}),
		})
	}

	return resultats
}

/** L'inventaire physique : on pose ce qui a été compté. */
export async function setCountedStock(
	pb: PocketBase,
	productId: string,
	counted: number,
	options: Omit<StockAdjustOptions, 'reason'> = {},
): Promise<StockAdjustResult> {
	const [resultat] = await applyStockMovements(
		pb,
		[{ productId, absolute: counted }],
		{ ...options, reason: 'inventory' },
	)
	return resultat
}

/**
 * Un stock posé À LA MAIN, depuis la fiche produit. Le motif est obligatoire,
 * et « Autre » exige un commentaire : sans lui, le journal ne dirait rien de
 * plus qu'avant. Refusé AVANT tout appel serveur — rien ne bouge.
 */
export async function setStockManually(
	pb: PocketBase,
	productId: string,
	stock: number,
	options: Omit<StockAdjustOptions, 'reason'> & {
		reason: ManualStockReason
		comment?: string
		/** Le compteur posé : le neuf par défaut. */
		counter?: 'stock' | 'stock_b'
	},
): Promise<StockAdjustResult> {
	const { reason, comment, counter, ...reste } = options
	const commentaire = comment?.trim() ?? ''
	if (reason === 'other' && !commentaire) {
		return {
			productId,
			recordId: null,
			stockBefore: null,
			stockAfter: null,
			applied: false,
			error: 'le motif « Autre » demande un commentaire',
		}
	}
	const [resultat] = await applyStockMovements(
		pb,
		[{ productId, absolute: stock, counter }],
		{
			...reste,
			reason,
			metadata: {
				...(reste.metadata ?? {}),
				...(commentaire ? { comment: commentaire } : {}),
			},
		},
	)
	return resultat
}

/**
 * Le passage neuf → Stock B : UN mouvement, une transaction, un événement
 * portant les deux deltas. Retirer au neuf puis ajouter au B en deux gestes
 * ferait deux motifs, et un historique qui raconte une perte suivie d'un
 * réassort. Le serveur refuse si le neuf n'a pas assez d'unités.
 */
export async function transferToStockB(
	pb: PocketBase,
	productId: string,
	quantity: number,
	options: Omit<StockAdjustOptions, 'reason'> & { comment?: string } = {},
): Promise<StockAdjustResult> {
	const { comment, ...reste } = options
	if (!Number.isInteger(quantity) || quantity < 1) {
		return {
			productId,
			recordId: null,
			stockBefore: null,
			stockAfter: null,
			applied: false,
			error: 'quantité à passer en Stock B invalide',
		}
	}
	const commentaire = comment?.trim() ?? ''
	const [resultat] = await applyStockMovements(
		pb,
		[{ productId, transferToB: quantity }],
		{
			...reste,
			reason: 'to_stock_b',
			metadata: {
				...(reste.metadata ?? {}),
				...(commentaire ? { comment: commentaire } : {}),
			},
		},
	)
	return resultat
}

/** Une ligne vendue, telle que la tiennent le panier de caisse et les documents
 *  commerciaux. Les deux formats de quantité coexistaient dans les appelants —
 *  `quantity` en caisse, `quantitySold` dans les factures : la couche accepte
 *  les deux plutôt que d'aller les renommer dans six fichiers. */
export interface SoldLine {
	productId: string
	productName?: string
	productSku?: string
	quantity?: number
	quantitySold?: number
	/** Le compteur vendu : le neuf par défaut, `stock_b` pour une unité B. */
	counter?: 'stock' | 'stock_b'
}

/**
 * La vente : caisse, facture validée, conversion de devis.
 *
 * NON BLOQUANTE, et c'est délibéré — c'était déjà la règle avec AppPos. Une
 * erreur de stock ne doit jamais empêcher un encaissement : le ticket est déjà
 * enregistré quand on arrive ici, et refuser après coup laisserait un client
 * payé sans vente. Les échecs sont rendus à l'appelant, qui décide quoi en dire.
 */
export async function recordSale(
	pb: PocketBase,
	lines: SoldLine[],
	options: Omit<StockAdjustOptions, 'reason'> = {},
): Promise<StockAdjustResult[]> {
	const mouvements: StockMovement[] = lines
		.map((line) => ({
			productId: line.productId,
			quantite: line.quantitySold ?? line.quantity ?? 0,
			productName: line.productName,
			productSku: line.productSku,
			counter: line.counter,
		}))
		// Une ligne libre — sans produit — ou à quantité nulle ne bouge aucun
		// stock. Les documents en portent : elles étaient déjà écartées avant.
		.filter((l) => l.productId && l.quantite > 0)
		.map(({ quantite, ...reste }) => ({
			...reste,
			delta: -quantite,
			metadata: { quantity_sold: quantite },
		}))

	if (mouvements.length === 0) return []

	try {
		return await applyStockMovements(pb, mouvements, {
			...options,
			reason: 'sale',
		})
	} catch (error) {
		// Le filet de sécurité du filet de sécurité : `applyStockMovements` rend
		// déjà ses erreurs ligne par ligne, mais rien de ce qui touche à la vente
		// ne doit pouvoir remonter en exception.
		console.error('[vente] mouvement de stock refusé', error)
		return []
	}
}

/** Les lignes d'un document commercial, ramenées à ce qui bouge du stock.
 *  Structurel à dessein : la couche n'a pas à connaître le type facture. */
export function toSoldLines(
	items: Array<{
		product_id?: string | null
		name?: string | null
		quantity?: number | null
	}>,
): SoldLine[] {
	return items
		.filter(
			(item): item is { product_id: string; name?: string; quantity: number } =>
				typeof item.product_id === 'string' &&
				!!item.product_id &&
				typeof item.quantity === 'number' &&
				item.quantity > 0,
		)
		.map((item) => ({
			productId: item.product_id,
			productName: item.name ?? '',
			quantity: item.quantity,
		}))
}
