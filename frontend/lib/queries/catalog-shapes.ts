// frontend/lib/queries/catalog-shapes.ts
// ═══════════════════════════════════════════════════════════════════════════
// LA FORME RÉELLE DES QUATRE COLLECTIONS DU CATALOGUE
// ═══════════════════════════════════════════════════════════════════════════
// Déclarée à la main, et c'est un choix, pas un pis-aller.
//
// `frontend/lib/pocketbase-types.ts` n'est PAS une sortie de générateur : il a
// été retouché à la main, `pnpm typegen` reste interdit (CLAUDE.md), et il
// décrit aujourd'hui trois collections qui n'existent plus. Mesuré le 13 août
// 2026 dans `_collections` de `%LOCALAPPDATA%\PocketReact\pb_data\data.db` :
//
//   SuppliersRecord  déclare active, address, contact, email, notes, phone
//                    → AUCUN des six n'existe en base
//   BrandsRecord     déclare logo, website
//                    → la base a image, wp_image_url, slug
//   CategoriesRecord déclare color, icon, order
//                    → la base a slug, description, image, is_featured
//
// Et aucun des trois ne déclare `legacy_id`, qui est **la clé** de l'export vers
// le site (§1 de PocketSite-docs/12-contrat-catalogue.md). Le typage ne
// protégeait donc pas : il couvrait l'erreur.
//
// ⚠️ NE PAS « CORRIGER » `pocketbase-types.ts` À LA PLACE. Ses types y sont
// aussi utilisés pour porter des données **AppPos** (`apppos-transformers.ts`,
// `apppos-hooks.ts`), qui ont, elles, ces champs-là. Les redresser casserait la
// chaîne AppPos — c'est-à-dire la caisse. Ce fichier-ci décrit PocketBase, et
// seulement PocketBase.
//
// Source de vérité du schéma : `backend/migrations/catalog_v2.go`.
// Ces types sont **le contrat de lecture de la couche d'accès d'AppStock**
// (docs/DECISIONS.md, 2026-08-13 — source explicite par entité).
// ═══════════════════════════════════════════════════════════════════════════

/** Champs que PocketBase pose sur tout enregistrement, et dont
 *  `pb.files.getUrl` a besoin pour résoudre un fichier. */
export type PocketBaseRecord = {
	id: string
	collectionId: string
	collectionName: string
	created?: string
	updated?: string
}

/** Porté par les quatre collections : l'identifiant NeDB d'origine.
 *
 *  **Il survit au rechargement par purge, l'identifiant PocketBase non.** Toute
 *  correspondance avec l'extérieur — l'export vers le site en premier lieu — se
 *  fait sur lui. */
type LegacyKeyed = {
	legacy_id: string
	/** Relation vers `companies`. Une seule entreprise en base au 13 août 2026
	 *  (`468mpen5lhg6u0v`), et les 793 lignes des trois collections annexes lui
	 *  sont rattachées : filtrer dessus est aujourd'hui sans effet, ce n'est pas
	 *  une garantie pour demain. */
	company?: string
}

// ---------------------------------------------------------------------------
// MARQUES
// ---------------------------------------------------------------------------

export type CatalogBrandShape = PocketBaseRecord &
	LegacyKeyed & {
		name: string
		slug?: string
		description?: string
		/** Champ fichier PocketBase. **Pas une URL** : passer par
		 *  `pb.files.getUrl`. 225 marques sur 287 en portent un. */
		image?: string
		/** URL de l'image telle qu'elle était sur WordPress. Conservée pour la
		 *  reprise des images, qui est une session à part. */
		wp_image_url?: string
	}

// ---------------------------------------------------------------------------
// CATÉGORIES
// ---------------------------------------------------------------------------

export type CatalogCategoryShape = PocketBaseRecord &
	LegacyKeyed & {
		name: string
		slug?: string
		description?: string
		image?: string
		wp_image_url?: string
		is_featured?: boolean
		/** Relation vers `categories`. **Chaîne vide** à la racine, jamais
		 *  `undefined` côté PocketBase. */
		parent?: string
	}

// ---------------------------------------------------------------------------
// FOURNISSEURS
// ---------------------------------------------------------------------------
// La collection la plus éloignée de ce que le front croit savoir : le
// formulaire en service décrit encore le schéma v1 (§6bis.2 du rituel).

export type CatalogSupplierShape = PocketBaseRecord &
	LegacyKeyed & {
		name: string
		supplier_code?: string
		siren?: string
		contact_name?: string
		contact_email?: string
		contact_phone?: string
		contact_address?: string
		/** JSON libre — coordonnées bancaires. Forme non contrainte au schéma :
		 *  la lire défensivement. */
		banking?: unknown
		/** JSON libre — conditions de règlement. Même remarque. */
		payment_terms?: unknown
		/** Relation multiple vers `brands`. */
		brands?: string[]
	}

// ---------------------------------------------------------------------------
// PRODUITS
// ---------------------------------------------------------------------------
// Volontairement **non redéclaré ici**. La forme lue par le site vit dans
// `site-catalog.ts` (`CatalogProduct`), restreinte aux champs que l'export
// demande, et elle est en production. En ajouter une seconde version avant que
// la couche d'accès n'existe créerait deux vérités concurrentes pour la même
// collection — précisément ce que cette mission cherche à supprimer.
//
// Les produits rejoindront ce fichier quand la couche du §4 sera écrite, et
// `site-catalog.ts` dérivera de lui plutôt que l'inverse.
