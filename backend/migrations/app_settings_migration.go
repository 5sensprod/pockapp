// backend/migrations/app_settings_migration.go
// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION - COLLECTION app_settings
// ═══════════════════════════════════════════════════════════════════════════
// Cette collection stocke les paramètres de l'application et les secrets
// chiffrés (clés API, tokens, etc.)
// ═══════════════════════════════════════════════════════════════════════════

package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
)

// MigrateAppSettings crée la collection app_settings si elle n'existe pas
func MigrateAppSettings(pb *pocketbase.PocketBase) error {
	log.Println("🔄 Checking app_settings collection...")

	// Vérifier si la collection existe déjà
	existing, _ := pb.Dao().FindCollectionByNameOrId("app_settings")
	if existing != nil {
		log.Println("✅ Collection app_settings already exists")
		return nil
	}

	log.Println("📦 Creating app_settings collection...")

	collection := &models.Collection{
		Name:       "app_settings",
		Type:       models.CollectionTypeBase,
		ListRule:   nil, // Pas de lecture publique
		ViewRule:   nil, // Pas de vue publique
		CreateRule: nil, // Pas de création publique
		UpdateRule: nil, // Pas de mise à jour publique
		DeleteRule: nil, // Pas de suppression publique
		Schema: schema.NewSchema(
			// Clé unique du setting
			&schema.SchemaField{
				Name:     "key",
				Type:     schema.FieldTypeText,
				Required: true,
				Unique:   true,
				Options: &schema.TextOptions{
					Min: ptrInt(1),
					Max: ptrInt(100),
				},
			},
			// Valeur (chiffrée si sensible)
			&schema.SchemaField{
				Name:     "value",
				Type:     schema.FieldTypeText,
				Required: true,
				Options: &schema.TextOptions{
					Max: ptrInt(10000), // Permet des valeurs assez longues (base64)
				},
			},
			// Indique si la valeur est chiffrée
			&schema.SchemaField{
				Name:     "encrypted",
				Type:     schema.FieldTypeBool,
				Required: false,
			},
			// Description optionnelle
			&schema.SchemaField{
				Name:     "description",
				Type:     schema.FieldTypeText,
				Required: false,
				Options: &schema.TextOptions{
					Max: ptrInt(500),
				},
			},
			// Catégorie pour organiser les settings
			&schema.SchemaField{
				Name:     "category",
				Type:     schema.FieldTypeText,
				Required: false,
				Options: &schema.TextOptions{
					Max: ptrInt(50),
				},
			},
		),
	}

	if err := pb.Dao().SaveCollection(collection); err != nil {
		log.Printf("❌ Error creating app_settings collection: %v", err)
		return err
	}

	log.Println("✅ Collection app_settings created successfully")

	// Créer un index sur la clé pour des recherches rapides
	// Note: L'unicité est déjà gérée par le champ "unique: true"

	return nil
}

// ptrInt retourne un pointeur vers un int (helper pour schema options)
func ptrInt(i int) *int {
	return &i
}

// MigrateAppSettingsAddCategory ajoute le champ category si manquant (migration incrémentale)
func MigrateAppSettingsAddCategory(pb *pocketbase.PocketBase) error {
	collection, err := pb.Dao().FindCollectionByNameOrId("app_settings")
	if err != nil {
		return nil // Collection n'existe pas encore
	}

	// Vérifier si le champ category existe
	for _, field := range collection.Schema.Fields() {
		if field.Name == "category" {
			return nil // Champ existe déjà
		}
	}

	log.Println("🔄 Adding category field to app_settings...")

	collection.Schema.AddField(&schema.SchemaField{
		Name:     "category",
		Type:     schema.FieldTypeText,
		Required: false,
		Options: &schema.TextOptions{
			Max: ptrInt(50),
		},
	})

	if err := pb.Dao().SaveCollection(collection); err != nil {
		log.Printf("❌ Error adding category field: %v", err)
		return err
	}

	log.Println("✅ Category field added to app_settings")
	return nil
}
