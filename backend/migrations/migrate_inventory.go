package migrations

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
)

// ─────────────────────────────────────────────────────────────────────────────
// ensureInventorySessionsCollection
// Collection : inventory_sessions
// Une session = un inventaire physique avec statut, périmètre et opérateur
// ✅ Idempotent — si la collection existe déjà, les données sont préservées.
// ─────────────────────────────────────────────────────────────────────────────
func ensureInventorySessionsCollection(app *pocketbase.PocketBase) error {
	const collectionName = "inventory_sessions"

	// Si la collection existe déjà → rien à faire, on préserve les données
	existing, _ := app.Dao().FindCollectionByNameOrId(collectionName)
	if existing != nil {
		log.Printf("✅ Collection %s déjà présente, conservée telle quelle", collectionName)
		return nil
	}

	log.Printf("📦 Création de la collection %s...", collectionName)

	collection := &models.Collection{
		Name: collectionName,
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			// ── Statut de la session ─────────────────────────────────────────
			&schema.SchemaField{
				Name:     "status",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"draft", "in_progress", "completed", "cancelled"},
				},
			},
			// ── Dates ────────────────────────────────────────────────────────
			&schema.SchemaField{
				Name:     "started_at",
				Type:     schema.FieldTypeDate,
				Required: true,
			},
			&schema.SchemaField{
				Name:     "completed_at",
				Type:     schema.FieldTypeDate,
				Required: false,
			},
			// ── Opérateur ────────────────────────────────────────────────────
			&schema.SchemaField{
				Name:     "operator",
				Type:     schema.FieldTypeText,
				Required: true,
			},
			// ── Périmètre ────────────────────────────────────────────────────
			&schema.SchemaField{
				Name:     "scope",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"all", "selection"},
				},
			},
			// IDs catégories AppPOS sélectionnées (si scope = "selection")
			&schema.SchemaField{
				Name:     "scope_category_ids",
				Type:     schema.FieldTypeJson,
				Required: false,
				Options:  &schema.JsonOptions{MaxSize: 5242880},
			},
			// IDs catégories dont le comptage est validé (verrouillées)
			&schema.SchemaField{
				Name:     "validated_category_ids",
				Type:     schema.FieldTypeJson,
				Required: false,
				Options:  &schema.JsonOptions{MaxSize: 5242880},
			},
			// Timestamp du gel des stocks théoriques (snapshot AppPOS)
			&schema.SchemaField{
				Name:     "apppos_snapshot_at",
				Type:     schema.FieldTypeDate,
				Required: true,
			},
			// Notes libres de l'opérateur
			&schema.SchemaField{
				Name:     "notes",
				Type:     schema.FieldTypeText,
				Required: false,
			},
			// ── Stats dénormalisées (écrites à la clôture) ───────────────────
			// Permettent d'afficher l'historique sans requêter inventory_entries
			&schema.SchemaField{
				Name:     "stats_total_products",
				Type:     schema.FieldTypeNumber,
				Required: false,
				Options: &schema.NumberOptions{
					Min: func() *float64 { v := float64(0); return &v }(),
				},
			},
			&schema.SchemaField{
				Name:     "stats_counted_products",
				Type:     schema.FieldTypeNumber,
				Required: false,
				Options: &schema.NumberOptions{
					Min: func() *float64 { v := float64(0); return &v }(),
				},
			},
			// Nombre de produits avec écart ≠ 0 après comptage
			&schema.SchemaField{
				Name:     "stats_total_gaps",
				Type:     schema.FieldTypeNumber,
				Required: false,
				Options: &schema.NumberOptions{
					Min: func() *float64 { v := float64(0); return &v }(),
				},
			},
			// Snapshot des noms de catégories inventoriées (pour affichage historique)
			&schema.SchemaField{
				Name:     "stats_category_names",
				Type:     schema.FieldTypeJson,
				Required: false,
				Options:  &schema.JsonOptions{MaxSize: 5242880},
			},
		),
	}

	// Règles d'accès — tout utilisateur authentifié
	emptyRule := ""
	collection.ListRule = &emptyRule
	collection.ViewRule = &emptyRule
	collection.CreateRule = &emptyRule
	collection.UpdateRule = &emptyRule
	collection.DeleteRule = &emptyRule

	if err := app.Dao().SaveCollection(collection); err != nil {
		return fmt.Errorf("erreur création %s: %w", collectionName, err)
	}

	log.Printf("✅ Collection %s créée avec succès", collectionName)
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureInventoryEntriesCollection
// Collection : inventory_entries
// Une entrée = un produit dans une session (snapshot stock + quantité saisie)
// ✅ Idempotent — si la collection existe déjà, les données sont préservées.
// ─────────────────────────────────────────────────────────────────────────────
func ensureInventoryEntriesCollection(app *pocketbase.PocketBase) error {
	const collectionName = "inventory_entries"

	// Si la collection existe déjà → rien à faire, on préserve les données
	existing, _ := app.Dao().FindCollectionByNameOrId(collectionName)
	if existing != nil {
		log.Printf("✅ Collection %s déjà présente, conservée telle quelle", collectionName)
		return nil
	}

	log.Printf("📦 Création de la collection %s...", collectionName)

	// Récupérer l'ID de inventory_sessions pour la relation
	sessionsCollection, err := app.Dao().FindCollectionByNameOrId("inventory_sessions")
	if err != nil || sessionsCollection == nil {
		return fmt.Errorf("la collection inventory_sessions doit exister avant inventory_entries")
	}

	collection := &models.Collection{
		Name: collectionName,
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			// Relation vers la session parente — cascade delete
			&schema.SchemaField{
				Name:     "session_id",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  sessionsCollection.Id,
					CascadeDelete: true,
					MaxSelect:     func() *int { v := 1; return &v }(),
				},
			},
			// ID du produit AppPOS (clé externe string, pas une relation PB)
			&schema.SchemaField{
				Name:     "product_id",
				Type:     schema.FieldTypeText,
				Required: true,
			},
			// Snapshot nom du produit au moment du gel
			&schema.SchemaField{
				Name:     "product_name",
				Type:     schema.FieldTypeText,
				Required: true,
			},
			// Snapshot SKU
			&schema.SchemaField{
				Name:     "product_sku",
				Type:     schema.FieldTypeText,
				Required: false,
			},
			// Snapshot code-barres (pour scan rapide et affichage historique)
			&schema.SchemaField{
				Name:     "product_barcode",
				Type:     schema.FieldTypeText,
				Required: false,
			},
			// Snapshot URL image (pour l'UI de comptage)
			&schema.SchemaField{
				Name:     "product_image",
				Type:     schema.FieldTypeText,
				Required: false,
			},
			// ID de la catégorie AppPOS (clé externe string)
			&schema.SchemaField{
				Name:     "category_id",
				Type:     schema.FieldTypeText,
				Required: true,
			},
			// Snapshot nom de la catégorie
			&schema.SchemaField{
				Name:     "category_name",
				Type:     schema.FieldTypeText,
				Required: true,
			},
			// Stock AppPOS au moment du gel (référence théorique)
			// Required: false — PocketBase rejette 0 comme "missing" sur un Number requis
			&schema.SchemaField{
				Name:     "stock_theorique",
				Type:     schema.FieldTypeNumber,
				Required: false,
				Options: &schema.NumberOptions{
					Min: func() *float64 { v := float64(0); return &v }(),
				},
			},
			// Quantité comptée physiquement (null = pas encore saisie)
			&schema.SchemaField{
				Name:     "stock_compte",
				Type:     schema.FieldTypeNumber,
				Required: false,
				Options: &schema.NumberOptions{
					Min: func() *float64 { v := float64(0); return &v }(),
				},
			},
			// Statut de l'entrée
			&schema.SchemaField{
				Name:     "status",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"pending", "counted"},
				},
			},
			// Timestamp de la saisie
			&schema.SchemaField{
				Name:     "counted_at",
				Type:     schema.FieldTypeDate,
				Required: false,
			},
			// True si l'ajustement AppPOS a été appliqué (écart != 0 et PUT effectué)
			&schema.SchemaField{
				Name:     "adjusted",
				Type:     schema.FieldTypeBool,
				Required: false,
			},
			// Timestamp de l'ajustement AppPOS
			&schema.SchemaField{
				Name:     "adjusted_at",
				Type:     schema.FieldTypeDate,
				Required: false,
			},
		),
	}

	// Règles d'accès — tout utilisateur authentifié
	emptyRule2 := ""
	collection.ListRule = &emptyRule2
	collection.ViewRule = &emptyRule2
	collection.CreateRule = &emptyRule2
	collection.UpdateRule = &emptyRule2
	collection.DeleteRule = &emptyRule2

	if err := app.Dao().SaveCollection(collection); err != nil {
		return fmt.Errorf("erreur création %s: %w", collectionName, err)
	}

	log.Printf("✅ Collection %s créée avec succès", collectionName)
	return nil
}
