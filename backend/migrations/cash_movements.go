package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureCashMovementsCollection crée ou met à jour la collection cash_movements
func ensureCashMovementsCollection(app *pocketbase.PocketBase) error {
	// Essayer de récupérer la collection existante
	collection, err := app.Dao().FindCollectionByNameOrId("cash_movements")

	if err != nil {
		// La collection n'existe pas, la créer
		log.Println("📦 Création de la collection 'cash_movements'...")

		companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
		if err != nil {
			return err
		}

		sessionsCol, err := app.Dao().FindCollectionByNameOrId("cash_sessions")
		if err != nil {
			return err
		}

		collection = &models.Collection{
			Name:       "cash_movements",
			Type:       models.CollectionTypeBase,
			ListRule:   types.Pointer("@request.auth.id != ''"),
			ViewRule:   types.Pointer("@request.auth.id != ''"),
			CreateRule: types.Pointer("@request.auth.id != ''"),
			UpdateRule: types.Pointer("@request.auth.id != ''"),
			DeleteRule: types.Pointer("@request.auth.id != ''"),
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

	// La collection existe, mettre à jour les règles
	log.Println("📦 Collection 'cash_movements' existe déjà, mise à jour des règles...")

	needsUpdate := false
	authRule := "@request.auth.id != ''"

	if collection.ListRule == nil || *collection.ListRule != authRule {
		collection.ListRule = types.Pointer(authRule)
		needsUpdate = true
	}
	if collection.ViewRule == nil || *collection.ViewRule != authRule {
		collection.ViewRule = types.Pointer(authRule)
		needsUpdate = true
	}
	if collection.CreateRule == nil || *collection.CreateRule != authRule {
		collection.CreateRule = types.Pointer(authRule)
		needsUpdate = true
	}
	if collection.UpdateRule == nil || *collection.UpdateRule != authRule {
		collection.UpdateRule = types.Pointer(authRule)
		needsUpdate = true
	}
	if collection.DeleteRule == nil || *collection.DeleteRule != authRule {
		collection.DeleteRule = types.Pointer(authRule)
		needsUpdate = true
	}

	if needsUpdate {
		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Règles de 'cash_movements' mises à jour")
	} else {
		log.Println("✅ Collection 'cash_movements' OK (règles déjà présentes)")
	}

	return nil
}
