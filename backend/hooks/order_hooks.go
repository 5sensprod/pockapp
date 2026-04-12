// backend/hooks/order_hooks.go
// Hook PocketBase pour les bons de commande.
// Génère automatiquement le numéro BC-YYYY-XXXX avant chaque création.

package hooks

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterOrderHooks enregistre tous les hooks liés aux bons de commande.
// À appeler dans main.go après hooks.RegisterAllHooks(pb).
func RegisterOrderHooks(pb *pocketbase.PocketBase) {
	pb.OnRecordBeforeCreateRequest("orders").Add(func(e *core.RecordCreateEvent) error {
		return generateOrderNumber(pb, e)
	})
}

// generateOrderNumber génère le prochain numéro BC-YYYY-XXXX pour le bon de commande.
// Même logique que la numérotation des devis (quotes) et factures (invoices).
func generateOrderNumber(pb *pocketbase.PocketBase, e *core.RecordCreateEvent) error {
	// Si le numéro est déjà renseigné (ne devrait pas arriver, mais sécurité)
	if e.Record.GetString("number") != "" {
		return nil
	}

	now := time.Now()
	fiscalYear := now.Year()
	ownerCompany := e.Record.GetString("owner_company")

	prefix := fmt.Sprintf("BC-%d-", fiscalYear)

	// Chercher le dernier numéro de cet exercice pour cette company
	records, err := pb.Dao().FindRecordsByFilter(
		"orders",
		fmt.Sprintf(
			"owner_company = '%s' && fiscal_year = %d",
			ownerCompany,
			fiscalYear,
		),
		"-number", // tri décroissant → le plus grand en premier
		1,
		0,
	)

	var nextSeq int
	if err != nil || len(records) == 0 {
		nextSeq = 1
	} else {
		lastNumber := records[0].GetString("number")
		// Extraire la séquence du numéro : "BC-2025-0042" → 42
		var seq int
		fmt.Sscanf(strings.TrimPrefix(lastNumber, prefix), "%d", &seq)
		nextSeq = seq + 1
	}

	number := fmt.Sprintf("%s%04d", prefix, nextSeq)

	e.Record.Set("number", number)
	e.Record.Set("fiscal_year", fiscalYear)

	log.Printf("✅ Numéro BC généré : %s (company: %s)", number, ownerCompany)
	return nil
}
