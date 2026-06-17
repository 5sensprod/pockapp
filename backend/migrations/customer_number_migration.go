package migrations

import (
	"fmt"
	"log"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// customerNumberPrefix est le préfixe utilisé pour tous les numéros clients.
// Doit rester identique à celui défini dans backend/hooks/customer_number_hook.go.
const customerNumberPrefix = "CL-"

// AddCustomerNumberToCustomers ajoute le champ customer_number (unique, figé) à la collection customers
func AddCustomerNumberToCustomers(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("customers")
	if err != nil {
		return err
	}

	// Vérifier si le champ existe déjà
	if collection.Schema.GetFieldByName("customer_number") != nil {
		log.Println("📦 Champ 'customer_number' existe déjà sur 'customers'")
		return nil
	}

	log.Println("📦 Ajout du champ 'customer_number' sur 'customers'...")

	// Ajouter le champ customer_number en texte unique, non requis au niveau schéma
	// (il est rempli automatiquement par le hook avant création, donc toujours présent en pratique)
	collection.Schema.AddField(&schema.SchemaField{
		Name:     "customer_number",
		Type:     schema.FieldTypeText,
		Required: false,
		Unique:   true,
		Options: &schema.TextOptions{
			Max: types.Pointer(50),
		},
	})

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}

	log.Println("✅ Champ 'customer_number' ajouté avec succès")
	return nil
}

// BackfillCustomerNumber attribue un numéro client séquentiel aux clients existants
// qui n'en ont pas encore. Le compteur est global... mais par owner_company : chaque
// société démarre sa propre séquence à 1 (CL-000001, CL-000002...), comme pour les
// bons de commande. À l'intérieur d'une même société, l'ordre chronologique de
// création (created ASC) est respecté pour préserver la cohérence de l'historique.
func BackfillCustomerNumber(app *pocketbase.PocketBase) error {
	log.Println("🔄 Backfill customer_number pour les clients existants...")

	companies, err := distinctOwnerCompanies(app)
	if err != nil {
		log.Printf("⚠️ Erreur lors de la récupération des sociétés: %v", err)
		return nil // On ne bloque pas la migration
	}

	totalUpdated := 0
	for _, ownerCompany := range companies {
		updated, err := backfillCustomerNumberForCompany(app, ownerCompany)
		if err != nil {
			log.Printf("⚠️ Erreur backfill numéro client pour company %s: %v", ownerCompany, err)
			continue
		}
		totalUpdated += updated
	}

	log.Printf("✅ Backfill terminé: %d clients numérotés au total", totalUpdated)
	return nil
}

// distinctOwnerCompanies retourne la liste des owner_company distincts présents
// sur les clients qui n'ont pas encore de customer_number.
func distinctOwnerCompanies(app *pocketbase.PocketBase) ([]string, error) {
	records, err := app.Dao().FindRecordsByFilter(
		"customers",
		"customer_number = '' || customer_number = NULL",
		"created",
		0,
		0,
	)
	if err != nil {
		return nil, err
	}

	seen := map[string]bool{}
	var companies []string
	for _, record := range records {
		owner := record.GetString("owner_company")
		if owner == "" || seen[owner] {
			continue
		}
		seen[owner] = true
		companies = append(companies, owner)
	}
	return companies, nil
}

// backfillCustomerNumberForCompany numérote les clients sans customer_number
// d'une société donnée, dans l'ordre chronologique de création, en repartant
// du dernier numéro déjà attribué à cette société (s'il y en a un).
func backfillCustomerNumberForCompany(app *pocketbase.PocketBase, ownerCompany string) (int, error) {
	records, err := app.Dao().FindRecordsByFilter(
		"customers",
		fmt.Sprintf("owner_company = '%s' && (customer_number = '' || customer_number = NULL)", ownerCompany),
		"created",
		0,
		0,
	)
	if err != nil {
		return 0, err
	}
	if len(records) == 0 {
		return 0, nil
	}

	next, err := nextCustomerNumberSeqForCompany(app, ownerCompany)
	if err != nil {
		return 0, err
	}

	updated := 0
	for _, record := range records {
		record.Set("customer_number", formatCustomerNumber(next))
		if err := app.Dao().SaveRecord(record); err != nil {
			log.Printf("⚠️ Erreur backfill numéro client %s: %v", record.Id, err)
			continue
		}
		next++
		updated++
	}
	return updated, nil
}

// nextCustomerNumberSeqForCompany calcule le prochain numéro de séquence disponible
// pour une société donnée, en se basant sur le plus grand customer_number déjà
// attribué à cette société (MAX + 1). Même logique que generateCustomerNumber dans
// backend/hooks/customer_number_hook.go — gardée volontairement dupliquée et simple
// plutôt que partagée, pour éviter tout couplage entre packages migrations et hooks.
func nextCustomerNumberSeqForCompany(app *pocketbase.PocketBase, ownerCompany string) (int, error) {
	records, err := app.Dao().FindRecordsByFilter(
		"customers",
		fmt.Sprintf("owner_company = '%s' && customer_number != ''", ownerCompany),
		"-customer_number",
		1,
		0,
	)
	if err != nil {
		return 0, err
	}
	if len(records) == 0 {
		return 1, nil
	}

	lastNumber := records[0].GetString("customer_number")
	var seq int
	fmt.Sscanf(strings.TrimPrefix(lastNumber, customerNumberPrefix), "%d", &seq)
	return seq + 1, nil
}

// formatCustomerNumber formate un entier de séquence en numéro client (ex: CL-000123).
func formatCustomerNumber(seq int) string {
	return fmt.Sprintf("%s%06d", customerNumberPrefix, seq)
}
