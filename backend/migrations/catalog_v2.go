// backend/migrations/catalog_v2.go
// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION — SCHÉMA CIBLE DU CATALOGUE  (ticket T1)
// ═══════════════════════════════════════════════════════════════════════════
// Recrée products / categories / brands / suppliers au modèle arrêté le
// 10 août 2026, et crée external_refs.
//
// Le modèle est décrit champ par champ dans
// frontend/modules/site/PocketSite-docs/09-modele-cible.md ; les décisions sont
// consignées dans docs/DECISIONS.md, bloc « Le modèle cible du catalogue
// PocketBase est arrêté ». Le plan d'exécution est le 10-plan-migration.md.
//
// ── Pourquoi recréer plutôt qu'altérer ─────────────────────────────────────
//
// Les quatre collections de catalog.go sont un premier jet jamais utilisé :
// vides, jamais alimentées, le catalogue étant lu depuis AppServe. Vérifié le
// 10 août 2026 sur %LOCALAPPDATA%\PocketReact\pb_data : 0 enregistrement sur
// les quatre. Les recréer ne détruit donc rien, et rend la migration rejouable
// — ce qu'une suite de migrations d'altération ne permet pas.
//
// « Recréer » signifie CES QUATRE COLLECTIONS, et elles seules. La base en
// porte 23, dont la caisse, les factures, l'inventaire et le menu du site.
//
// ── Deux gardes, et elles sont le cœur de ce fichier ───────────────────────
//
//  1. CONVERGENCE, pas sortie sur le nom. catalog.go sort si la collection
//     « existe », ce qui fait accepter sans bruit un schéma périmé (§9.5 du
//     09). Ici on teste la FORME : la présence de `legacy_id` sur `products`
//     signe le schéma v2. Une collection homonyme à l'ancien schéma est donc
//     détectée et reprise, pas acceptée.
//
//  2. REFUS SI NON VIDE. La recréation n'est légitime que parce que les
//     collections sont vides. Le jour où elles ne le sont plus, cette
//     migration doit s'arrêter et laisser la place à de vraies altérations.
//     Elle ne détruira jamais de données en silence.
//
// ── L'auto-relation, et le défaut qu'on répare ─────────────────────────────
//
// catalog.go:139-147 crée `categories.parent` avec CollectionId vide, sur la
// foi d'un commentaire « fixé après création » — correctif jamais écrit.
// Constaté sur la base réelle : c'est la seule relation cassée du catalogue.
// Le motif correct est celui de site_menu.go:146-154 — enregistrer d'abord,
// ajouter le champ ensuite avec l'ID désormais connu, réenregistrer.
// ═══════════════════════════════════════════════════════════════════════════

package migrations

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// authRule : même règle que le reste du catalogue.
//
// ATTENTION, dette connue et consignée : cette règle n'isole PAS par
// entreprise, alors que les utilisateurs en portent une (AddCompanyToUsers).
// Sans effet tant qu'il n'y a qu'une entreprise ; faille d'isolation dès la
// deuxième. Hors périmètre de ce ticket, mais à ne pas oublier.
const authRule = "@request.auth.id != ''"

// catalogV2Collections, dans l'ordre de SUPPRESSION — l'inverse des
// dépendances. external_refs pointe vers les trois entités ; products pointe
// vers brands, categories et suppliers ; suppliers pointe vers brands.
var catalogV2DropOrder = []string{
	"external_refs",
	"products",
	"suppliers",
	"categories",
	"brands",
}

