package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
)

// FixInvoiceTotalsNonzero enlève la contrainte "Nonzero" sur total_ht, total_tva, total_ttc
// pour permettre les produits à TVA 0% et les avoirs à 0€
func FixInvoiceTotalsNonzero(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("invoices")
	if err != nil {
		return err
	}

	changed := false
	fieldsToFix := []string{"total_ht", "total_tva", "total_ttc"}

	for _, fieldName := range fieldsToFix {
		field := collection.Schema.GetFieldByName(fieldName)
		if field != nil && field.Required {
			field.Required = false
			changed = true
			log.Printf("🔧 Fix: %s → Required=false (autorise 0)", fieldName)
		}
	}

	if changed {
		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Contraintes Nonzero supprimées sur total_ht/tva/ttc")
	}

	return nil
}
