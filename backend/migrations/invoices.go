package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureInvoicesCollection crée ou met à jour la collection invoices (ISCA-compliant v2)
// Avec is_paid séparé du statut
func ensureInvoicesCollection(app *pocketbase.PocketBase) error {
	// On essaie d'abord de trouver la collection existante
	collection, err := app.Dao().FindCollectionByNameOrId("invoices")
	if err != nil {
		// Elle n'existe pas encore : on la crée
		log.Println("📦 Création de la collection 'invoices' (ISCA v2)...")

		companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
		if err != nil {
			return err
		}

		customersCol, err := app.Dao().FindCollectionByNameOrId("customers")
		if err != nil {
			return err
		}

		collection = &models.Collection{
			Name:       "invoices",
			Type:       models.CollectionTypeBase,
			ListRule:   types.Pointer("@request.auth.id != ''"),
			ViewRule:   types.Pointer("@request.auth.id != ''"),
			CreateRule: types.Pointer("@request.auth.id != ''"),
			UpdateRule: types.Pointer("@request.auth.id != ''"),
			DeleteRule: types.Pointer("@request.auth.id != ''"),
			Schema: schema.NewSchema(
				// === Identification ===
				&schema.SchemaField{
					Name:     "number",
					Type:     schema.FieldTypeText,
					Required: true,
					Unique:   true,
					Options:  &schema.TextOptions{Max: types.Pointer(50)},
				},
				&schema.SchemaField{
					Name:     "invoice_type",
					Type:     schema.FieldTypeSelect,
					Required: true,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"invoice", "credit_note"},
					},
				},

				// === Dates ===
				&schema.SchemaField{
					Name:     "date",
					Type:     schema.FieldTypeDate,
					Required: true,
				},
				&schema.SchemaField{
					Name: "due_date",
					Type: schema.FieldTypeDate,
				},

				// === Relations ===
				&schema.SchemaField{
					Name:     "customer",
					Type:     schema.FieldTypeRelation,
					Required: true,
					Options: &schema.RelationOptions{
						CollectionId:  customersCol.Id,
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},
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

				// === Statut workflow (SANS "paid") ===
				&schema.SchemaField{
					Name:     "status",
					Type:     schema.FieldTypeSelect,
					Required: true,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"draft", "validated", "sent"},
					},
				},

				// === Paiement (SÉPARÉ du statut) ===
				&schema.SchemaField{
					Name: "is_paid",
					Type: schema.FieldTypeBool,
				},
				&schema.SchemaField{
					Name: "paid_at",
					Type: schema.FieldTypeDate,
				},
				&schema.SchemaField{
					Name: "payment_method",
					Type: schema.FieldTypeSelect,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"virement", "cb", "especes", "cheque", "autre"},
					},
				},

				// === Contenu ===
				&schema.SchemaField{
					Name:     "items",
					Type:     schema.FieldTypeJson,
					Required: true,
					Options:  &schema.JsonOptions{MaxSize: 1048576},
				},
				&schema.SchemaField{
					Name:     "total_ht",
					Type:     schema.FieldTypeNumber,
					Required: true,
					Options:  &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:     "total_tva",
					Type:     schema.FieldTypeNumber,
					Required: true,
					Options:  &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:     "total_ttc",
					Type:     schema.FieldTypeNumber,
					Required: true,
					Options:  &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:     "currency",
					Type:     schema.FieldTypeText,
					Required: true,
					Options:  &schema.TextOptions{Max: types.Pointer(10)},
				},
				&schema.SchemaField{
					Name:    "notes",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(2000)},
				},

				// === ISCA - Traçabilité (générés par hooks) ===
				&schema.SchemaField{
					Name: "sequence_number",
					Type: schema.FieldTypeNumber,
				},
				&schema.SchemaField{
					Name: "fiscal_year",
					Type: schema.FieldTypeNumber,
				},
				&schema.SchemaField{
					Name:    "hash",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(64)},
				},
				&schema.SchemaField{
					Name:    "previous_hash",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(64)},
				},
				&schema.SchemaField{
					Name: "is_locked",
					Type: schema.FieldTypeBool,
				},

				// === Avoirs ===
				&schema.SchemaField{
					Name: "original_invoice_id",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						// CollectionId fixé juste après la création
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},
				&schema.SchemaField{
					Name:    "cancellation_reason",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(500)},
				},

				// === Clôture ===
				&schema.SchemaField{
					Name: "closure_id",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						// CollectionId fixé plus tard quand closures existe
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},
			),
		}

		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'invoices' créée (ISCA v2)")
	} else {
		log.Println("📦 Collection 'invoices' existe déjà, vérification du schéma...")
	}

	// À partir de là, collection existe forcément.
	changed := false

	// 1) Fixer la self-relation original_invoice_id → invoices
	if f := collection.Schema.GetFieldByName("original_invoice_id"); f != nil {
		if opts, ok := f.Options.(*schema.RelationOptions); ok {
			if opts.CollectionId == "" {
				opts.CollectionId = collection.Id
				changed = true
				log.Println("🛠 Fix original_invoice_id.CollectionId -> invoices")
			}
		}
	}

	// 2) Fixer closure_id → closures (si la collection closures existe)
	if closuresCol, err := app.Dao().FindCollectionByNameOrId("closures"); err == nil {
		if f := collection.Schema.GetFieldByName("closure_id"); f != nil {
			if opts, ok := f.Options.(*schema.RelationOptions); ok {
				if opts.CollectionId == "" {
					opts.CollectionId = closuresCol.Id
					changed = true
					log.Println("🛠 Fix closure_id.CollectionId -> closures")
				}
			}
		}
	}

	if changed {
		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'invoices' mise à jour (relations corrigées)")
	} else {
		log.Println("✅ Collection 'invoices' OK (aucune modification nécessaire)")
	}

	return nil
}