// MigrateCatalogV2 installe le schéma cible du catalogue.
func MigrateCatalogV2(app *pocketbase.PocketBase) error {
	// ── Garde 1 : déjà en v2 ? ────────────────────────────────────────────
	// On teste la forme, pas le nom. `legacy_id` n'existe que dans le modèle
	// cible : sa présence signe le schéma v2.
	if products, err := app.Dao().FindCollectionByNameOrId("products"); err == nil {
		if products.Schema.GetFieldByName("legacy_id") != nil {
			log.Println("📦 Catalogue déjà au schéma cible (v2)")
			return nil
		}
	}

	// ── Garde 2 : refus si une collection porte des données ───────────────
	// La recréation n'est acquise que sur des collections vides. Cette
	// migration ne détruit jamais de données ; elle s'arrête.
	for _, name := range catalogV2DropOrder {
		if _, err := app.Dao().FindCollectionByNameOrId(name); err != nil {
			continue // absente : rien à protéger
		}
		count, err := countRecords(app, name)
		if err != nil {
			return fmt.Errorf("catalog v2: comptage de %q: %w", name, err)
		}
		if count > 0 {
			return fmt.Errorf(
				"catalog v2: la collection %q contient %d enregistrement(s) — "+
					"la recréation est refusée. Le modèle cible suppose des collections "+
					"vides ; passer par des migrations d'altération",
				name, count,
			)
		}
	}

	log.Println("📦 Installation du schéma cible du catalogue (v2)...")

	companies, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return fmt.Errorf("catalog v2: collection 'companies' introuvable: %w", err)
	}

	// ── Suppression, dans l'ordre inverse des dépendances ─────────────────
	for _, name := range catalogV2DropOrder {
		col, err := app.Dao().FindCollectionByNameOrId(name)
		if err != nil {
			continue
		}
		if err := app.Dao().DeleteCollection(col); err != nil {
			return fmt.Errorf("catalog v2: suppression de %q: %w", name, err)
		}
		log.Printf("🗑️  Collection '%s' supprimée (schéma périmé)", name)
	}

	// ── Recréation, dans l'ordre des dépendances ──────────────────────────
	brands, err := createBrandsV2(app, companies.Id)
	if err != nil {
		return err
	}
	categories, err := createCategoriesV2(app, companies.Id)
	if err != nil {
		return err
	}
	suppliers, err := createSuppliersV2(app, companies.Id, brands.Id)
	if err != nil {
		return err
	}
	products, err := createProductsV2(app, companies.Id, brands.Id, categories.Id, suppliers.Id)
	if err != nil {
		return err
	}
	if _, err := createExternalRefsV2(app, products.Id, categories.Id, brands.Id); err != nil {
		return err
	}

	log.Println("✅ Schéma cible du catalogue installé")
	return nil
}

// countRecords compte sans charger les enregistrements.
func countRecords(app *pocketbase.PocketBase, collectionName string) (int, error) {
	var count int
	err := app.Dao().DB().
		Select("count(*)").
		From(collectionName).
		Row(&count)
	return count, err
}

// legacyIDField — le pont vers NeDB, et il a une date de péremption.
//
// Les _id NeDB ne sont pas réutilisables comme identifiants PocketBase : ils
// vont de 8 à 30 caractères, avec des préfixes cat_* (audit §4bis.5). On laisse
// donc PocketBase générer les siens et on conserve la source ici, ce qui rend
// la migration rejouable et le contrôle post-chargement possible.
//
// ⚠ Champ de la case « à garder temporairement » du §4 ter du rituel : il se
// SUPPRIME quand AppServe est abandonné et qu'aucune réconciliation ne s'y
// appuie plus. Sans cette échéance, il devient un woo_id de plus.
func legacyIDField() *schema.SchemaField {
	return &schema.SchemaField{
		Name:    "legacy_id",
		Type:    schema.FieldTypeText,
		Options: &schema.TextOptions{Max: types.Pointer(50)},
	}
}

func companyField(companiesID string) *schema.SchemaField {
	return &schema.SchemaField{
		Name:     "company",
		Type:     schema.FieldTypeRelation,
		Required: true,
		Options: &schema.RelationOptions{
			CollectionId:  companiesID,
			MaxSelect:     types.Pointer(1),
			CascadeDelete: false,
		},
	}
}

