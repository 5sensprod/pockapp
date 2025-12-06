package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureClosuresCollection crée la collection closures si elle n'existe pas
// Les clôtures sont immuables (pas d'update/delete)
func ensureClosuresCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("closures"); err == nil {
		log.Println("📦 Collection 'closures' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	log.Println("📦 Création de la collection 'closures'...")

	collection := &models.Collection{
		Name:       "closures",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: nil, // Immuable
		DeleteRule: nil, // Immuable
		Schema: schema.NewSchema(
			// === Type de clôture ===
			&schema.SchemaField{
				Name:     "closure_type",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"daily", "monthly", "annual"},
				},
			},

			// === Entreprise ===
			&schema.SchemaField{
				Name:     "owner_company",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  companiesCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},

			// === Période ===
			&schema.SchemaField{
				Name:     "period_start",
				Type:     schema.FieldTypeDate,
				Required: true,
			},
			&schema.SchemaField{
				Name:     "period_end",
				Type:     schema.FieldTypeDate,
				Required: true,
			},
			&schema.SchemaField{
				Name:     "fiscal_year",
				Type:     schema.FieldTypeNumber,
				Required: true,
			},

			// === Compteurs ===
			&schema.SchemaField{
				Name: "invoice_count",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name: "credit_note_count",
				Type: schema.FieldTypeNumber,
			},

			// === Totaux ===
			&schema.SchemaField{
				Name: "total_ht",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name: "total_tva",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name: "total_ttc",
				Type: schema.FieldTypeNumber,
			},

			// === Séquences ===
			&schema.SchemaField{
				Name: "first_sequence",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name: "last_sequence",
				Type: schema.FieldTypeNumber,
			},

			// === Hashes pour intégrité ===
			&schema.SchemaField{
				Name:    "first_hash",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(64)},
			},
			&schema.SchemaField{
				Name:    "last_hash",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(64)},
			},
			&schema.SchemaField{
				Name:    "cumulative_hash",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(64)},
			},
			&schema.SchemaField{
				Name:    "closure_hash",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(64)},
			},

			// === Utilisateur ayant effectué la clôture ===
			&schema.SchemaField{
				Name: "closed_by",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  "_pb_users_auth_",
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'closures' créée")
	return nil
}