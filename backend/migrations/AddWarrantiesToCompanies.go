package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// AddWarrantiesToCompanies ajoute le champ warranties_text à la collection companies
func AddWarrantiesToCompanies(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		log.Println("⚠️ Collection 'companies' introuvable, skip migration warranties")
		return nil
	}

	// Vérifier si le champ existe déjà
	for _, field := range collection.Schema.Fields() {
		if field.Name == "warranties_text" {
			log.Println("📦 Champ 'warranties_text' existe déjà, skip")
			return nil
		}
	}

	log.Println("🛡️ Ajout du champ 'warranties_text' à la collection 'companies'...")

	collection.Schema.AddField(&schema.SchemaField{
		Name:    "warranties_text",
		Type:    schema.FieldTypeText,
		Options: &schema.TextOptions{Max: types.Pointer(2000)},
	})

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}

	log.Println("✅ Champ 'warranties_text' ajouté")
	return nil
}
