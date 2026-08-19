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
// ── CE QUI EST BRANCHÉ, ET CE QUI NE L'EST PAS ────────────────────────────
// Branchés le 19 août 2026 : l'INVENTAIRE et le RECLASSEMENT.
// Pas encore : la VENTE — caisse, facture, devis —, qui reste sur AppPos
// jusqu'au front E. C'est l'ordre décidé : la couche se prouve sur deux
// appelants avant de toucher au maillon le moins négociable.
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
// 2026-08-13). Tant que la caisse vend sur NeDB, les deux stocks divergent —
// c'est accepté, daté, et ça se referme au front E.

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
 * peuvent donc s'écraser. C'est tenable ici — un poste de caisse, un opérateur
 * d'inventaire — et ça ne l'est plus le jour où deux postes vendent en même
 * temps : il faudra alors un hook PocketBase côté serveur.
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
			const produit = await pb
				.collection('products')
				.getFirstListItem<{
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