func baseCollection(name string) *models.Collection {
	return &models.Collection{
		Name:       name,
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer(authRule),
		ViewRule:   types.Pointer(authRule),
		CreateRule: types.Pointer(authRule),
		UpdateRule: types.Pointer(authRule),
		DeleteRule: types.Pointer(authRule),
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// BRANDS
// ═══════════════════════════════════════════════════════════════════════════
//
// Fortement allégée. Supprimés : `logo` et `website` — les marques n'ont AUCUNE
// image (0 sur 224, mesuré) ; `products_count`, faux sur 21 marques et
// calculable ; `suppliersRefs`, cache divergent. Aucun n'a de lecteur dans
// frontend/ hors déclaration de type.
//
// La relation vers les fournisseurs vit sur suppliers.brands, pas ici : c'est
// de ce côté qu'elle est saisie (SupplierDialog.tsx:38).

func createBrandsV2(app *pocketbase.PocketBase, companiesID string) (*models.Collection, error) {
	col := baseCollection("brands")
	col.Schema = schema.NewSchema(
		&schema.SchemaField{
			Name:        "name",
			Type:        schema.FieldTypeText,
			Required:    true,
			Presentable: true,
			Options:     &schema.TextOptions{Max: types.Pointer(255)},
		},
		// Fabriqué à la migration : NeDB ne les renseigne quasiment pas.
		&schema.SchemaField{
			Name:    "slug",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(255)},
		},
		&schema.SchemaField{
			Name:    "description",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(5000)},
		},
		legacyIDField(),
		companyField(companiesID),
	)
	// Unicité PAR ENTREPRISE, jamais globale : le catalogue est
	// multi-entreprise, et deux magasins ont légitimement les mêmes slugs.
	// Index partiel : PocketBase stocke '' et non NULL, donc sans le WHERE
	// deux slugs vides entreraient en collision.
	col.Indexes = types.JsonArray[string]{
		"CREATE UNIQUE INDEX idx_brands_company_slug ON brands (company, slug) WHERE slug != ''",
		"CREATE UNIQUE INDEX idx_brands_legacy_id ON brands (legacy_id) WHERE legacy_id != ''",
	}
	if err := app.Dao().SaveCollection(col); err != nil {
		return nil, fmt.Errorf("catalog v2: création de 'brands': %w", err)
	}
	log.Println("✅ Collection 'brands' créée (v2)")
	return col, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════
//
// Supprimés : `level`, dérivable de `parent` et confirmé mort — l'arbre est
// construit sur `parent` seul (apppos-hooks.ts:334-358), le `level` des
// composants est une profondeur de rendu ; `gallery_images` (0 %) ; `color`,
// `icon`, `order`, sans usage ; et tous les champs WooCommerce.
//
// AUCUN CHAMP DE PUBLICATION, et c'est délibéré. La mise en ligne d'une
// catégorie est DÉRIVÉE : « en ligne si elle contient un produit published,
// descendants compris ; ses ancêtres le sont par voie de conséquence ». Règle
// vérifiée exacte sur la base dev, 0 écart. Un champ status introduirait
// 219 valeurs dont personne n'est responsable.

func createCategoriesV2(app *pocketbase.PocketBase, companiesID string) (*models.Collection, error) {
	col := baseCollection("categories")
	col.Schema = schema.NewSchema(
		&schema.SchemaField{
			Name:        "name",
			Type:        schema.FieldTypeText,
			Required:    true,
			Presentable: true,
			Options:     &schema.TextOptions{Max: types.Pointer(255)},
		},
		// Fabriqué AVEC LE PARENT : « Accessoires » existe deux fois dans
		// l'arbre, un slug bâti sur le seul nom entrerait en collision.
		&schema.SchemaField{
			Name:    "slug",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(255)},
		},
		&schema.SchemaField{
			Name:    "description",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(5000)},
		},
		// Texte, pas fichier : les URL WordPress sont conservées telles quelles
		// (décision du 10 août). Un champ fichier PocketBase n'accepte pas une
		// URL — c'est le conflit constaté au §9.2b du 09.
		&schema.SchemaField{
			Name:    "image",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(2000)},
		},
		&schema.SchemaField{
			Name: "is_featured",
			Type: schema.FieldTypeBool,
		},
		legacyIDField(),
		companyField(companiesID),
	)
	col.Indexes = types.JsonArray[string]{
		"CREATE UNIQUE INDEX idx_categories_company_slug ON categories (company, slug) WHERE slug != ''",
		"CREATE UNIQUE INDEX idx_categories_legacy_id ON categories (legacy_id) WHERE legacy_id != ''",
	}
	if err := app.Dao().SaveCollection(col); err != nil {
		return nil, fmt.Errorf("catalog v2: création de 'categories': %w", err)
	}

	// ── L'auto-relation, en deux temps ────────────────────────────────────
	// C'est ici que catalog.go:143 échouait : il posait CollectionId: "" en
	// annonçant un correctif qui n'a jamais été écrit. L'ID de la collection
	// n'existe qu'après le premier SaveCollection ; on l'ajoute donc ensuite.
	//
	// CascadeDelete à false, délibérément : supprimer une catégorie ne doit pas
	// emporter sa descendance en silence. Le cas se traite à la main.
	col.Schema.AddField(&schema.SchemaField{
		Name: "parent",
		Type: schema.FieldTypeRelation,
		Options: &schema.RelationOptions{
			CollectionId:  col.Id,
			MaxSelect:     types.Pointer(1),
			CascadeDelete: false,
		},
	})
	if err := app.Dao().SaveCollection(col); err != nil {
		return nil, fmt.Errorf("catalog v2: auto-relation 'categories.parent': %w", err)
	}

	log.Println("✅ Collection 'categories' créée (v2), parent auto-relié")
	return col, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════════════════════════════════
