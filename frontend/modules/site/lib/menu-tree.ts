// frontend/modules/site/lib/menu-tree.ts
// ═══════════════════════════════════════════════════════════════════════════
// ARBRE DU MENU — construction et déplacements  (ticket 4)
// ═══════════════════════════════════════════════════════════════════════════
// Fonctions pures : elles ne touchent ni à React, ni à PocketBase. Elles
// prennent la liste plate des entrées et rendent soit un arbre d'affichage,
// soit la liste des changements de `position`/`parent` à écrire.
//
// Le déplacement se fait par boutons — monter, descendre, indenter,
// désindenter — et non par glisser-déposer. Aucune bibliothèque de
// glisser-déposer n'existe dans ce dépôt, et on n'en ajoute pas une sur une
// hypothèse d'ergonomie.
//
// Un seul glisser existe, depuis le 10 septembre 2026 : déposer une catégorie
// du catalogue sur un sous-menu, pour y créer une entrée. Il est en HTML5 natif,
// sur le modèle du lot de produits de la page Produits (`product-batch-drag.ts`),
// et sa règle est `categoryDrop`, plus bas.
//
// Convention de `position` : entiers consécutifs à partir de 1, **par
// fratrie**. Deux entrées de parents différents peuvent porter la même
// position, c'est normal — la position n'ordonne que des frères. Chaque
// opération renumérote la ou les fratries touchées en pas de 1, ce qui évite
// la dérive des rangs fractionnaires.
// ═══════════════════════════════════════════════════════════════════════════

import type { SiteMenuRecord, SiteMenuResponse } from '@/lib/queries/site-menu'

/** Racine = `parent` vide. PocketBase rend une relation non renseignée
 *  comme chaîne vide, pas comme `null`. */
export const ROOT = ''

export interface MenuNode {
	entry: SiteMenuResponse
	children: MenuNode[]
	/** Profondeur d'affichage, 0 à la racine. */
	depth: number
}

/** Un changement à écrire. `position` et `parent` sont optionnels
 *  séparément : monter/descendre ne touche pas au parent. */
export interface MenuMove {
	id: string
	position?: number
	parent?: string
}

// ---------------------------------------------------------------------------
// CONSTRUCTION
// ---------------------------------------------------------------------------

function sortSiblings(entries: SiteMenuResponse[]): SiteMenuResponse[] {
	return [...entries].sort((a, b) => {
		const pa = a.position ?? 0
		const pb = b.position ?? 0
		if (pa !== pb) return pa - pb
		// Ordre stable quand deux positions se valent.
		return a.created.localeCompare(b.created)
	})
}

/**
 * Construit l'arbre d'affichage à partir de la liste plate.
 *
 * Une entrée dont le `parent` désigne un identifiant absent de la liste est
 * rattachée à la racine plutôt que perdue. Ce cas ne devrait pas se produire
 * — la suppression est en cascade — mais une entrée invisible à l'écran et
 * présente en base serait bien pire qu'une entrée mal placée.
 */
export function buildMenuTree(entries: SiteMenuResponse[]): MenuNode[] {
	const known = new Set(entries.map((e) => e.id))
	const byParent = new Map<string, SiteMenuResponse[]>()

	for (const entry of entries) {
		const parent = entry.parent && known.has(entry.parent) ? entry.parent : ROOT
		const siblings = byParent.get(parent)
		if (siblings) siblings.push(entry)
		else byParent.set(parent, [entry])
	}

	const build = (parentId: string, depth: number): MenuNode[] =>
		sortSiblings(byParent.get(parentId) ?? []).map((entry) => ({
			entry,
			children: build(entry.id, depth + 1),
			depth,
		}))

	return build(ROOT, 0)
}

/** Aplatit l'arbre dans l'ordre d'affichage, profondeur comprise.
 *  C'est cette liste que l'éditeur rend, une ligne par entrée. */
export function flattenMenuTree(nodes: MenuNode[]): MenuNode[] {
	const out: MenuNode[] = []
	const walk = (list: MenuNode[]) => {
		for (const node of list) {
			out.push(node)
			walk(node.children)
		}
	}
	walk(nodes)
	return out
}

/** Les frères d'une entrée, dans l'ordre, entrée comprise. */
function siblingsOf(
	entries: SiteMenuResponse[],
	entry: SiteMenuResponse,
): SiteMenuResponse[] {
	const known = new Set(entries.map((e) => e.id))
	const parentOf = (e: SiteMenuResponse) =>
		e.parent && known.has(e.parent) ? e.parent : ROOT
	const parent = parentOf(entry)
	return sortSiblings(entries.filter((e) => parentOf(e) === parent))
}

