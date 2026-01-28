package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// AddCustomerTypeToCustomers ajoute le champ customer_type à la collection customers
func AddCustomerTypeToCustomers(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("customers")
	if err != nil {
		return err
	}

	// Vérifier si le champ existe déjà
	if collection.Schema.GetFieldByName("customer_type") != nil {
		log.Println("📦 Champ 'customer_type' existe déjà sur 'customers'")
		return nil
	}

	log.Println("📦 Ajout du champ 'customer_type' sur 'customers'...")

	// Ajouter le champ customer_type avec association
	collection.Schema.AddField(&schema.SchemaField{
		Name:     "customer_type",
		Type:     schema.FieldTypeSelect,
		Required: false, // Non requis pour la compatibilité
		Options: &schema.SelectOptions{
			MaxSelect: 1,
			Values:    []string{"individual", "professional", "administration", "association"},
		},
	})

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}

	log.Println("✅ Champ 'customer_type' ajouté avec succès")
	return nil
}

// AddPaymentTermsToCustomers ajoute le champ payment_terms pour les délais de paiement
func AddPaymentTermsToCustomers(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("customers")
	if err != nil {
		return err
	}

	// Vérifier si le champ existe déjà
	if collection.Schema.GetFieldByName("payment_terms") != nil {
		log.Println("📦 Champ 'payment_terms' existe déjà sur 'customers'")
		return nil
	}

	log.Println("📦 Ajout du champ 'payment_terms' sur 'customers'...")

	// Ajouter le champ payment_terms (délai de paiement)
	collection.Schema.AddField(&schema.SchemaField{
		Name:     "payment_terms",
		Type:     schema.FieldTypeSelect,
		Required: false,
		Options: &schema.SelectOptions{
			MaxSelect: 1,
			Values:    []string{"immediate", "30_days", "45_days", "60_days"},
		},
	})

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}

	log.Println("✅ Champ 'payment_terms' ajouté avec succès")
	return nil
}

// BackfillCustomerType remplit customer_type = "individual" pour les clients existants sans type
func BackfillCustomerType(app *pocketbase.PocketBase) error {
	log.Println("🔄 Backfill customer_type pour les clients existants...")

	// Récupérer tous les clients sans customer_type
	records, err := app.Dao().FindRecordsByFilter(
		"customers",
		"customer_type = '' || customer_type = NULL",
		"",
		0,
		0,
	)
	if err != nil {
		log.Printf("⚠️ Erreur lors de la récupération des clients: %v", err)
		return nil // On ne bloque pas la migration
	}

	if len(records) == 0 {
		log.Println("✅ Aucun client à backfiller")
		return nil
	}

	updated := 0
	for _, record := range records {
		record.Set("customer_type", "individual")
		if err := app.Dao().SaveRecord(record); err != nil {
			log.Printf("⚠️ Erreur backfill client %s: %v", record.Id, err)
		} else {
			updated++
		}
	}

	log.Printf("✅ Backfill terminé: %d/%d clients mis à jour", updated, len(records))
	return nil
}
