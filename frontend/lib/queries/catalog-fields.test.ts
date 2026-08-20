// frontend/lib/queries/catalog-fields.test.ts
//
// LE PIÈGE LE PLUS CHER DU MODULE : un champ absent de `fields` revient VIDE,
// sans erreur. `gallery` a manqué à la liste jusqu'au 19 août 2026, et c'est
// pourquoi 747 galeries importées ne s'affichaient nulle part — le champ
// paraissait vide alors que la base était pleine.
//
// Ce test n'a pas d'autre gardien : rien, dans TypeScript, ne relie le type
// `CatalogProductShape` à la chaîne `fields` envoyée au serveur.
//
// ⚠️ L'import est DYNAMIQUE, et c'est forcé : `catalog-products.ts` construit
// le client PocketBase au chargement du module (`use-pocketbase.ts:20`), qui
// lit `window` et `document`. Un import statique lèverait avant le premier
// test, et jsdom n'est pas une dépendance de ce dépôt — deux lignes de décor
// coûtent moins qu'un paquet de plus.

import { beforeAll, describe, expect, it } from 'vitest'

let PRODUCT_FIELDS = ''
let SITE_PRODUCT_FIELDS = ''

beforeAll(async () => {
	const g = globalThis as any
	g.window ??= g
	g.document ??= { location: { origin: 'http://127.0.0.1:8090' } }
	PRODUCT_FIELDS = (await import('./catalog-products')).PRODUCT_FIELDS
	SITE_PRODUCT_FIELDS = (await import('./site-catalog')).PRODUCT_FIELDS
})

describe('PRODUCT_FIELDS', () => {
	it('demande les deux champs image — sinon l’écran les croit vides', () => {
		const demandes = PRODUCT_FIELDS.split(',')
		expect(demandes).toContain('image')
		expect(demandes).toContain('gallery')
	})

	it('demande la clé stable et l’identité du record', () => {
		// `legacy_id` est le pont vers NeDB ; `collectionId` et `collectionName`
		// sont ce dont `pb.files.getUrl` a besoin pour construire l'URL d'un
		// fichier. Sans eux, aucune image ne s'affiche.
		const demandes = PRODUCT_FIELDS.split(',')
		expect(demandes).toContain('legacy_id')
		expect(demandes).toContain('collectionId')
		expect(demandes).toContain('collectionName')
	})
})

// ═══════════════════════════════════════════════════════════════════════════
// L'AUTRE LISTE — celle du module `site`
// ═══════════════════════════════════════════════════════════════════════════
// `site-catalog.ts` a sa PROPRE chaîne `fields`, et elle n'a longtemps pas
// demandé `gallery` : le module site n'en avait pas l'usage tant que les
// images ne partaient pas. Le miroir d'images des produits en fait la source
// de l'ORDRE DES RANGS — sans elle, chaque produit paraîtrait n'avoir que son
// image principale, et 1767 fichiers ne partiraient jamais. Sans un mot : le
// même piège, au même endroit, une collection plus loin.

describe('PRODUCT_FIELDS du module site', () => {
	it('demande les deux champs image — l’ordre des rangs vient de `gallery`', () => {
		const demandes = SITE_PRODUCT_FIELDS.split(',')
		expect(demandes).toContain('image')
		expect(demandes).toContain('gallery')
	})

	it('demande de quoi nommer l’arborescence distante et résoudre les fichiers', () => {
		// `legacy_id` nomme le dossier distant `<kind>/<legacy_id>/<rang>.<ext>`
		// (§4.1) ; `collectionId` et `collectionName` sont ce dont
		// `pb.files.getUrl` a besoin pour aller lire les octets à hacher.
		const demandes = SITE_PRODUCT_FIELDS.split(',')
		expect(demandes).toContain('legacy_id')
		expect(demandes).toContain('collectionId')
		expect(demandes).toContain('collectionName')
	})

	it('demande `status` — les brouillons ne partent pas', () => {
		// §4.1 du contrat : `status` n'admet que `published`. Un brouillon ne
		// s'exporte pas, donc ses images non plus, et le miroir répond 409
		// « Entité inconnue de la base du site » si on essaie quand même.
		expect(SITE_PRODUCT_FIELDS.split(',')).toContain('status')
	})
})
