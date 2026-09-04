// frontend/modules/site/lib/slug-editorial.ts
// ═══════════════════════════════════════════════════════════════════════════
// LA RÉPARATION DU SLUG, DEPUIS L'ÉCRAN « CATALOGUE EN LIGNE »
// ═══════════════════════════════════════════════════════════════════════════
// Dans un fichier à part, et SANS effet de bord au chargement : le hook qui
// l'appelle importe `use-pocketbase`, qui lit `window` dès l'import et rend la
// règle intestable hors navigateur (même piège que `catalog-realtime.ts`).
// ═══════════════════════════════════════════════════════════════════════════

import { slugLibreDansCollection } from '@/lib/queries/slug'

/**
 * Le slug à poser si — et seulement si — la fiche n'en a pas encore.
 *
 * ⚠️ **UN SLUG NON VIDE NE SE RETOUCHE JAMAIS** : c'est l'adresse d'une page
 * déjà en ligne, renommer un produit ne la déplace pas (CLAUDE.md, 20 août
 * 2026). On ne répare donc que le vide, et on rend `null` dans tous les autres
 * cas.
 *
 * Pourquoi ici. La fiche produit répare le slug à l'enregistrement
 * (`useProductDetailEditor.submit`) ; cet écran-ci ne le faisait pas, alors
 * qu'il écrit dans la même collection ET qu'il est celui d'où part l'export.
 * Un produit né en caisse avant le 20 août 2026 — donc sans slug — retouché
 * ici puis exporté partait avec une adresse vide : `catalog-export.ts:199`
 * transporte le `null` tel quel et `products-sync.php` n'en invente aucun
 * (contrat §2). La page publique rendait « Produit introuvable ». La retouche
 * éditoriale est justement le geste qui précède la mise en ligne : c'est le
 * pire endroit où laisser passer ça.
 *
 * L'échec est silencieux à dessein : si la résolution du slug tombe, on
 * enregistre quand même le texte. On n'a jamais perdu que la réparation, que
 * l'enregistrement suivant retentera — l'inverse ferait perdre la rédaction.
 */
export async function slugAReparer(
	pb: any,
	id: string,
	nomPatche: string | undefined,
): Promise<string | null> {
	try {
		const actuel = await pb
			.collection('products')
			.getOne(id, { fields: 'id,name,slug' })
		if (actuel.slug) return null
		// Le nom qu'on est en train d'écrire prime : c'est celui que portera la
		// fiche, donc celui dont l'adresse doit dériver.
		const nom = nomPatche ?? actuel.name
		if (!nom) return null
		return await slugLibreDansCollection(pb, 'products', nom)
	} catch {
		return null
	}
}
