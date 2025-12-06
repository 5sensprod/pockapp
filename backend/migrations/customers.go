package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureCustomersCollection crée la collection customers si elle n'existe pas
func ensureCustomersCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("customers"); err == nil {
		log.Println("📦 Collection 'customers' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	log.Println("📦 Création de la collection 'customers'...")

	collection := &models.Collection{
		Name:       "customers",
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

			// === Contact ===
			&schema.SchemaField{
				Name: "email",
				Type: schema.FieldTypeEmail,
			},
			&schema.SchemaField{
				Name:    "phone",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(30)},
			},
			&schema.SchemaField{
				Name:    "address",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(500)},
			},

			// === Entreprise du client ===
			&schema.SchemaField{
				Name:    "company",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},

			// === Notes ===
			&schema.SchemaField{
				Name:    "notes",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(2000)},
			},

			// === Avatar ===
			&schema.SchemaField{
				Name: "avatar",
				Type: schema.FieldTypeFile,
				Options: &schema.FileOptions{
					MaxSelect: 1,
					MaxSize:   2097152,
					MimeTypes: []string{"image/jpeg", "image/png", "image/webp"},
				},
			},

			// === Tags ===
			&schema.SchemaField{
				Name: "tags",
				Type: schema.FieldTypeSelect,
				Options: &schema.SelectOptions{
					MaxSelect: 10,
					Values:    []string{"vip", "prospect", "actif", "inactif"},
				},
			},

			// === Relation vers l'entreprise propriétaire ===
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
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'customers' créée")
	return nil
}