//
// Le contact est À PLAT : le code l'aplatit déjà (apppos-transformers.ts:207)
// et le formulaire le consomme ainsi (SupplierDialog.tsx:34-37). Un objet
// imbriqué serait une régression par rapport à l'usage constaté.
//
// `brands` est conservée : la relation marque ↔ fournisseur est RÉELLE et
// SAISIE, au formulaire fournisseur (SupplierDialog.tsx:247-269). Elle vit de
// ce côté, pas sur la marque — le schéma d'origine avait déjà raison.
//
// Supprimés : `customer_code` (0 %), `brandsRefs` et `products_count` (caches
// sans lecteur), `notes` et `active` (sans usage).

func createSuppliersV2(app *pocketbase.PocketBase, companiesID, brandsID string) (*models.Collection, error) {
	col := baseCollection("suppliers")
	col.Schema = schema.NewSchema(
		&schema.SchemaField{
			Name:        "name",
			Type:        schema.FieldTypeText,
			Required:    true,
			Presentable: true,
			Options:     &schema.TextOptions{Max: types.Pointer(255)},
		},
		&schema.SchemaField{
			Name:    "supplier_code",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(50)},
		},
		// Ajouté par le modèle cible — seul champ créé de toutes pièces.
		// Même nom et même contrainte que sur `companies` (CompanyDialog.tsx:44,
		// validé sur ^\d{9}$) : un fournisseur est une personne morale.
		&schema.SchemaField{
			Name: "siren",
			Type: schema.FieldTypeText,
			Options: &schema.TextOptions{
				Max:     types.Pointer(9),
				Pattern: `^\d{9}$`,
			},
		},
		&schema.SchemaField{
			Name:    "contact_name",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(255)},
		},
		&schema.SchemaField{
			Name: "contact_email",
			Type: schema.FieldTypeEmail,
		},
		&schema.SchemaField{
			Name:    "contact_phone",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(30)},
		},
		&schema.SchemaField{
			Name:    "contact_address",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(500)},
		},
		// En JSON et non à plat, contrairement au contact : aucun formulaire ne
		// les édite aujourd'hui, donc aucune forme n'est imposée par l'usage.
		// Conservés pour la gestion d'achat fournisseur à construire — décision
		// assumée et datée du 10 août 2026, pas une reconduction par habitude.
		&schema.SchemaField{
			Name: "banking",
			Type: schema.FieldTypeJson,
		},
		&schema.SchemaField{
			Name: "payment_terms",
			Type: schema.FieldTypeJson,
		},
		&schema.SchemaField{
			Name: "brands",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  brandsID,
				MaxSelect:     nil, // multiple
				CascadeDelete: false,
			},
		},
		legacyIDField(),
		companyField(companiesID),
	)
	col.Indexes = types.JsonArray[string]{
		"CREATE UNIQUE INDEX idx_suppliers_legacy_id ON suppliers (legacy_id) WHERE legacy_id != ''",
	}
	if err := app.Dao().SaveCollection(col); err != nil {
		return nil, fmt.Errorf("catalog v2: création de 'suppliers': %w", err)
	}
	log.Println("✅ Collection 'suppliers' créée (v2)")
	return col, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════
