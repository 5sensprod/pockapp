package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
)

// FixTotalsNonzero enlève la contrainte "Nonzero" sur total_ht, total_tva, total_ttc
// pour les factures ET les devis (permet TVA 0% et avoirs à 0€)
func FixInvoiceTotalsNonzero(app *pocketbase.PocketBase) error {
	collections := []string{"invoices", "quotes"}
	fieldsToFix := []string{"total_ht", "total_tva", "total_ttc"}

	for _, colName := range collections {
		collection, err := app.Dao().FindCollectionByNameOrId(colName)
		if err != nil {
			log.Printf("⚠️ Collection %s introuvable, skip", colName)
			continue
		}

		changed := false
		for _, fieldName := range fieldsToFix {
			field := collection.Schema.GetFieldByName(fieldName)
			if field != nil && field.Required {
				field.Required = false
				changed = true
				log.Printf("🔧 Fix: %s.%s → Required=false (autorise 0)", colName, fieldName)
			}
		}

		if changed {
			if err := app.Dao().SaveCollection(collection); err != nil {
				return err
			}
			log.Printf("✅ Contraintes Nonzero supprimées sur %s", colName)
		}
	}

	return nil
}
