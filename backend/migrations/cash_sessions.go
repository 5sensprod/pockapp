package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureCashSessionsCollection crée ou met à jour la collection cash_sessions
func ensureCashSessionsCollection(app *pocketbase.PocketBase) error {
	// Essayer de récupérer la collection existante
	collection, err := app.Dao().FindCollectionByNameOrId("cash_sessions")

	if err != nil {
		// La collection n'existe pas, la créer
		log.Println("📦 Création de la collection 'cash_sessions'...")

		companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
		if err != nil {
			return err
		}

		cashRegistersCol, err := app.Dao().FindCollectionByNameOrId("cash_registers")
		if err != nil {
			return err
		}

		collection = &models.Collection{
			Name:       "cash_sessions",
			Type:       models.CollectionTypeBase,
			ListRule:   types.Pointer("@request.auth.id != ''"),
			ViewRule:   types.Pointer("@request.auth.id != ''"),
			CreateRule: types.Pointer("@request.auth.id != ''"),
			UpdateRule: types.Pointer("@request.auth.id != ''"),
			DeleteRule: types.Pointer("@request.auth.id != ''"),
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
						CollectionId:  "_pb_users_auth_",
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
					Options: &schema.NumberOptions{},
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

	// La collection existe, mettre à jour les règles
	log.Println("📦 Collection 'cash_sessions' existe déjà, mise à jour des règles...")

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
		log.Println("✅ Règles de 'cash_sessions' mises à jour")
	} else {
		log.Println("✅ Collection 'cash_sessions' OK (règles déjà présentes)")
	}

	return nil
}