//
// De 52 champs à une vingtaine. Ce qui disparaît, et pourquoi :
//
//   - price_ht          CALCULÉ depuis price_ttc et tax_rate. Deux prix stockés
//     dont l'un dérive de l'autre finissent par diverger.
//   - regular_price, sale_price, promo_*   fiction : 4 et 5 produits sur 2306.
//   - margin_rate, margin_amount           calculés sur la base HT.
//   - stock_status      absent sur 1509 produits, miroir WooCommerce, zéro
//     lecteur dans frontend/. Se dérive de stock et manage_stock.
//   - total_sold, sales_count, revenue_total, last_sold_at
//     agrégats du domaine caisse, AUCUN lecteur nulle part.
//   - meta_data         l'enveloppe disparaît, barcode en sort promu.
//   - category_info, category_id, category_ref, categories_refs, brand_ref,
//     supplier_ref      caches et représentations concurrentes.
//   - woo_id, website_url, last_sync, pending_sync   → external_refs.
//   - active, stock_max, unit, weight, specifications, woo_status, sync_errors,
//     description_short, dateSoumission, sync_fields, imported_*  sans usage.
//
// PAS de primary_category : un produit a un ENSEMBLE de catégories, sans
// hiérarchie entre elles. La catégorie principale n'est ni écrite, ni affichée,
// ni filtrée (ProductDialog.tsx:160, useStockModule.ts:129).

