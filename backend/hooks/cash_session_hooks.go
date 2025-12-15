package hooks

import (
	"fmt"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func RegisterCashSessionHooks(app *pocketbase.PocketBase) {
	// Avant fermeture de session : calculer les totaux
	app.OnRecordBeforeUpdateRequest("cash_sessions").Add(func(e *core.RecordUpdateEvent) error {
		original := e.Record.OriginalCopy()
		updated := e.Record

		// Détection de la fermeture
		if original.GetString("status") == "open" && updated.GetString("status") == "closed" {
			sessionId := updated.Id

			// Récupérer toutes les factures de cette session
			invoices, err := app.Dao().FindRecordsByFilter(
				"invoices",
				fmt.Sprintf("session = '%s'", sessionId),
				"",
				0,
				0,
			)
			if err != nil {
				return err
			}

			// Calculer les totaux
			var invoiceCount int
			var totalTTC float64
			totalsByMethod := make(map[string]float64)
			var cashTotal float64

			for _, inv := range invoices {
				invoiceCount++
				ttc := inv.GetFloat("total_ttc")
				totalTTC += ttc

				method := inv.GetString("payment_method")
				totalsByMethod[method] += ttc

				if method == "especes" {
					cashTotal += ttc
				}
			}

			// Mettre à jour la session
			updated.Set("invoice_count", invoiceCount)
			updated.Set("total_ttc", totalTTC)
			updated.Set("totals_by_method", totalsByMethod)

			// Calculer espèces attendues
			openingFloat := updated.GetFloat("opening_float")
			expectedCashTotal := openingFloat + cashTotal
			updated.Set("expected_cash_total", expectedCashTotal)

			// Calculer l'écart si espèces comptées
			countedCash := updated.GetFloat("counted_cash_total")
			if countedCash > 0 {
				difference := countedCash - expectedCashTotal
				updated.Set("cash_difference", difference)
			}
		}

		return nil
	})
}
