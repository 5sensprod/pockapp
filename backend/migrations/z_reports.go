// backend/migrations/z_reports.go
// Collection pour stocker les rapports Z de manière inaltérable (NF525)

package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureZReportsCollection crée la collection z_reports pour stocker les rapports Z
func ensureZReportsCollection(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("z_reports")

	if err != nil {
		log.Println("📦 Création de la collection 'z_reports'...")

		companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
		if err != nil {
			return err
		}

		cashRegistersCol, err := app.Dao().FindCollectionByNameOrId("cash_registers")
		if err != nil {
			return err
		}

		collection = &models.Collection{
			Name:       "z_reports",
			Type:       models.CollectionTypeBase,
			ListRule:   types.Pointer("@request.auth.id != ''"),
			ViewRule:   types.Pointer("@request.auth.id != ''"),
			CreateRule: types.Pointer("@request.auth.id != ''"),
			UpdateRule: nil, // ❌ Aucune mise à jour autorisée (inaltérable)
			DeleteRule: nil, // ❌ Aucune suppression autorisée
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

				// === Date et période ===
				&schema.SchemaField{
					Name:     "date",
					Type:     schema.FieldTypeDate,
					Required: true,
				},
				&schema.SchemaField{
					Name:     "fiscal_year",
					Type:     schema.FieldTypeNumber,
					Required: true,
				},

				// === Numérotation séquentielle ===
				&schema.SchemaField{
					Name:     "sequence_number",
					Type:     schema.FieldTypeNumber,
					Required: true,
				},

				// === Sessions incluses (IDs) ===
				&schema.SchemaField{
					Name:     "session_ids",
					Type:     schema.FieldTypeJson,
					Required: true,
					Options:  &schema.JsonOptions{MaxSize: 65536},
				},

				// === Totaux ===
				&schema.SchemaField{
					Name:     "sessions_count",
					Type:     schema.FieldTypeNumber,
					Required: true,
				},
				&schema.SchemaField{
					Name:     "invoice_count",
					Type:     schema.FieldTypeNumber,
					Required: true,
				},
				&schema.SchemaField{
					Name:     "total_ht",
					Type:     schema.FieldTypeNumber,
					Required: true,
				},
				&schema.SchemaField{
					Name:     "total_tva",
					Type:     schema.FieldTypeNumber,
					Required: true,
				},
				&schema.SchemaField{
					Name:     "total_ttc",
					Type:     schema.FieldTypeNumber,
					Required: true,
				},

				// === TVA ventilée ===
				&schema.SchemaField{
					Name:     "vat_breakdown",
					Type:     schema.FieldTypeJson,
					Required: true,
					Options:  &schema.JsonOptions{MaxSize: 65536},
				},

				// === Moyens de paiement ===
				&schema.SchemaField{
					Name:     "totals_by_method",
					Type:     schema.FieldTypeJson,
					Required: true,
					Options:  &schema.JsonOptions{MaxSize: 65536},
				},

				// === Espèces ===
				&schema.SchemaField{
					Name:    "total_cash_expected",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:    "total_cash_counted",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:    "total_cash_difference",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},

				// === Remises et avoirs ===
				&schema.SchemaField{
					Name:    "total_discounts",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:    "credit_notes_count",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:    "credit_notes_total",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},

				// === Traçabilité NF525 ===
				&schema.SchemaField{
					Name:     "hash",
					Type:     schema.FieldTypeText,
					Required: true,
					Options:  &schema.TextOptions{Max: types.Pointer(64)},
				},
				&schema.SchemaField{
					Name:     "previous_hash",
					Type:     schema.FieldTypeText,
					Required: true,
					Options:  &schema.TextOptions{Max: types.Pointer(64)},
				},

				// === Données complètes (JSON archivé) ===
				&schema.SchemaField{
					Name:     "full_report",
					Type:     schema.FieldTypeJson,
					Required: true,
					Options:  &schema.JsonOptions{MaxSize: 1048576}, // 1MB
				},

				// === Métadonnées ===
				&schema.SchemaField{
					Name: "generated_by",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						CollectionId:  "_pb_users_auth_",
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},
				&schema.SchemaField{
					Name: "generated_at",
					Type: schema.FieldTypeDate,
				},
				&schema.SchemaField{
					Name: "note",
					Type: schema.FieldTypeText,
				},
			),
		}

		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'z_reports' créée")
		return nil
	}

	log.Println("✅ Collection 'z_reports' existe déjà")
	return nil
}

// AddZReportIdToCashSessions ajoute le champ z_report_id à cash_sessions
func AddZReportIdToCashSessions(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("cash_sessions")
	if err != nil {
		return err
	}

	// Vérifier si le champ existe déjà
	if f := collection.Schema.GetFieldByName("z_report_id"); f != nil {
		log.Println("✅ Champ z_report_id déjà présent sur cash_sessions")
		return nil
	}

	// Récupérer l'ID de la collection z_reports
	zReportsCol, err := app.Dao().FindCollectionByNameOrId("z_reports")
	if err != nil {
		log.Println("⚠️ Collection z_reports non trouvée, champ z_report_id non ajouté")
		return nil
	}

	// Ajouter le champ
	collection.Schema.AddField(&schema.SchemaField{
		Name: "z_report_id",
		Type: schema.FieldTypeRelation,
		Options: &schema.RelationOptions{
			CollectionId:  zReportsCol.Id,
			MaxSelect:     types.Pointer(1),
			CascadeDelete: false,
		},
	})

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}

	log.Println("✅ Champ z_report_id ajouté à cash_sessions")
	return nil
}
