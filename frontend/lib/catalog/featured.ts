// frontend/lib/catalog/featured.ts
// ═══════════════════════════════════════════════════════════════════════════
// LE PRODUIT MIS EN AVANT — LA RÈGLE, EN UN SEUL ENDROIT
// ═══════════════════════════════════════════════════════════════════════════
//
// Écrit le 15 septembre 2026. Une fiche peut être « mise en avant » et porter
// une pastille dont le client écrit le texte : « Coup de cœur », « Spécial
// rentrée 2026 », « Notre sélection »…
//
// Deux champs au schéma, et c'est délibéré — `featured` dit SI la pastille
// s'affiche, `featured_label` dit CE QU'ELLE PORTE. Le pourquoi est dans
// `backend/migrations/add_featured_to_products.go` ; en un mot : avec un champ
// unique, cocher sans écrire serait impossible, et effacer le texte pour le
// corriger ferait disparaître la pastille au milieu d'une frappe.
//
// Ce fichier est la SEULE définition côté PocketApp de ce qu'est un libellé
// acceptable : le formulaire de la fiche le lit, l'export vers le site le
// relit avant d'envoyer. Même raison que `web-links.ts` — deux validations
// écrites séparément divergent, et c'est le site qui perd.
//
// ── LE LIBELLÉ PAR DÉFAUT N'EST PAS ICI ───────────────────────────────────
//
// « Coup de cœur » ne s'écrit NI dans la base, NI dans l'export, NI dans le
// serveur : il se décide au seul endroit qui l'affiche, le composant du site.
// L'écrire ici ferait 3000 fiches portant un texte que personne n'a choisi, et
// changer ce défaut plus tard demanderait de les réécrire toutes. Même
// raisonnement que l'identifiant d'une vidéo YouTube, dérivé au seul endroit
// qui l'intègre.
//
// PocketApp l'AFFICHE néanmoins en indice sous le champ de saisie, pour que le
// vendeur sache ce que verra le client s'il laisse vide : c'est un texte
// d'interface, pas une donnée — d'où `LIBELLE_PAR_DEFAUT` ci-dessous, qui ne
// part jamais dans un corps d'export.

/** La longueur maximale du libellé. Doit valoir `FeaturedLabelMaxLength`
 *  (`backend/migrations/add_featured_to_products.go`) et `FEATURED_LABEL_MAX`
 *  (`server/lib/featured.php`) : au-delà, la pastille déborde de la carte. */
export const MAX_LIBELLE = 40

/** Ce que le SITE affiche quand le libellé est vide. Montré en indice dans le
 *  formulaire ; **jamais envoyé** — voir l'en-tête de ce fichier. */
export const LIBELLE_PAR_DEFAUT = 'Coup de cœur'

/**
 * Le libellé remis au propre : espaces de bord retirés, suites d'espaces
 * réduites, longueur bornée.
 *
 * Les espaces répétés sont réduits parce qu'une pastille les rend tels quels
 * et qu'un « Coup  de cœur » collé depuis un tableur se verrait. La coupe est
 * une coupe, pas un refus : un libellé trop long est une maladresse de saisie,
 * pas une donnée dangereuse — contrairement à une URL, où le refus est la
 * bonne réponse.
 */
export function libelleNormalise(valeur: unknown): string {
	if (typeof valeur !== 'string') return ''
	return valeur.trim().replace(/\s+/g, ' ').slice(0, MAX_LIBELLE)
}

/**
 * La mise en avant d'une fiche, telle qu'elle part vers le site.
 *
 * `null` quand la fiche n'est pas mise en avant — et c'est l'état de la
 * quasi-totalité du catalogue. Le libellé vide est CONSERVÉ tel quel dans le
 * cas contraire : il veut dire « le défaut du site », et ce n'est pas au
 * client de le recopier.
 *
 * ⚠️ Cocher la case NE PUBLIE PAS la fiche : `status` reste seul juge, comme
 * pour `sale_state`.
 */
export function miseEnAvant(produit: {
	featured?: boolean
	featured_label?: string
}): { label: string } | null {
	if (!produit.featured) return null
	return { label: libelleNormalise(produit.featured_label) }
}
