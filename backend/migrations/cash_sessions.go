package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureCashSessionsCollection crée la collection cash_sessions si elle n'existe pas
func ensureCashSessionsCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("cash_sessions"); err == nil {
		log.Println("📦 Collection 'cash_sessions' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	cashRegistersCol, err := app.Dao().FindCollectionByNameOrId("cash_registers")
	if err != nil {
		return err
	}

	collection := &models.Collection{
		Name: "cash_sessions",
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			// --- Contexte ---
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
			&schema.SchemaField{
				Name:     "cash_register",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  cashRegistersCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
			&schema.SchemaField{
				Name:     "opened_by",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  "_pb_users_auth_", // users
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
			&schema.SchemaField{
				Name: "closed_by",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  "_pb_users_auth_",
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},

			// --- Statut & dates ---
			&schema.SchemaField{
				Name:     "status",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"open", "closed", "canceled"},
				},
			},
			&schema.SchemaField{
				Name:     "opened_at",
				Type:     schema.FieldTypeDate,
				Required: true,
			},
			&schema.SchemaField{
				Name: "closed_at",
				Type: schema.FieldTypeDate,
			},

			// --- Espèces / totaux ---
			&schema.SchemaField{
				Name:    "opening_float",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{},
			},
			&schema.SchemaField{
				Name:    "expected_cash_total",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{},
			},
			&schema.SchemaField{
				Name:    "counted_cash_total",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{},
			},
			&schema.SchemaField{
				Name:    "cash_difference",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{},
			},
			&schema.SchemaField{
				Name:    "invoice_count",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{}, // même si tu veux un entier, ça passe, tu gères côté code
			},
			&schema.SchemaField{
				Name:    "total_ttc",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{},
			},
			&schema.SchemaField{
				Name: "totals_by_method",
				Type: schema.FieldTypeJson,
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'cash_sessions' créée")
	return nil
}
