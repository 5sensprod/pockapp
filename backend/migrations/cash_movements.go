package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureCashMovementsCollection crée la collection cash_movements si elle n'existe pas
func ensureCashMovementsCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("cash_movements"); err == nil {
		log.Println("📦 Collection 'cash_movements' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	sessionsCol, err := app.Dao().FindCollectionByNameOrId("cash_sessions")
	if err != nil {
		return err
	}

	collection := &models.Collection{
		Name: "cash_movements",
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			// Contexte
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
				Name:     "session",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  sessionsCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
			&schema.SchemaField{
				Name: "created_by",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  "_pb_users_auth_",
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},

			// Données métier
			&schema.SchemaField{
				Name:     "movement_type",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"cash_in", "cash_out", "safe_drop", "adjustment"},
				},
			},
			&schema.SchemaField{
				Name:     "amount",
				Type:     schema.FieldTypeNumber,
				Required: true,
				Options:  &schema.NumberOptions{},
			},
			&schema.SchemaField{
				Name: "reason",
				Type: schema.FieldTypeText,
				Options: &schema.TextOptions{
					Max: types.Pointer(255),
				},
			},
			&schema.SchemaField{
				Name: "meta",
				Type: schema.FieldTypeJson,
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'cash_movements' créée")
	return nil
}
