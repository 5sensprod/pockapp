package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureQuotesCollection crée la collection quotes (devis) si elle n'existe pas
// 🔢 MODIFIÉ: number n'est plus Required (généré par le hook backend)
func ensureQuotesCollection(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("quotes")
	if err != nil {
		// Collection n'existe pas, on la crée
		companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
		if err != nil {
			return err
		}

		customersCol, err := app.Dao().FindCollectionByNameOrId("customers")
		if err != nil {
			return err
		}

		log.Println("📦 Création de la collection 'quotes' (devis)...")

		collection = &models.Collection{
			Name:       "quotes",
			Type:       models.CollectionTypeBase,
			ListRule:   types.Pointer("@request.auth.id != ''"),
			ViewRule:   types.Pointer("@request.auth.id != ''"),
			CreateRule: types.Pointer("@request.auth.id != ''"),
			UpdateRule: types.Pointer("@request.auth.id != ''"),
			DeleteRule: types.Pointer("@request.auth.id != ''"), // Devis supprimables
			Schema: schema.NewSchema(
				// === Identification ===
				&schema.SchemaField{
					Name:     "number",
					Type:     schema.FieldTypeText,
					Required: false, // 🔢 MODIFIÉ: généré par le hook backend
					Unique:   true,
					Options:  &schema.TextOptions{Max: types.Pointer(50)},
				},
				&schema.SchemaField{
					Name: "quote_type",
					Type: schema.FieldTypeSelect,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"standard", "refund", "other"},
					},
				},
				// === Dates ===
				&schema.SchemaField{
					Name:     "date",
					Type:     schema.FieldTypeDate,
					Required: true,
				},
				&schema.SchemaField{
					Name: "valid_until",
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
				// === Statut devis ===
				&schema.SchemaField{
					Name:     "status",
					Type:     schema.FieldTypeSelect,
					Required: true,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"draft", "sent", "accepted", "rejected"},
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
				// === Lien vers la facture générée (optionnel) ===
				&schema.SchemaField{
					Name: "generated_invoice_id",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						CollectionId:  "invoices",
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},
			),
		}

		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'quotes' créée")
	} else {
		log.Println("📦 Collection 'quotes' existe déjà, vérification du schéma...")

		// 🔢 NOUVEAU: S'assurer que le champ number n'est pas Required
		changed := false
		if f := collection.Schema.GetFieldByName("number"); f != nil {
			if f.Required {
				f.Required = false
				changed = true
				log.Println("🛠 Fix quotes.number.Required -> false (généré par hook)")
			}
		}

		if changed {
			if err := app.Dao().SaveCollection(collection); err != nil {
				return err
			}
			log.Println("✅ Collection 'quotes' mise à jour (schéma corrigé)")
		} else {
			log.Println("✅ Collection 'quotes' OK")
		}
	}

	return nil
}