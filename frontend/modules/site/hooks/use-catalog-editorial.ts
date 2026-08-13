// frontend/modules/site/hooks/use-catalog-editorial.ts
// ═══════════════════════════════════════════════════════════════════════════
// ÉCRITURE DES TEXTES DU SITE — la seule voie, et elle est nommée
// ═══════════════════════════════════════════════════════════════════════════
// Écrit `name` (produit) et `description` (produit, catégorie, marque) dans le
// catalogue PocketBase. Rien d'autre : ni prix, ni stock, ni statut — ils
// appartiennent à AppStock et feront l'objet d'une mission distincte.
//
// Elle vit ICI, et non dans `frontend/lib/queries/site-catalog.ts`, qui déclare
// en tête ne rien écrire : cette voie est propre à l'écran « Catalogue en
// ligne » et doit rester repérable comme telle.
//
// ⚠️ ELLE NE PASSE PAS PAR `useUpdateProductUniversal`
// (`frontend/lib/queries/products.ts:180`), qui route entre deux chemins
// d'écriture sur une chaîne non typée. `CLAUDE.md` interdit d'aggraver cette
// dette : on n'en ajoute pas un troisième cas, on écrit ici dans PocketBase et
// nulle part ailleurs.
//
// ⚠️ CES SAISIES NE SURVIVENT PAS À `catalog-import -load`, qui purge les
// collections (`backend/catalog/load/loader.go:290`). C'est assumé : la
// campagne éditoriale réelle se fera après l'import définitif
// (docs/DECISIONS.md, 2026-08-12). L'écran le dit à l'utilisateur.
//
// L'invalidation porte sur `['site-catalog']` en entier : les empreintes se
// recalculent depuis les listes lues, et un produit dont le `name` a changé
// doit repasser « modifié » sans qu'on ait à rafraîchir la page.
// ═══════════════════════════════════════════════════════════════════════════

import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { EditorialPatch } from '../lib/catalog-edit'

/** Les trois collections éditables. */
export type EditableKind = 'product' | 'category' | 'brand'

const COLLECTION: Record<EditableKind, string> = {
	product: 'products',
	category: 'categories',
	brand: 'brands',
}

export type EditorialWrite = {
	kind: EditableKind
	/** Identifiant PocketBase — c'est une écriture locale, pas un export : ici,
	 *  `legacy_id` n'a rien à faire. */
	id: string
	patch: EditorialPatch
}

/**
 * Écrit une retouche éditoriale. Une seule mutation pour les trois genres : la
 * différence tient au nom de la collection, et trois hooks jumeaux auraient
 * surtout triplé les occasions de diverger.
 *
 * `name` n'est envoyé que pour un produit. La garde n'est pas une politesse :
 * une catégorie ou une marque dont le nom changerait ici sortirait du périmètre
 * décidé, et le nom d'une catégorie est ce qui compose le menu publié.
 */
export function useUpdateCatalogEditorial() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation<void, Error, EditorialWrite>({
		mutationFn: async ({ kind, id, patch }) => {
			const body: Record<string, string> = { description: patch.description }
			if (kind === 'product' && patch.name !== undefined) {
				body.name = patch.name
			}

			await pb.collection(COLLECTION[kind]).update(id, body)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['site-catalog'] })
		},
	})
}
