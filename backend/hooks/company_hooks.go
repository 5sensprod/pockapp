// backend/hooks/company_hooks.go
package hooks

import (
	"log"

	"pocket-react/backend/migrations"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/models"
)

func RegisterCompanyHooks(app *pocketbase.PocketBase) {
	// Hook après création d'une company
	app.OnRecordAfterCreateRequest("companies").Add(func(e *core.RecordCreateEvent) error {
		log.Printf("🏢 Nouvelle company créée: %s - création des moyens de paiement...", e.Record.Id)
		return CreateDefaultPaymentMethodsForCompany(app, e.Record.Id)
	})
}

// CreateDefaultPaymentMethodsForCompany crée les moyens par défaut pour une company
func CreateDefaultPaymentMethodsForCompany(app *pocketbase.PocketBase, companyId string) error {
	col, err := app.Dao().FindCollectionByNameOrId("payment_methods")
	if err != nil {
		log.Printf("❌ Collection payment_methods non trouvée: %v", err)
		return err
	}

	defaults := migrations.GetDefaultPaymentMethods() // ✅ MAJUSCULE

	for _, methodData := range defaults {
		record := models.NewRecord(col)
		record.Set("company", companyId)
		for key, value := range methodData {
			record.Set(key, value)
		}

		if err := app.Dao().SaveRecord(record); err != nil {
			log.Printf("⚠️ Erreur création %s: %v", methodData["code"], err)
		} else {
			log.Printf("✅ Moyen '%s' créé", methodData["name"])
		}
	}

	return nil
}
