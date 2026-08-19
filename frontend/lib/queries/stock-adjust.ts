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

import { createProductEvent } from '@/lib/product-events/product-events-pocketbase'
import type PocketBase from 'pocketbase'

/** Où va la marchandise rendue. Seul `restock` la remet en vente ; `sav` et
 *  `stock_b` la sortent du stock vendable et ne laissent qu'une trace.
 *  Déclaré ici et non dans `lib/apppos` : c'est une notion de métier, pas une
 *  notion de l'API qu'on quitte. */
export type ReturnDestination = 'restock' | 'sav' | 'stock_b'

/** Pourquoi le stock bouge. Explicite au point d'appel, jamais déduit. */
export type StockReason = 'inventory' | 'return' | 'sale'

export interface StockMovement {
	/** Identifiant PocketBase OU clé stable NeDB (`legacy_id`). Résolu ici. */
	productId: string
	/** Mouvement relatif : +2 pour un retour, -1 pour une vente. */
	delta?: number
	/** Valeur absolue : ce que l'inventaire a compté. Prime sur `delta`. */
	absolute?: number
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
// RÉSOLUTION — la partie qui décide dans quelle base vit l'identifiant
// ---------------------------------------------------------------------------

/** Un identifiant PocketBase fait 15 caractères alphanumériques minuscules ;
 *  ceux de NeDB en font 16 et mêlent les casses. La distinction ne sert qu'à
 *  choisir le champ interrogé — en cas de doute, `legacy_id` est essayé aussi. */
export function looksLikePocketBaseId(id: string): boolean {
	return /^[a-z0-9]{15}$/.test(id)
}

/** Le filtre qui retrouve le produit, quelle que soit l'origine de la clé.
 *  On interroge les DEUX champs : un identifiant de 15 caractères venu de NeDB
 *  resterait introuvable si on ne testait que `id`. */
export function productFilter(id: string): string {
	const echappe = id.replace(/["\\]/g, '')
	return `id = "${echappe}" || legacy_id = "${echappe}"`
}

/** Le stock après mouvement. `absolute` prime : l'inventaire ne corrige pas,
 *  il constate. Aucun plafonnement à zéro — un stock négatif est une
 *  information, l'écraser masquerait la cause. */
export function nextStock(before: number, movement: StockMovement): number {
	if (typeof movement.absolute === 'number') return movement.absolute
	return before + (movement.delta ?? 0)
}

/** Le type d'événement du journal, par motif. */
export function eventTypeFor(reason: StockReason) {
	switch (reason) {
		case 'inventory':
			return 'stock_adjusted_inventory' as const
		case 'return':
			return 'stock_return' as const
		case 'sale':
			return 'stock_sale' as const
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
	}
}

// ---------------------------------------------------------------------------
// ÉCRITURE
// ---------------------------------------------------------------------------

/**
 * Applique les mouvements, un par un, et journalise.
 *
 * ⚠️ LECTURE PUIS ÉCRITURE, sans transaction : PocketBase n'expose pas
 * d'incrément atomique en REST. Deux mouvements simultanés sur le même produit
 * peuvent donc s'écraser.
 *
 * ⚠️ Ce texte disait « tenable ici — un poste de caisse, un opérateur ». **Ce
 * n'est plus vrai depuis le 19 août 2026** : le déploiement est multi-postes,
 * un sur l'application bureau et les autres au navigateur
 * (docs/DECISIONS.md). Le défaut est donc ACTIF, et il ne se corrige pas ici :
 * il faut un hook PocketBase côté serveur. Ne pas le rustiner côté client —
 * une garde dans ce fichier ne verrait pas l'autre poste.
 *
 * Chaque produit est traité séparément : un produit introuvable n'empêche pas
 * les autres de passer, et il est rendu dans le résultat plutôt qu'avalé.
 */
export async function applyStockMovements(
	pb: PocketBase,
	movements: StockMovement[],
	options: StockAdjustOptions,
): Promise<StockAdjustResult[]> {
	const resultats: StockAdjustResult[] = []

	for (const movement of movements) {
		const base: StockAdjustResult = {
			productId: movement.productId,
			recordId: null,
			stockBefore: null,
			stockAfter: null,
			applied: false,
		}

		try {
			const produit = await pb.collection('products').getFirstListItem<{
				id: string
				name: string
				sku?: string
				stock?: number
			}>(productFilter(movement.productId), { fields: 'id,name,sku,stock' })

			const avant = produit.stock ?? 0
			const apres = nextStock(avant, movement)

			if (apres === avant) {
				// Rien à écrire, et surtout rien à journaliser : un comptage conforme
				// n'est pas un mouvement.
				resultats.push({
					...base,
					recordId: produit.id,
					stockBefore: avant,
					stockAfter: avant,
					applied: false,
				})
				continue
			}

			await pb.collection('products').update(produit.id, { stock: apres })

			resultats.push({
				...base,
				recordId: produit.id,
				stockBefore: avant,
				stockAfter: apres,
				applied: true,
			})

			// Le journal est best-effort, comme il l'était pour AppPos : une écriture
			// de trace ratée ne défait pas un mouvement déjà appliqué.
			try {
				await createProductEvent(pb, {
					product_id: produit.id,
					product_name_snapshot: movement.productName ?? produit.name,
					product_sku_snapshot: movement.productSku ?? produit.sku ?? '',
					event_type: eventTypeFor(options.reason),
					source: eventSourceFor(options.reason),
					source_id: options.sourceId ?? null,
					operator: options.operator ?? '',
					before: { stock: avant },
					after: { stock: apres },
					// Le journal porte le mouvement, pas seulement les deux bornes :
					// c'est lui qu'on additionne pour reconstituer une période.
					delta: { stock: apres - avant },
					metadata:
						movement.metadata || options.metadata
							? { ...(options.metadata ?? {}), ...(movement.metadata ?? {}) }
							: null,
					occurred_at: new Date().toISOString(),
				})
			} catch (error) {
				console.error('[stock] journalisation refusée', error)
			}
		} catch (error) {
			resultats.push({
				...base,
				error:
					error instanceof Error
						? error.message
						: 'produit introuvable en base',
			})
		}
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
