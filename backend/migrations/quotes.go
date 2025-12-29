// backend/migrations/quotes.go
// ✅ PROPRE: ajouter issued_by (Relation -> users) + update si collection existe déjà
// ✅ AJOUT: Champ vat_breakdown pour avoir la même structure que les factures

package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

func ensureQuotesCollection(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("quotes")
	if err != nil {
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
			DeleteRule: types.Pointer("@request.auth.id != ''"),
			Schema: schema.NewSchema(
				&schema.SchemaField{
					Name:     "number",
					Type:     schema.FieldTypeText,
					Required: false,
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
				&schema.SchemaField{
					Name:     "date",
					Type:     schema.FieldTypeDate,
					Required: true,
				},
				&schema.SchemaField{
					Name: "valid_until",
					Type: schema.FieldTypeDate,
				},

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

				// ✅ NOUVEAU: Émis par (vendeur / commercial)
				&schema.SchemaField{
					Name: "issued_by",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						CollectionId:  "_pb_users_auth_",
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},

				&schema.SchemaField{
					Name:     "status",
					Type:     schema.FieldTypeSelect,
					Required: true,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"draft", "sent", "accepted", "rejected"},
					},
				},

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
				// ✅ AJOUT: Ventilation TVA (même structure que factures)
				&schema.SchemaField{
					Name:    "vat_breakdown",
					Type:    schema.FieldTypeJson,
					Options: &schema.JsonOptions{MaxSize: 65536}, // 64KB suffisant
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

				// ✅ AJOUT: Champs de remise (mêmes que factures)
				&schema.SchemaField{
					Name: "cart_discount_mode",
					Type: schema.FieldTypeSelect,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"percent", "amount"},
					},
				},
				&schema.SchemaField{
					Name:    "cart_discount_value",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:    "cart_discount_ttc",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:    "line_discounts_total_ttc",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},

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
		return nil
	}

	log.Println("📦 Collection 'quotes' existe déjà, vérification du schéma...")

	changed := false

	// number.Required -> false
	if f := collection.Schema.GetFieldByName("number"); f != nil && f.Required {
		f.Required = false
		changed = true
		log.Println("🛠 Fix quotes.number.Required -> false (généré par hook)")
	}

	// ✅ ajouter issued_by si absent
	if f := collection.Schema.GetFieldByName("issued_by"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "issued_by",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  "_pb_users_auth_",
				MaxSelect:     types.Pointer(1),
				CascadeDelete: false,
			},
		})
		changed = true
		log.Println("🛠 Ajout quotes.issued_by -> users")
	}

	// ✅ ajouter vat_breakdown si absent
	if f := collection.Schema.GetFieldByName("vat_breakdown"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "vat_breakdown",
			Type:    schema.FieldTypeJson,
			Options: &schema.JsonOptions{MaxSize: 65536},
		})
		changed = true
		log.Println("🛠 Ajout quotes.vat_breakdown (JSON)")
	}

	// ✅ ajouter champs de remise si absents
	if f := collection.Schema.GetFieldByName("cart_discount_mode"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "cart_discount_mode",
			Type: schema.FieldTypeSelect,
			Options: &schema.SelectOptions{
				MaxSelect: 1,
				Values:    []string{"percent", "amount"},
			},
		})
		changed = true
		log.Println("🛠 Ajout quotes.cart_discount_mode")
	}

	if f := collection.Schema.GetFieldByName("cart_discount_value"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "cart_discount_value",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{},
		})
		changed = true
		log.Println("🛠 Ajout quotes.cart_discount_value")
	}

	if f := collection.Schema.GetFieldByName("cart_discount_ttc"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "cart_discount_ttc",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{},
		})
		changed = true
		log.Println("🛠 Ajout quotes.cart_discount_ttc")
	}

	if f := collection.Schema.GetFieldByName("line_discounts_total_ttc"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "line_discounts_total_ttc",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{},
		})
		changed = true
		log.Println("🛠 Ajout quotes.line_discounts_total_ttc")
	}

	if changed {
		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'quotes' mise à jour (schéma corrigé)")
	} else {
		log.Println("✅ Collection 'quotes' OK")
	}

	return nil
}
