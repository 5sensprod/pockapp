package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureCompaniesCollection crée la collection companies si elle n'existe pas
func ensureCompaniesCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("companies"); err == nil {
		log.Println("📦 Collection 'companies' existe déjà")
		return nil
	}

	log.Println("📦 Création de la collection 'companies'...")

	collection := &models.Collection{
		Name:       "companies",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != ''"),
		Schema: schema.NewSchema(
			// === Identification ===
			&schema.SchemaField{
				Name:     "name",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name:    "trade_name",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name: "logo",
				Type: schema.FieldTypeFile,
				Options: &schema.FileOptions{
					MaxSelect: 1,
					MaxSize:   5242880,
					MimeTypes: []string{"image/jpeg", "image/png", "image/webp"},
				},
			},
			&schema.SchemaField{
				Name: "active",
				Type: schema.FieldTypeBool,
			},
			&schema.SchemaField{
				Name: "is_default",
				Type: schema.FieldTypeBool,
			},

			// === Informations légales ===
			&schema.SchemaField{
				Name:    "siren",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(9)},
			},
			&schema.SchemaField{
				Name:    "siret",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(14)},
			},
			&schema.SchemaField{
				Name:    "vat_number",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(20)},
			},
			&schema.SchemaField{
				Name:    "legal_form",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(50)},
			},
			&schema.SchemaField{
				Name:    "rcs",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(50)},
			},
			&schema.SchemaField{
				Name:    "ape_naf",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(10)},
			},
			&schema.SchemaField{
				Name:    "share_capital",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
			},

			// === Adresse ===
			&schema.SchemaField{
				Name:    "address_line1",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name:    "address_line2",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name:    "zip_code",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(20)},
			},
			&schema.SchemaField{
				Name:    "city",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(100)},
			},
			&schema.SchemaField{
				Name:    "country",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(100)},
			},

			// === Contact ===
			&schema.SchemaField{
				Name:    "phone",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(30)},
			},
			&schema.SchemaField{
				Name: "email",
				Type: schema.FieldTypeEmail,
			},
			&schema.SchemaField{
				Name: "website",
				Type: schema.FieldTypeUrl,
			},

			// === Informations bancaires ===
			&schema.SchemaField{
				Name:    "bank_name",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(100)},
			},
			&schema.SchemaField{
				Name:    "iban",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(34)},
			},
			&schema.SchemaField{
				Name:    "bic",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(11)},
			},
			&schema.SchemaField{
				Name:    "account_holder",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},

			// === Paramètres de facturation ===
			&schema.SchemaField{
				Name: "default_payment_terms_days",
				Type: schema.FieldTypeNumber,
				Options: &schema.NumberOptions{
					Min: types.Pointer(0.0),
					Max: types.Pointer(365.0),
				},
			},
			&schema.SchemaField{
				Name: "default_payment_method",
				Type: schema.FieldTypeSelect,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"virement", "cb", "especes", "cheque", "autre"},
				},
			},
			&schema.SchemaField{
				Name:    "invoice_footer",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(2000)},
			},
			&schema.SchemaField{
				Name:    "invoice_prefix",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(20)},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'companies' créée")
	return nil
}