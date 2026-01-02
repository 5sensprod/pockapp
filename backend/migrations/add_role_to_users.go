package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

func AddRoleToUsers(pb *pocketbase.PocketBase) error {
	collection, err := pb.Dao().FindCollectionByNameOrId("users")
	if err != nil {
		log.Printf("Collection users not found, skipping role migration")
		return nil
	}

	// 1) Add role field if missing (NOT required initially)
	roleField := collection.Schema.GetFieldByName("role")
	if roleField == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:     "role",
			Type:     schema.FieldTypeSelect,
			Required: false, // important: backfill first
			System:   false,
			Options: &schema.SelectOptions{
				MaxSelect: 1,
				Values: []string{
					"admin",
					"manager",
					"caissier",
					"user",
				},
			},
		})

		if err := pb.Dao().SaveCollection(collection); err != nil {
			log.Printf("Error adding role field to users: %v", err)
			return err
		}
		log.Println("✅ Field 'role' added to users collection (temporary: not required)")
	}

	// Reload (safe) in case schema changed
	collection, _ = pb.Dao().FindCollectionByNameOrId("users")

	// 2) Find first user (oldest) => admin
	firstUsers, err := pb.Dao().FindRecordsByFilter(
		collection.Id,
		"",         // no filter
		"+created", // oldest first
		1,          // limit 1
		0,
	)
	if err != nil {
		log.Printf("Error fetching first user: %v", err)
		return nil
	}

	var firstUserId string
	if len(firstUsers) == 1 {
		firstUserId = firstUsers[0].Id
		firstUsers[0].Set("role", "admin")
		if err := pb.Dao().SaveRecord(firstUsers[0]); err != nil {
			log.Printf("Error setting first user as admin: %v", err)
		} else {
			log.Printf("✅ First user promoted to admin: %s", firstUsers[0].GetString("email"))
		}
	}

	// 3) Backfill everyone missing role => user (except first user)
	records, err := pb.Dao().FindRecordsByFilter(
		collection.Id,
		`role = "" || role = null`,
		"+created",
		0,
		0,
	)
	if err != nil {
		log.Printf("Error fetching users without role: %v", err)
		return nil
	}

	for _, r := range records {
		if r.Id == firstUserId {
			continue
		}
		r.Set("role", "user")
		if err := pb.Dao().SaveRecord(r); err != nil {
			log.Printf("Error updating user role: %v", err)
		}
	}

	// 4) Now make role required
	roleField = collection.Schema.GetFieldByName("role")
	if roleField != nil && !roleField.Required {
		roleField.Required = true
		if err := pb.Dao().SaveCollection(collection); err != nil {
			log.Printf("Error making role required: %v", err)
			return err
		}
		log.Println("✅ Field 'role' is now required")
	}

	return nil
}
