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
	aSynchroniser,
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
	// `name` et `description` entrent tous deux dans l'empreinte d'export. Depuis
	// le 19 août, seul `description` s'édite ici ; un changement de nom provenant
	// de la source produit doit néanmoins continuer à faire repartir la fiche.
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
		// (`present_product`). Le même nom/référence canonique fait donc foi dans
		// PocketBase et sur le site, sans titre parallèle.
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

// ═══════════════════════════════════════════════════════════════════════════
// CE QU'UN ENVOI EN LOT ENVOIE
// ═══════════════════════════════════════════════════════════════════════════
// Ajouté le 20 août 2026, quand l'onglet Images a gagné « Envoyer les N à
// synchroniser » — 225 marques ou 36 catégories d'un geste. Cette fonction
// décide de ce qui est ÉCRIT chez l'hébergeur : elle ne peut pas rester sans
// gardien.

describe('aSynchroniser', () => {
	const ligne = (
		nom: string,
		state: 'absent' | 'modified' | 'synced',
		checksum: string | undefined,
		online?: boolean,
	) => ({ nom, state, checksum, online })

	it('retient ce qui est absent ou modifié, et mesuré', () => {
		const retenues = aSynchroniser([
			ligne('jamais envoyée', 'absent', 'e1'),
			ligne('changée', 'modified', 'e2'),
		])
		expect(retenues.map((r) => r.nom)).toEqual(['jamais envoyée', 'changée'])
	})

	it('écarte ce qui est déjà à jour — un lot ne renvoie pas pour rien', () => {
		// L'envoi reste idempotent et rejouable à la pièce ; c'est le LOT qui
		// ne repousse pas 36,3 Mio de catégories pour aboutir au même état.
		expect(aSynchroniser([ligne('à jour', 'synced', 'e1')])).toEqual([])
	})

	it('écarte ce qui n’a PAS d’empreinte mesurée, même marqué « modifié »', () => {
		// La règle, et non l'économie : on n'envoie jamais une empreinte qu'on
		// n'a pas calculée — elle est stockée telle quelle côté SQL et sert
		// ensuite de référence.
		expect(
			aSynchroniser([ligne('non mesurée', 'modified', undefined)]),
		).toEqual([])
	})

	it('écarte le non mesuré que syncStateOf a déclaré « à jour »', () => {
		// Le piège : `syncStateOf` rend `synced` quand l'empreinte n'est pas
		// calculée et que l'entité est connue de l'inventaire — l'écran ne
		// prétend pas savoir ce qu'il n'a pas mesuré. Filtrer sur le seul état
		// laisserait passer ces fiches-là.
		const etat = syncStateOf('nedb-1', undefined, { 'nedb-1': 'e-distant' })
		expect(etat).toBe('synced')
		expect(aSynchroniser([ligne('jamais lue', etat, undefined)])).toEqual([])
	})

	it('écarte ce que la base SQL du site ne connaît PAS', () => {
		// Mesuré le 20 août 2026 sur un lot réel : 5 catégories parties, 4
		// refusées en 409 « Entité inconnue de la base du site », et le lot
		// arrêté sur trois échecs de suite. Les images sont un ÉTAT de la ligne,
		// pas une entité à part — sans la ligne, l'envoi ne PEUT pas aboutir.
		expect(
			aSynchroniser([ligne('pas exportée', 'absent', 'e1', false)]),
		).toEqual([])
	})

	it('laisse passer quand on IGNORE si l’entité est en ligne', () => {
		// `undefined` = inventaire d'entités pas lu. Ne pas savoir n'est pas
		// savoir que non : on laisse le serveur trancher plutôt que de retenir
		// à tort tout un lot.
		const retenues = aSynchroniser([ligne('inconnue', 'absent', 'e1')])
		expect(retenues.map((r) => r.nom)).toEqual(['inconnue'])
	})

	it('ne modifie pas la liste reçue', () => {
		const source = [ligne('a', 'absent', 'e1'), ligne('b', 'synced', 'e2')]
		aSynchroniser(source)
		expect(source).toHaveLength(2)
	})
})
