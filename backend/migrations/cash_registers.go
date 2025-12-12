package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureCashRegistersCollection crée la collection cash_registers si elle n'existe pas
func ensureCashRegistersCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("cash_registers"); err == nil {
		log.Println("📦 Collection 'cash_registers' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	collection := &models.Collection{
		Name: "cash_registers",
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			// Nom lisible de la caisse
			&schema.SchemaField{
				Name:     "name",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(100)},
			},
			// Code court (POS-001, BAR-01, etc.)
			&schema.SchemaField{
				Name:    "code",
				Type:    schema.FieldTypeText,
				Unique:  true,
				Options: &schema.TextOptions{Max: types.Pointer(50)},
			},
			// Magasin / entreprise propriétaire
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
			// Info libre de localisation
			&schema.SchemaField{
				Name:    "location",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
			// Actif / désactivé
			&schema.SchemaField{
				Name: "is_active",
				Type: schema.FieldTypeBool,
			},
			// Configuration POS (JSON libre)
			&schema.SchemaField{
				Name: "settings",
				Type: schema.FieldTypeJson,
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'cash_registers' créée")
	return nil
}
