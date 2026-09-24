// frontend/lib/catalog/availability.ts
// ═══════════════════════════════════════════════════════════════════════════
// LE MESSAGE DE DISPONIBILITÉ — LA RÈGLE, EN UN SEUL ENDROIT
// ═══════════════════════════════════════════════════════════════════════════
//
// Écrit le 24 septembre 2026. Quand le stock neuf d'une fiche est à zéro, le
// site affiche un message que le magasin écrit : « Sur commande », « Livraison
// prochaine », « Retour en octobre »… Vide, il affiche son propre défaut.
//
// Le pourquoi du champ (et de la disparition de `manage_stock`, qui n'a jamais
// eu de lecteur) est dans `backend/migrations/add_availability_to_products.go`.
//
// Ce fichier est la SEULE définition côté PocketApp de ce qu'est un message
// acceptable : le formulaire de la fiche le lit, l'export vers le site le relit
// avant d'envoyer. Même raison que `featured.ts` — deux validations écrites
// séparément divergent, et c'est le site qui perd. Le serveur revalide
// (`server/lib/availability.php`, mêmes cas dans `availability.test.ts`).
//
// ── LE MESSAGE PAR DÉFAUT N'EST PAS ICI ───────────────────────────────────
//
// « Réappro » ne s'écrit NI dans la base, NI dans l'export, NI dans le serveur :
// il se décide au seul endroit qui l'affiche, le bundle du site. L'écrire en
// base ferait 3000 fiches portant un texte que personne n'a choisi.
//
// PocketApp l'AFFICHE néanmoins en indice sous le champ de saisie, pour que le
// vendeur sache ce que verra le client s'il laisse vide : c'est un texte
// d'interface, pas une donnée — d'où `MESSAGE_PAR_DEFAUT`, qui ne part jamais
// dans un corps d'export.

/** La longueur maximale du message. Doit valoir `AvailabilityLabelMaxLength`
 *  (`backend/migrations/add_availability_to_products.go`) et
 *  `AVAILABILITY_LABEL_MAX` (`server/lib/availability.php`) : au-delà, il
 *  déborde de la carte du site. */
export const MAX_MESSAGE = 60

/** Ce que le SITE affiche quand le message est vide. Montré en indice dans le
 *  formulaire ; **jamais envoyé** — voir l'en-tête de ce fichier. */
export const MESSAGE_PAR_DEFAUT = 'Réappro'

/** Des messages prêts à poser. Ce ne sont QUE des raccourcis de saisie : rien
 *  ici n'est une valeur du schéma, le champ reste un texte libre. */
export const MESSAGES_SUGGERES = [
	'Sur commande',
	'Réappro',
	'Livraison prochaine',
	'Retour en stock bientôt',
] as const

/**
 * Le message remis au propre : espaces de bord retirés, suites d'espaces
 * réduites, longueur bornée.
 *
 * La coupe est une coupe, pas un refus : un message trop long est une
 * maladresse de saisie, pas une donnée dangereuse — contrairement à une URL,
 * où le refus est la bonne réponse.
 */
export function messageNormalise(valeur: unknown): string {
	if (typeof valeur !== 'string') return ''
	return valeur.trim().replace(/\s+/g, ' ').slice(0, MAX_MESSAGE)
}
