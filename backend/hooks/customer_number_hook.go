// backend/hooks/customer_number_hook.go
// Hook PocketBase pour les fiches client.
// Génère automatiquement le numéro CL-XXXXXX avant chaque création.
// Compteur par owner_company (chaque société démarre sa propre séquence à 1),
// sans année car ce n'est pas un document fiscal (contrairement aux BC/factures/devis).

package hooks

import (
	"fmt"
	"log"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// customerNumberPrefix est le préfixe utilisé pour tous les numéros clients.
const customerNumberPrefix = "CL-"

// RegisterCustomerNumberHook enregistre le hook de génération du numéro client.
// À appeler dans main.go après hooks.RegisterAllHooks(pb).
func RegisterCustomerNumberHook(pb *pocketbase.PocketBase) {
	pb.OnRecordBeforeCreateRequest("customers").Add(func(e *core.RecordCreateEvent) error {
		return generateCustomerNumber(pb, e)
	})
}

// generateCustomerNumber génère le prochain numéro CL-XXXXXX pour la fiche client.
// Même logique de tri/extraction que la numérotation des bons de commande (orders),
// mais sans fiscal_year : le compteur est continu par owner_company, pas remis à zéro chaque année.
func generateCustomerNumber(pb *pocketbase.PocketBase, e *core.RecordCreateEvent) error {
	// Si le numéro est déjà renseigné (ne devrait pas arriver, mais sécurité)
	if e.Record.GetString("customer_number") != "" {
		return nil
	}

	ownerCompany := e.Record.GetString("owner_company")

	// Chercher le dernier numéro attribué pour cette company
	records, err := pb.Dao().FindRecordsByFilter(
		"customers",
		fmt.Sprintf("owner_company = '%s'", ownerCompany),
		"-customer_number", // tri décroissant → le plus grand en premier
		1,
		0,
	)

	var nextSeq int
	if err != nil || len(records) == 0 {
		nextSeq = 1
	} else {
		lastNumber := records[0].GetString("customer_number")
		// Extraire la séquence du numéro : "CL-000042" → 42
		var seq int
		fmt.Sscanf(strings.TrimPrefix(lastNumber, customerNumberPrefix), "%d", &seq)
		nextSeq = seq + 1
	}

	number := fmt.Sprintf("%s%06d", customerNumberPrefix, nextSeq)

	e.Record.Set("customer_number", number)

	log.Printf("✅ Numéro client généré : %s (company: %s)", number, ownerCompany)
	return nil
}
