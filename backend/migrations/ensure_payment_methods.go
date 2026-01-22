// migrations/ensure_payment_methods.go
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

func EnsureAllCompaniesHavePaymentMethods(app *pocketbase.PocketBase) error {
	log.Println("🔍 Vérification des moyens de paiement pour toutes les companies...")

	// Vérifier que la collection existe
	col, err := app.Dao().FindCollectionByNameOrId("payment_methods")
	if err != nil {
		log.Println("⚠️ Collection payment_methods non trouvée, skip")
		return nil
	}

	// ✅ CORRECTION : Utiliser un filtre valide au lieu d'un filtre vide
	companies, err := app.Dao().FindRecordsByFilter("companies", "id != ''", "", 0, 0)
	if err != nil {
		log.Printf("❌ Erreur récupération companies: %v", err)
		return nil
	}

	if len(companies) == 0 {
		log.Println("ℹ️ Aucune company trouvée")
		return nil
	}

	log.Printf("📊 %d company(ies) trouvée(s)", len(companies))

	defaults := GetDefaultPaymentMethods()
	totalCreated := 0

	for _, company := range companies {
		companyId := company.Id
		companyName := company.GetString("name")
		created := 0

		for _, methodData := range defaults {
			code := methodData["code"].(string)

			// Vérifier si existe déjà
			existing, _ := app.Dao().FindFirstRecordByFilter(
				"payment_methods",
				"company = {:company} && code = {:code}",
				map[string]interface{}{
					"company": companyId,
					"code":    code,
				},
			)

			if existing != nil {
				continue
			}

			// Créer le moyen manquant
			record := models.NewRecord(col)
			record.Set("company", companyId)
			for key, value := range methodData {
				record.Set(key, value)
			}

			if err := app.Dao().SaveRecord(record); err != nil {
				log.Printf("⚠️ Erreur création %s pour %s: %v", code, companyName, err)
			} else {
				created++
				totalCreated++
			}
		}

		if created > 0 {
			log.Printf("✅ %d moyen(s) créé(s) pour company '%s'", created, companyName)
		}
	}

	if totalCreated > 0 {
		log.Printf("🎉 Total: %d moyen(s) de paiement créé(s)", totalCreated)
	} else {
		log.Println("✅ Toutes les companies ont déjà leurs moyens de paiement")
	}

	return nil
}

// GetDefaultPaymentMethods - reste identique
func GetDefaultPaymentMethods() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"code":                "card",
			"name":                "Carte bancaire",
			"description":         "Terminal CB connecté",
			"type":                "default",
			"accounting_category": "card",
			"enabled":             true,
			"requires_session":    false,
			"icon":                "CreditCard",
			"color":               "#1e293b",
			"text_color":          "#ffffff",
			"display_order":       1,
		},
		{
			"code":                "cash",
			"name":                "Espèces",
			"description":         "Rendue monnaie calculée automatiquement",
			"type":                "default",
			"accounting_category": "cash",
			"enabled":             true,
			"requires_session":    true,
			"icon":                "Banknote",
			"color":               "#f8fafc",
			"text_color":          "#475569",
			"display_order":       2,
		},
		{
			"code":                "check",
			"name":                "Chèque",
			"description":         "Paiement par chèque bancaire",
			"type":                "default",
			"accounting_category": "check",
			"enabled":             false,
			"requires_session":    false,
			"icon":                "Receipt",
			"color":               "#f8fafc",
			"text_color":          "#475569",
			"display_order":       3,
		},
		{
			"code":                "transfer",
			"name":                "Virement",
			"description":         "Virement bancaire",
			"type":                "default",
			"accounting_category": "transfer",
			"enabled":             false,
			"requires_session":    false,
			"icon":                "ArrowRightLeft",
			"color":               "#f8fafc",
			"text_color":          "#475569",
			"display_order":       4,
		},
	}
}