/** Renumérote une fratrie en pas de 1 et rend les changements utiles.
 *  Les entrées déjà au bon rang ne produisent rien à écrire. */
function renumber(siblings: SiteMenuResponse[], parent?: string): MenuMove[] {
	const moves: MenuMove[] = []
	siblings.forEach((entry, index) => {
		const position = index + 1
		const parentChanged = parent !== undefined && entry.parent !== parent
		if (entry.position === position && !parentChanged) return
		moves.push({
			id: entry.id,
			position,
			...(parentChanged ? { parent } : {}),
		})
	})
	return moves
}

// ---------------------------------------------------------------------------
// DÉPLACEMENTS
// ---------------------------------------------------------------------------
// Chacune rend `[]` quand le déplacement est impossible : c'est aussi ce qui
// permet à l'interface de désactiver le bouton correspondant, sans dupliquer
// la règle.

/** Échange l'entrée avec son frère précédent. */
export function moveUp(entries: SiteMenuResponse[], id: string): MenuMove[] {
	const entry = entries.find((e) => e.id === id)
	if (!entry) return []

	const siblings = siblingsOf(entries, entry)
	const index = siblings.findIndex((e) => e.id === id)
	if (index <= 0) return []

	const swapped = [...siblings]
	const previous = swapped[index - 1]
	swapped[index - 1] = swapped[index]
	swapped[index] = previous

	return renumber(swapped)
}

/** Échange l'entrée avec son frère suivant. */
export function moveDown(entries: SiteMenuResponse[], id: string): MenuMove[] {
	const entry = entries.find((e) => e.id === id)
	if (!entry) return []

	const siblings = siblingsOf(entries, entry)
	const index = siblings.findIndex((e) => e.id === id)
	if (index === -1 || index >= siblings.length - 1) return []

	const swapped = [...siblings]
	const next = swapped[index + 1]
	swapped[index + 1] = swapped[index]
	swapped[index] = next

	return renumber(swapped)
}

/**
 * Indente : l'entrée devient le dernier enfant de son frère précédent.
 *
 * Sans frère précédent, il n'y a pas de parent où aller — l'opération est
 * impossible, et c'est la seule règle qui la limite. Sa descendance suit
 * sans rien à écrire : elle pointe vers l'entrée, qui garde son identifiant.
 */
export function indent(entries: SiteMenuResponse[], id: string): MenuMove[] {
	const entry = entries.find((e) => e.id === id)
	if (!entry) return []

	const siblings = siblingsOf(entries, entry)
	const index = siblings.findIndex((e) => e.id === id)
	if (index <= 0) return []

	const newParent = siblings[index - 1]
	const known = new Set(entries.map((e) => e.id))
	const newSiblings = sortSiblings(
		entries.filter(
			(e) =>
				e.id !== id &&
				e.parent &&
				known.has(e.parent) &&
				e.parent === newParent.id,
		),
	)

	// L'entrée déplacée est ajoutée en fin de sa nouvelle fratrie.
	const moves = renumber([...newSiblings, entry], newParent.id)

	// L'ancienne fratrie se resserre sur le trou laissé.
	const remaining = siblings.filter((e) => e.id !== id)
	return [...moves, ...renumber(remaining)]
}

/**
 * Désindente : l'entrée devient le frère suivant de son parent.
 *
 * Impossible à la racine, il n'y a rien au-dessus. Ses propres frères
 * restants ne bougent pas de parent, seulement de rang.
 */
export function outdent(entries: SiteMenuResponse[], id: string): MenuMove[] {
	const entry = entries.find((e) => e.id === id)
	if (!entry) return []

	const known = new Set(entries.map((e) => e.id))
	const parentId = entry.parent && known.has(entry.parent) ? entry.parent : ROOT
	if (parentId === ROOT) return []

	const parent = entries.find((e) => e.id === parentId)
	if (!parent) return []

	const oldSiblings = siblingsOf(entries, entry).filter((e) => e.id !== id)
	const parentSiblings = siblingsOf(entries, parent)
	const parentIndex = parentSiblings.findIndex((e) => e.id === parentId)

	// Insertion juste après le parent, pour que le déplacement se lise à
	// l'écran comme un pas vers la gauche et non comme un saut en fin de liste.
	const reordered = [...parentSiblings]
	reordered.splice(parentIndex + 1, 0, entry)

	const newParent =
		parent.parent && known.has(parent.parent) ? parent.parent : ROOT

	return [...renumber(reordered, newParent), ...renumber(oldSiblings)]
}