func createProductsV2(app *pocketbase.PocketBase, companiesID, brandsID, categoriesID, suppliersID string) (*models.Collection, error) {
	col := baseCollection("products")
	col.Schema = schema.NewSchema(
		// ── Identité ──────────────────────────────────────────────────────
		&schema.SchemaField{
			Name:        "name",
			Type:        schema.FieldTypeText,
			Required:    true,
			Presentable: true,
			Options:     &schema.TextOptions{Max: types.Pointer(255)},
		},
		// Consommée par la caisse ET le stock, et pourtant absente du schéma
		// d'origine — au point que le transformer l'ajoutait hors schéma
		// (apppos-transformers.ts:54-56). Les collections, en l'état, n'auraient
		// pas pu servir le terminal.
		&schema.SchemaField{
			Name:    "designation",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(255)},
		},
		&schema.SchemaField{
			Name:    "sku",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(50)},
		},
		// Extrait de meta_data, qui ne contenait que cette clé sur 1870
		// produits. Donnée pleinement métier : indispensable à une caisse.
		&schema.SchemaField{
			Name:    "barcode",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(50)},
		},
		&schema.SchemaField{
			Name:    "slug",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(255)},
		},
		&schema.SchemaField{
			Name:    "description",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(20000)},
		},
		// `service` est un vrai cas métier (9 produits) : sans stock, il n'a
		// rien à voir avec un article. Aucune variante n'existe dans les
		// données — la question est reportée, le modèle ne l'interdit pas.
		&schema.SchemaField{
			Name:     "type",
			Type:     schema.FieldTypeSelect,
			Required: true,
			Options: &schema.SelectOptions{
				MaxSelect: 1,
				Values:    []string{"simple", "service"},
			},
		},
		// Porte l'intention de publication, et correctement. Remplace le
		// booléen `active`, qui aplatissait trois états en deux et ne disait pas
		// ce qu'il représentait : « actif » et « publié sur le site » ne sont
		// pas la même chose.
		&schema.SchemaField{
			Name:     "status",
			Type:     schema.FieldTypeSelect,
			Required: true,
			Options: &schema.SelectOptions{
				MaxSelect: 1,
				Values:    []string{"draft", "published"},
			},
		},

		// ── Prix ──────────────────────────────────────────────────────────
		// L'unité est DANS LE NOM, délibérément. Mesuré sur 648 produits :
		// l'hypothèse « price TTC, marge sur base HT » est cohérente sur 636,
		// l'hypothèse HT sur 0. Un champ de prix sans unité dans son nom est un
		// piège qui se repaie à chaque lecture.
		&schema.SchemaField{
			Name:    "price_ttc",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
		},
		&schema.SchemaField{
			Name:    "purchase_price_ht",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
		},
		// Nombre et non énumération : une énumération figerait le schéma sur les
		// taux en vigueur, et un changement de TVA imposerait une migration de
		// collection. Les valeurs se contrôlent à l'écriture.
		&schema.SchemaField{
			Name: "tax_rate",
			Type: schema.FieldTypeNumber,
			Options: &schema.NumberOptions{
				Min: types.Pointer(0.0),
				Max: types.Pointer(100.0),
			},
		},

		// ── Stock ─────────────────────────────────────────────────────────
		&schema.SchemaField{
			Name:    "stock",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{},
		},
		// Conservés pour un usage À CONSTRUIRE, pas pour un usage existant :
		// aucun des deux n'a de lecteur aujourd'hui. min_stock porte le seuil
		// d'alerte de réapprovisionnement, manage_stock le fait qu'un article
		// suive un stock — ce que le cas `service` rend nécessaire.
		&schema.SchemaField{
			Name: "manage_stock",
			Type: schema.FieldTypeBool,
		},
		&schema.SchemaField{
			Name:    "min_stock",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
		},

		// ── Image ─────────────────────────────────────────────────────────
		// Texte et non fichier. Les URL WordPress sont conservées et ne bougent
		// pas (audit §1.3) ; un champ fichier PocketBase attend un téléversement
		// et n'accepte pas une URL. Le nom reste `images` pour ne pas rompre le
		// contrat que le front consomme déjà (ProductsRecord.images).
		&schema.SchemaField{
			Name:    "images",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(2000)},
		},

		// ── Relations ─────────────────────────────────────────────────────
		&schema.SchemaField{
			Name: "brand",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  brandsID,
				MaxSelect:     types.Pointer(1),
				CascadeDelete: false,
			},
		},
		&schema.SchemaField{
			Name: "supplier",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  suppliersID,
				MaxSelect:     types.Pointer(1),
				CascadeDelete: false,
			},
		},
		&schema.SchemaField{
			Name: "categories",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  categoriesID,
				MaxSelect:     nil, // multiple
				CascadeDelete: false,
			},
		},

		legacyIDField(),
		companyField(companiesID),
	)
	// Index partiels, et par entreprise. Le WHERE n'est pas un détail :
	// PocketBase stocke '' et non NULL, et 7 produits n'ont pas de SKU une fois
	// le remplissage '-----' normalisé. Sans le WHERE, ces 7 entreraient en
	// collision entre eux au chargement.
	col.Indexes = types.JsonArray[string]{
		"CREATE UNIQUE INDEX idx_products_company_sku ON products (company, sku) WHERE sku != ''",
		"CREATE UNIQUE INDEX idx_products_company_slug ON products (company, slug) WHERE slug != ''",
		"CREATE UNIQUE INDEX idx_products_legacy_id ON products (legacy_id) WHERE legacy_id != ''",
		"CREATE INDEX idx_products_barcode ON products (barcode)",
	}
	if err := app.Dao().SaveCollection(col); err != nil {
		return nil, fmt.Errorf("catalog v2: création de 'products': %w", err)
	}
	log.Println("✅ Collection 'products' créée (v2)")
	return col, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTERNAL_REFS
