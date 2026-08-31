package migrations

import (
	"fmt"
	"log"
	"sort"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

const (
	CustomerTagProspect  = "prospect"
	CustomerTagDepositor = "déposant"
)

// CustomerTagValues est la liste propre proposée aux nouvelles bases.
//
// Une base déjà installée peut toutefois porter une ancienne valeur. La
// migration la conserve tant qu'au moins un client l'utilise : retirer une
// option du select ne réécrit pas les enregistrements PocketBase et créerait
// donc une valeur orpheline.
var CustomerTagValues = []string{CustomerTagProspect, CustomerTagDepositor}

// MigrateCustomerTags aligne le select multi-valeurs et marque les clients
// déjà référencés par consignment_items.
//
// La migration est rejouable : elle n'ajoute jamais deux fois une option ou un
// tag. Elle vit avec le schéma parce que le rattrapage ne peut être enregistré
// qu'après l'ajout de l'option `déposant` au select.
func MigrateCustomerTags(app *pocketbase.PocketBase) error {
	customersCollection, err := app.Dao().FindCollectionByNameOrId("customers")
	if err != nil {
		log.Printf("⚠️ Tags clients : collection customers introuvable (%v)", err)
		return nil
	}

	tagsField := customersCollection.Schema.GetFieldByName("tags")
	if tagsField == nil || tagsField.Type != schema.FieldTypeSelect {
		return fmt.Errorf("tags clients : champ select tags introuvable")
	}

	customers, err := app.Dao().FindRecordsByFilter("customers", "1=1", "id", 0, 0)
	if err != nil {
		return fmt.Errorf("tags clients : lecture des clients : %w", err)
	}

	// PocketBase laisse les valeurs retirées dans les lignes existantes. Avant
	// de nettoyer les options du select, on garde donc toute valeur réellement
	// portée. L'ordre trié rend le schéma stable d'un démarrage à l'autre.
	usedLegacyTags := map[string]struct{}{}
	for _, customer := range customers {
		for _, tag := range customer.GetStringSlice("tags") {
			if tag != CustomerTagProspect && tag != CustomerTagDepositor {
				usedLegacyTags[tag] = struct{}{}
			}
		}
	}

	legacyTags := make([]string, 0, len(usedLegacyTags))
	for tag := range usedLegacyTags {
		legacyTags = append(legacyTags, tag)
	}
	sort.Strings(legacyTags)

	selectOptions, ok := tagsField.Options.(*schema.SelectOptions)
	if !ok {
		return fmt.Errorf("tags clients : options du select illisibles")
	}
	selectOptions.MaxSelect = 10
	selectOptions.Values = append(append([]string{}, CustomerTagValues...), legacyTags...)
	if err := app.Dao().SaveCollection(customersCollection); err != nil {
		return fmt.Errorf("tags clients : mise à jour du schéma : %w", err)
	}

	consignments, err := app.Dao().FindRecordsByFilter(
		"consignment_items",
		"1=1",
		"customer",
		0,
		0,
	)
	if err != nil {
		log.Printf("⚠️ Tags clients : collection consignment_items introuvable (%v)", err)
		return nil
	}

	depositors := make(map[string]struct{}, len(consignments))
	for _, consignment := range consignments {
		if customerID := consignment.GetString("customer"); customerID != "" {
			depositors[customerID] = struct{}{}
		}
	}

	marked := 0
	for _, customer := range customers {
		if _, isDepositor := depositors[customer.Id]; !isDepositor {
			continue
		}

		tags := customer.GetStringSlice("tags")
		alreadyMarked := false
		for _, tag := range tags {
			if tag == CustomerTagDepositor {
				alreadyMarked = true
				break
			}
		}
		if alreadyMarked {
			continue
		}

		customer.Set("tags", append(tags, CustomerTagDepositor))
		if err := app.Dao().SaveRecord(customer); err != nil {
			return fmt.Errorf(
				"tags clients : marquage du déposant %s après %d succès : %w",
				customer.Id,
				marked,
				err,
			)
		}
		marked++
	}

	log.Printf(
		"✅ Tags clients : options %v, %d client(s) marqué(s) déposant",
		selectOptions.Values,
		marked,
	)
	return nil
}
