// backend/migrations/add_company_to_users.go
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// AddCompanyToUsers ajoute le champ company (relation) à la collection users
func AddCompanyToUsers(pb *pocketbase.PocketBase) error {
	log.Println("🔗 Migration: Adding company relation to users...")

	// 1. Vérifier que la collection companies existe
	companiesCollection, err := pb.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		log.Println("⚠️ Collection 'companies' not found, skipping migration")
		return nil
	}

	// 2. Récupérer la collection users
	usersCollection, err := pb.Dao().FindCollectionByNameOrId("users")
	if err != nil {
		log.Printf("❌ Collection users not found: %v", err)
		return err
	}

	// 3. Vérifier si le champ company existe déjà
	companyField := usersCollection.Schema.GetFieldByName("company")
	if companyField != nil {
		log.Println("✅ Field 'company' already exists in users collection")
		return nil
	}

	// 4. Ajouter le champ company (relation vers companies)
	usersCollection.Schema.AddField(&schema.SchemaField{
		Name:     "company",
		Type:     schema.FieldTypeRelation,
		Required: false, // Pas obligatoire pour permettre la migration des users existants
		Options: &schema.RelationOptions{
			CollectionId:  companiesCollection.Id,
			CascadeDelete: false, // Ne pas supprimer l'user si l'entreprise est supprimée
			MaxSelect:     nil,   // nil = relation simple (1 seule entreprise)
		},
	})

	if err := pb.Dao().SaveCollection(usersCollection); err != nil {
		log.Printf("❌ Error adding company field to users: %v", err)
		return err
	}

	log.Println("✅ Field 'company' added to users collection")

	// 5. Assigner la première entreprise à tous les users sans entreprise
	assignDefaultCompanyToUsers(pb)

	return nil
}

// assignDefaultCompanyToUsers assigne la première entreprise créée aux users sans entreprise
func assignDefaultCompanyToUsers(pb *pocketbase.PocketBase) {
	log.Println("🔄 Assigning default company to users without company...")

	// Récupérer la première entreprise (la plus ancienne)
	companies, err := pb.Dao().FindRecordsByFilter(
		"companies",
		"id != ''",
		"+created", // La plus ancienne en premier
		1,
		0,
	)
	if err != nil || len(companies) == 0 {
		log.Println("⚠️ No companies found, skipping user assignment")
		return
	}

	defaultCompanyId := companies[0].Id
	log.Printf("📦 Default company: %s (%s)", companies[0].GetString("name"), defaultCompanyId)

	// Récupérer tous les users sans entreprise
	users, err := pb.Dao().FindRecordsByFilter(
		"users",
		"company = '' || company = null",
		"+created",
		500, // Limite raisonnable
		0,
	)
	if err != nil {
		log.Printf("⚠️ Error fetching users without company: %v", err)
		return
	}

	// Assigner l'entreprise par défaut
	for _, user := range users {
		user.Set("company", defaultCompanyId)
		if err := pb.Dao().SaveRecord(user); err != nil {
			log.Printf("⚠️ Error assigning company to user %s: %v", user.GetString("email"), err)
		} else {
			log.Printf("✅ Assigned company to user: %s", user.GetString("email"))
		}
	}

	log.Println("✅ Default company assignment completed")
}
