package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureAuditLogsCollection crée la collection audit_logs si elle n'existe pas
// Les logs d'audit sont immuables (pas d'update/delete)
func ensureAuditLogsCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("audit_logs"); err == nil {
		log.Println("📦 Collection 'audit_logs' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	log.Println("📦 Création de la collection 'audit_logs'...")

	collection := &models.Collection{
		Name:       "audit_logs",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: nil, // Immuable
		DeleteRule: nil, // Immuable
		Schema: schema.NewSchema(
			// === Action effectuée ===
			&schema.SchemaField{
				Name:     "action",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values: []string{
						"invoice_created",
						"invoice_validated",
						"invoice_sent",
						"payment_recorded",
						"credit_note_created",
						"closure_performed",
						"integrity_check",
						"export_generated",
						"pdf_generated",
					},
				},
			},

			// === Entité concernée ===
			&schema.SchemaField{
				Name:     "entity_type",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"invoice", "credit_note", "closure"},
				},
			},
			&schema.SchemaField{
				Name:     "entity_id",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(50)},
			},
			&schema.SchemaField{
				Name:    "entity_number",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(50)},
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

			// === Utilisateur ===
			&schema.SchemaField{
				Name: "user_id",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  "_pb_users_auth_",
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
			&schema.SchemaField{
				Name:    "user_email",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},

			// === Contexte technique ===
			&schema.SchemaField{
				Name:    "ip_address",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(45)},
			},
			&schema.SchemaField{
				Name:    "user_agent",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(500)},
			},

			// === Détails de l'action ===
			&schema.SchemaField{
				Name:    "details",
				Type:    schema.FieldTypeJson,
				Options: &schema.JsonOptions{MaxSize: 102400},
			},
			&schema.SchemaField{
				Name:    "previous_values",
				Type:    schema.FieldTypeJson,
				Options: &schema.JsonOptions{MaxSize: 102400},
			},
			&schema.SchemaField{
				Name:    "new_values",
				Type:    schema.FieldTypeJson,
				Options: &schema.JsonOptions{MaxSize: 102400},
			},

			// === Intégrité (chaînage des logs) ===
			&schema.SchemaField{
				Name:     "hash",
				Type:     schema.FieldTypeText,
				Required: false,
				Options:  &schema.TextOptions{Max: types.Pointer(64)},
			},
			&schema.SchemaField{
				Name:     "previous_hash",
				Type:     schema.FieldTypeText,
				Required: false,
				Options:  &schema.TextOptions{Max: types.Pointer(64)},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'audit_logs' créée")
	return nil
}