// ---------------------------------------------------------------------------
// CRÉATION
// ---------------------------------------------------------------------------

/** Position d'une nouvelle entrée : à la fin de sa fratrie. */
export function nextPosition(
	entries: SiteMenuResponse[],
	parentId: string,
): number {
	const known = new Set(entries.map((e) => e.id))
	const siblings = entries.filter(
		(e) => (e.parent && known.has(e.parent) ? e.parent : ROOT) === parentId,
	)
	return siblings.reduce((max, e) => Math.max(max, e.position ?? 0), 0) + 1
}

// ---------------------------------------------------------------------------
// DÉPÔT D'UNE CATÉGORIE
// ---------------------------------------------------------------------------

/** Type privé posé dans `DataTransfer` : il ne porte que l'identifiant
 *  PocketBase de la catégorie, et n'accepte ni texte, ni fichier, ni lot de
 *  produits. */
export const MENU_CATEGORY_DRAG_TYPE = 'application/x-pocketapp-menu-category'

/** Ce que le dépôt a besoin de savoir de la catégorie glissée. */
export interface DroppedCategory {
	/** Part dans `ref_id` — c'est lui que la publication résout en URL. */
	legacyId: string
	name: string
	/** Au moins un produit publié dans sa branche : elle a une page sur le
	 *  site. Lu dans `par_categorie_publiee`, jamais recalculé ici. */
	online: boolean
}

export type CategoryDropResult =
	| {
			ok: true
			record: SiteMenuRecord & { parent: string; position: number }
	  }
	| { ok: false; reason: string }

/**
 * La règle du dépôt d'une catégorie sur une entrée du menu.
 *
 * Refusé, dans cet ordre : à la racine (une entrée racine se crée par son
 * bouton), sur une entrée inconnue, sur une entrée qui n'est pas un sous-menu
 * (`link_type = none`), pour une catégorie sans clé stable ou hors ligne — elle
 * n'aurait pas de page —, et pour une catégorie déjà présente sous ce parent.
 *
 * Accepté : une entrée `category`, visible, nommée comme la catégorie, en fin
 * de fratrie.
 */
export function categoryDrop(
	entries: SiteMenuResponse[],
	parentId: string,
	category: DroppedCategory,
): CategoryDropResult {
	if (parentId === ROOT) {
		return { ok: false, reason: 'Une catégorie se dépose dans un sous-menu.' }
	}

	const parent = entries.find((e) => e.id === parentId)
	if (!parent) {
		return { ok: false, reason: "Cette entrée n'existe plus." }
	}
	if (parent.link_type !== 'none') {
		return {
			ok: false,
			reason: `« ${parent.title} » n'est pas un sous-menu.`,
		}
	}
	if (!category.legacyId) {
		return {
			ok: false,
			reason: `« ${category.name} » n'a pas de clé stable.`,
		}
	}
	if (!category.online) {
		return {
			ok: false,
			reason: `« ${category.name} » n'est pas en ligne : aucun produit publié.`,
		}
	}

	const doublon = entries.find(
		(e) =>
			e.parent === parentId &&
			e.link_type === 'category' &&
			e.ref_id === category.legacyId,
	)
	if (doublon) {
		return {
			ok: false,
			reason: `« ${parent.title} » contient déjà cette catégorie (« ${doublon.title} »).`,
		}
	}

	return {
		ok: true,
		record: {
			title: category.name,
			link_type: 'category',
			link_url: '',
			ref_id: category.legacyId,
			visible: true,
			parent: parentId,
			position: nextPosition(entries, parentId),
		},
	}
}

// ---------------------------------------------------------------------------
// VISIBILITÉ
// ---------------------------------------------------------------------------

/**
 * Une entrée est effectivement masquée si elle-même ou l'un de ses ancêtres
 * l'est : le contrat impose que masquer une entrée masque sa descendance
 * (§4). En base, seule l'entrée cochée porte `visible: false` ; c'est ici
 * que la propagation se calcule, pour l'affichage seulement.
 *
 * Rend l'ensemble des identifiants masqués par un ancêtre — l'éditeur peut
 * ainsi distinguer « masquée » de « masquée par son parent », que l'opérateur
 * n'a aucun moyen de deviner autrement.
 */
export function hiddenByAncestor(nodes: MenuNode[]): Set<string> {
	const hidden = new Set<string>()

	const walk = (list: MenuNode[], parentHidden: boolean) => {
		for (const node of list) {
			if (parentHidden) hidden.add(node.entry.id)
			walk(node.children, parentHidden || node.entry.visible === false)
		}
	}

	walk(nodes, false)
	return hidden
}
