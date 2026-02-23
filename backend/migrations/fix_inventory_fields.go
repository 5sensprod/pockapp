package migrations

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// FixInventoryCollectionFields corrige les champs Select et JSON
// créés sans MaxSelect/MaxSize, ce qui empêchait toute écriture (400).
func FixInventoryCollectionFields(app *pocketbase.PocketBase) error {
	if err := fixInventorySessionsFields(app); err != nil {
		return err
	}
	return fixInventoryEntriesFields(app)
}

func fixInventorySessionsFields(app *pocketbase.PocketBase) error {
	const collectionName = "inventory_sessions"

	collection, err := app.Dao().FindCollectionByNameOrId(collectionName)
	if err != nil {
		log.Printf("⚠️ %s introuvable, skip", collectionName)
		return nil
	}

	// status — Select, max 1 valeur
	if f := collection.Schema.GetFieldByName("status"); f != nil {
		f.Options = &schema.SelectOptions{
			MaxSelect: 1,
			Values:    []string{"draft", "in_progress", "completed", "cancelled"},
		}
	}

	// scope — Select, max 1 valeur
	if f := collection.Schema.GetFieldByName("scope"); f != nil {
		f.Options = &schema.SelectOptions{
			MaxSelect: 1,
			Values:    []string{"all", "selection"},
		}
	}

	// scope_category_ids — JSON, 5 Mo max
	if f := collection.Schema.GetFieldByName("scope_category_ids"); f != nil {
		f.Options = &schema.JsonOptions{MaxSize: 5242880}
	}

	// validated_category_ids — JSON, 5 Mo max
	if f := collection.Schema.GetFieldByName("validated_category_ids"); f != nil {
		f.Options = &schema.JsonOptions{MaxSize: 5242880}
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return fmt.Errorf("erreur fix %s: %w", collectionName, err)
	}

	log.Printf("✅ Champs corrigés pour %s", collectionName)
	return nil
}

func fixInventoryEntriesFields(app *pocketbase.PocketBase) error {
	const collectionName = "inventory_entries"

	collection, err := app.Dao().FindCollectionByNameOrId(collectionName)
	if err != nil {
		log.Printf("⚠️ %s introuvable, skip", collectionName)
		return nil
	}

	// status — Select, max 1 valeur
	if f := collection.Schema.GetFieldByName("status"); f != nil {
		f.Options = &schema.SelectOptions{
			MaxSelect: 1,
			Values:    []string{"pending", "counted"},
		}
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return fmt.Errorf("erreur fix %s: %w", collectionName, err)
	}

	log.Printf("✅ Champs corrigés pour %s", collectionName)
	return nil
}
