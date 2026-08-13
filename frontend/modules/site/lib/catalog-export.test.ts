// frontend/modules/site/lib/catalog-export.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITION DES LOTS D'EXPORT — cas vérifiés
// ═══════════════════════════════════════════════════════════════════════════
// `pnpm test`
//
// Ce qui est gardé ici : l'empreinte, dont dépend la distinction entre « à
// jour » et « modifié », et le découpage, dont dépend le fait qu'un lot passe
// ou soit refusé en 413 par le mutualisé.
//
// Ce qui n'est PAS testé : l'écriture SQL, gardée par le PHP et par lui seul.
// ═══════════════════════════════════════════════════════════════════════════

import type { CatalogProduct } from '@/lib/queries/site-catalog'
import { describe, expect, it } from 'vitest'
import {
	CATALOG_CONTRACT_VERSION,
	type ExportBrand,
	type ExportCategory,
	type ExportProduct,
	buildExportBatches,
	checksumOf,
	sealed,
	syncStateOf,
	toExportProduct,
} from './catalog-export'

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct => ({
	id: 'pb-1',
	collectionId: 'c',
	collectionName: 'products',
	legacy_id: 'nedb-1',
	name: 'Ukulélé',
	status: 'published',
	price_ttc: 59.9,
	...over,
})

const entity = (n: number) => ({ legacy_id: `e${n}`, checksum: `c${n}` })

describe('checksumOf', () => {
	it('ignore l’ordre des clés', async () => {
		const a = await checksumOf({ legacy_id: 'x', name: 'A', stock: 1 })
		const b = await checksumOf({ stock: 1, name: 'A', legacy_id: 'x' })

		expect(a).toBe(b)
	})

	it('ignore le champ checksum lui-même', async () => {
		// Sans cela, sceller une entité changerait son empreinte, et rien ne
		// serait jamais « à jour ».
		const sansEmpreinte = await checksumOf({ legacy_id: 'x', name: 'A' })
		const avecEmpreinte = await checksumOf({
			legacy_id: 'x',
			name: 'A',
			checksum: 'peu importe',
		})

		expect(avecEmpreinte).toBe(sansEmpreinte)
	})

	it('change dès qu’une valeur change', async () => {
		const avant = await checksumOf({ legacy_id: 'x', price_ttc: 10 })
		const apres = await checksumOf({ legacy_id: 'x', price_ttc: 11 })

		expect(apres).not.toBe(avant)
	})

	it('distingue un objet imbriqué réordonné d’un objet différent', async () => {
		const a = await checksumOf({ id: 'x', tags: ['a', 'b'] })
		const b = await checksumOf({ id: 'x', tags: ['b', 'a'] })

		// L'ORDRE D'UN TABLEAU EST SIGNIFIANT, contrairement à celui des clés.
		expect(a).not.toBe(b)
	})
})

describe('toExportProduct', () => {
	it('force status à published', async () => {
		// Le serveur refuse tout autre statut : appliquer la règle de publication
		// lui est interdit (§4.1 du contrat).
		const exported = toExportProduct(product(), [], null)

		expect(exported.status).toBe('published')
	})

	// ── L'ÉDITION DES TEXTES DU SITE PASSE PAR L'EMPREINTE ────────────────────
	// Décision du 12 août 2026 : `name` et `description` s'éditent dans l'écran
	// « Catalogue en ligne » et s'écrivent dans `products`. Rien d'autre n'a été
	// ajouté à la chaîne d'export — c'est précisément ce que ces deux cas
	// vérifient : les deux champs entrant dans l'empreinte, une retouche fait
	// repasser le produit « modifié », donc il repart à l'export.
	//
	// Aucun autre gardien : ni le PHP, qui stocke l'empreinte sans la
	// recalculer (§4.4 du contrat), ni le type, qui ne dit rien du contenu.
	it('change d’empreinte quand le nom est corrigé', async () => {
		const reference = await sealed(
			toExportProduct(product({ name: 'ABGS14SH' }), [], null),
		)
		const corrige = await sealed(
			toExportProduct(product({ name: 'Guitare folk Alvarez' }), [], null),
		)

		expect(corrige.checksum).not.toBe(reference.checksum)
	})

	it('change d’empreinte quand la description est écrite', async () => {
		const sans = await sealed(toExportProduct(product(), [], null))
		const avec = await sealed(
			toExportProduct(product({ description: 'Un bel instrument.' }), [], null),
		)

		expect(avec.checksum).not.toBe(sans.checksum)
		// Et l'inventaire les départage : c'est ce qui rend le bouton « Mettre à
		// jour » visible sur la carte.
		expect(
			syncStateOf('nedb-1', avec.checksum, { 'nedb-1': sans.checksum }),
		).toBe('modified')
	})

	it('laisse site_title à null — le champ reste au contrat, non câblé', () => {
		// `catalog.php` retombe sur `name` quand `site_title` est vide
		// (`present_product`), et c'est ce qui fait arriver le nom corrigé sur le
		// site sans une ligne de plus ici. Brancher `site_title` est une décision
		// à part, pas un raccourci à prendre en passant.
		const exported = toExportProduct(product({ name: 'Guitare' }), [], null)

		expect(exported.site_title).toBeNull()
		expect(exported.name).toBe('Guitare')
	})

	it('porte les relations en legacy_id, jamais en identifiant PocketBase', () => {
		const exported = toExportProduct(product(), ['cat-legacy'], 'brand-legacy')

		expect(exported.categories).toEqual(['cat-legacy'])
		expect(exported.brand).toBe('brand-legacy')
		expect(exported.legacy_id).toBe('nedb-1')
	})

	it('normalise les chaînes vides en null', () => {
		const exported = toExportProduct(product({ sku: '', slug: '  ' }), [], null)

		expect(exported.sku).toBeNull()
		// Une chaîne d'espaces vaut une chaîne vide : elle part en null, et non
		// en `"  "` qui ferait un slug d'espaces dans la base du site.
		expect(exported.slug).toBeNull()
	})

	it('remplace les champs numériques absents par 0', () => {
		const exported = toExportProduct(
			product({ price_ttc: undefined, stock: undefined }),
			[],
			null,
		)

		expect(exported.price_ttc).toBe(0)
		expect(exported.stock).toBe(0)
	})
})

