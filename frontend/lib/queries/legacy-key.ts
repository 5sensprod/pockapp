// frontend/lib/queries/legacy-key.ts
//
// LA CLÉ STABLE D'UNE ENTITÉ CRÉÉE DANS POCKETAPP.
//
// `legacy_id` ne veut plus dire « identifiant NeDB d'origine » mais **« clé
// stable de l'entité, hors PocketBase »** (docs/DECISIONS.md, 2026-08-13).
// C'est elle, et jamais l'identifiant PocketBase, qui identifie une entité côté
// site : les identifiants PocketBase sont régénérés à chaque rechargement par
// purge, s'en servir produirait des doublons silencieux (§1 du contrat).
//
// Une entité SANS clé n'est pas seulement refusée à l'export : elle disparaît
// des relations. `toExportProduct` résout marque et catégories en `legacy_id`
// puis écarte les vides — un produit partait donc sans sa catégorie et sans sa
// marque, sans un mot.
//
// Le préfixe `pa_` distingue au premier regard ce qui vient de NeDB de ce qui
// est né ici, et rend la collision impossible : les identifiants NeDB n'en
// portent pas.

/** Préfixe des clés produites par PocketApp. */
export const POCKETAPP_KEY_PREFIX = 'pa_'

/** 16 caractères après le préfixe, comme les identifiants NeDB. Le champ est
 *  plafonné à 50 au schéma (`catalog_v2.go`) : on reste loin dessous. */
const KEY_LENGTH = 16
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Une clé stable, tirée du générateur cryptographique du navigateur.
 *
 * `Math.random()` aurait suffi statistiquement, mais `crypto` est déjà là — il
 * sert au calcul des empreintes — et il n'y a aucune raison de préférer le
 * générateur le plus faible pour une valeur qui devient une clé primaire côté
 * SQL.
 */
export function newLegacyKey(): string {
	const bytes = new Uint8Array(KEY_LENGTH)
	crypto.getRandomValues(bytes)

	let key = ''
	for (const byte of bytes) key += ALPHABET[byte % ALPHABET.length]

	return POCKETAPP_KEY_PREFIX + key
}

/** Vrai si l'entité vient de PocketApp et non de NeDB. Sert l'affichage, pas la
 *  logique : les deux sortes de clés valent exactement la même chose. */
export function isPocketAppKey(legacyId: string | undefined): boolean {
	return Boolean(legacyId?.startsWith(POCKETAPP_KEY_PREFIX))
}