// ═══════════════════════════════════════════════════════════════════════════
//
// La proposition principale du modèle cible : le catalogue métier ne contient
// plus RIEN de WooCommerce. woo_id, website_url, last_sync et pending_sync
// décrivaient la relation entre une entité et une plateforme, pas l'entité.
//
// Ce que ça règle, et ce sont des défauts constatés :
//  1. une deuxième plateforme n'ajoute aucune colonne au catalogue ;
//  2. l'échec devient une donnée — aujourd'hui il ne va qu'à la console, et
//     pending_sync n'est jamais remis à true après un échec ;
//  3. « jamais publié » devient représentable : c'est l'absence de ligne.
//     pending_sync ne savait dire que « publié et modifié depuis ».
//
// ── Pourquoi trois relations et non entity_type + entity_id ───────────────
//
// PocketBase n'a pas de relation polymorphe : un champ relation cible UNE
// collection. Le couple type+id imposerait un champ texte non contraint, donc
// la perte de l'intégrité référentielle et de la cascade — précisément ce
// qu'on reproche à NeDB.
//
// ⚠ RÈGLE D'INTÉGRITÉ : une ligne renseigne UN SEUL des trois champs.
// Elle n'est PAS portée par le schéma. Les règles d'API PocketBase ne
// s'appliquent qu'aux écritures passant par l'API, pas au DAO Go — donc elles
// ne protégeraient pas le chargeur, qui est justement le seul écrivain prévu.
// La règle est donc à tenir par le chargeur (ticket T5) et à vérifier par les
// contrôles de conformité (T6). C'est une limite assumée, pas un oubli.

func createExternalRefsV2(app *pocketbase.PocketBase, productsID, categoriesID, brandsID string) (*models.Collection, error) {
	col := baseCollection("external_refs")

	optionalRelation := func(name, target string) *schema.SchemaField {
		return &schema.SchemaField{
			Name: name,
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId: target,
				MaxSelect:    types.Pointer(1),
				// La disparition de l'entité métier emporte sa correspondance :
				// une référence externe sans entité n'a aucun sens.
				CascadeDelete: true,
			},
		}
	}

	col.Schema = schema.NewSchema(
		optionalRelation("product", productsID),
		optionalRelation("category", categoriesID),
		optionalRelation("brand", brandsID),
		&schema.SchemaField{
			Name:     "platform",
			Type:     schema.FieldTypeSelect,
			Required: true,
			Options: &schema.SelectOptions{
				MaxSelect: 1,
				Values:    []string{"woocommerce"},
			},
		},
		// ex-woo_id. Texte et non nombre : la prochaine plateforme n'utilisera
		// pas forcément des entiers.
		&schema.SchemaField{
			Name:        "external_id",
			Type:        schema.FieldTypeText,
			Required:    true,
			Presentable: true,
			Options:     &schema.TextOptions{Max: types.Pointer(255)},
		},
		&schema.SchemaField{
			Name:    "external_url",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(2000)},
		},
		// ex-last_sync. Renommé : il date la publication, il ne prouve aucune
		// synchronisation — le mot « sync » a menti pendant tout l'audit.
		&schema.SchemaField{
			Name: "published_at",
			Type: schema.FieldTypeDate,
		},
		&schema.SchemaField{
			Name:     "state",
			Type:     schema.FieldTypeSelect,
			Required: true,
			Options: &schema.SelectOptions{
				MaxSelect: 1,
				Values:    []string{"synced", "pending", "error"},
			},
		},
		&schema.SchemaField{
			Name:    "error",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(2000)},
		},
	)
	// Pas d'unicité sur (platform, external_id) : un produit et une catégorie
	// WooCommerce peuvent porter le même identifiant, ils vivent dans deux
	// espaces distincts. L'unicité est par entité et par plateforme.
	col.Indexes = types.JsonArray[string]{
		"CREATE UNIQUE INDEX idx_extrefs_product ON external_refs (platform, product) WHERE product != ''",
		"CREATE UNIQUE INDEX idx_extrefs_category ON external_refs (platform, category) WHERE category != ''",
		"CREATE UNIQUE INDEX idx_extrefs_brand ON external_refs (platform, brand) WHERE brand != ''",
	}
	if err := app.Dao().SaveCollection(col); err != nil {
		return nil, fmt.Errorf("catalog v2: création de 'external_refs': %w", err)
	}
	log.Println("✅ Collection 'external_refs' créée")
	return col, nil
}