describe('sealed', () => {
	it('ajoute une empreinte reproductible', async () => {
		const a = await sealed(toExportProduct(product(), [], null))
		const b = await sealed(toExportProduct(product(), [], null))

		expect(a.checksum).toBe(b.checksum)
		expect(a.checksum).toHaveLength(40)
	})
})

describe('syncStateOf', () => {
	it('déclare absent ce que l’inventaire ne connaît pas', () => {
		expect(syncStateOf('x', 'abc', {})).toBe('absent')
	})

	it('déclare absent quand l’inventaire n’a pas pu être lu', () => {
		expect(syncStateOf('x', 'abc', undefined)).toBe('absent')
	})

	it('distingue à jour et modifié sur l’empreinte', () => {
		expect(syncStateOf('x', 'abc', { x: 'abc' })).toBe('synced')
		expect(syncStateOf('x', 'def', { x: 'abc' })).toBe('modified')
	})
})

describe('buildExportBatches', () => {
	const at = '2026-08-11T15:00:00Z'

	it('ne produit aucun lot pour un export vide', () => {
		expect(buildExportBatches([], [], [], at)).toEqual([])
	})

	it('compte les trois types ensemble dans le plafond', () => {
		const batches = buildExportBatches(
			[entity(1), entity(2)] as unknown as ExportProduct[],
			[entity(3)] as unknown as ExportCategory[],
			[entity(4)] as unknown as ExportBrand[],
			at,
			2,
		)

		// 4 entités, plafond 2 → 2 lots.
		expect(batches).toHaveLength(2)
		expect(
			batches.reduce(
				(n, b) => n + b.products.length + b.categories.length + b.brands.length,
				0,
			),
		).toBe(4)
	})

	it('ferme le lot sur la TAILLE, pas seulement sur le nombre', () => {
		// Le cas réel : des descriptions longues font déborder le mégaoctet bien
		// avant la 200e entité. Sans ce découpage, l'export échouerait au milieu.
		const gros = (n: number) => ({
			legacy_id: `e${n}`,
			checksum: `c${n}`,
			description: 'x'.repeat(400),
		})

		const batches = buildExportBatches(
			[gros(1), gros(2), gros(3)] as unknown as ExportProduct[],
			[],
			[],
			at,
			200, // le plafond en nombre n'est jamais atteint
			500, // celui en octets, si
		)

		expect(batches.length).toBeGreaterThan(1)
		for (const batch of batches) {
			expect(JSON.stringify(batch).length).toBeLessThan(1200)
		}
	})

	it('laisse partir seule une entité plus grosse que le plafond', () => {
		// La couper serait pire que la laisser passer : le serveur dira ce qu'il
		// en pense, et le refus nommera l'entité.
		const enorme = {
			legacy_id: 'e1',
			checksum: 'c1',
			description: 'x'.repeat(2000),
		}

		const batches = buildExportBatches(
			[enorme] as unknown as ExportProduct[],
			[],
			[],
			at,
			200,
			500,
		)

		expect(batches).toHaveLength(1)
		expect(batches[0].products).toHaveLength(1)
	})

	it('envoie marques et catégories avant les produits', () => {
		const batches = buildExportBatches(
			[entity(1)] as unknown as ExportProduct[],
			[entity(2)] as unknown as ExportCategory[],
			[entity(3)] as unknown as ExportBrand[],
			at,
			1,
		)

		// Un lot interrompu doit laisser une base cohérente, pas des produits
		// citant des catégories absentes.
		expect(batches[0].brands).toHaveLength(1)
		expect(batches[1].categories).toHaveLength(1)
		expect(batches[2].products).toHaveLength(1)
	})

	it('estampille chaque lot de la version et de la date', () => {
		const batches = buildExportBatches(
			[entity(1)] as unknown as ExportProduct[],
			[],
			[],
			at,
		)

		expect(batches[0].contractVersion).toBe(CATALOG_CONTRACT_VERSION)
		expect(batches[0].exportedAt).toBe(at)
	})
})
