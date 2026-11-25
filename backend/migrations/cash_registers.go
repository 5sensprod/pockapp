package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// adminRule : écrire une caisse est réservé au rôle administrateur — une
// seconde caisse ou une caisse désactivée casse l'encaissement. Lire reste
// ouvert à tout utilisateur connecté (le terminal choisit sa caisse).
const adminRule = "@request.auth.role = 'admin'"

// ensureCashRegistersCollection crée ou met à jour la collection cash_registers
func ensureCashRegistersCollection(app *pocketbase.PocketBase) error {
	// Essayer de récupérer la collection existante
	collection, err := app.Dao().FindCollectionByNameOrId("cash_registers")

	if err != nil {
		// La collection n'existe pas, la créer
		log.Println("📦 Création de la collection 'cash_registers'...")

		companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
		if err != nil {
			return err
		}

		collection = &models.Collection{
			Name:       "cash_registers",
			Type:       models.CollectionTypeBase,
			ListRule:   types.Pointer("@request.auth.id != ''"),
			ViewRule:   types.Pointer("@request.auth.id != ''"),
			CreateRule: types.Pointer(adminRule),
			UpdateRule: types.Pointer(adminRule),
			DeleteRule: types.Pointer(adminRule),
			Schema: schema.NewSchema(
				// Nom lisible de la caisse
				&schema.SchemaField{
					Name:     "name",
					Type:     schema.FieldTypeText,
					Required: true,
					Options:  &schema.TextOptions{Max: types.Pointer(100)},
				},
				// Code court (POS-001, BAR-01, etc.)
				&schema.SchemaField{
					Name:    "code",
					Type:    schema.FieldTypeText,
					Unique:  true,
					Options: &schema.TextOptions{Max: types.Pointer(50)},
				},
				// Magasin / entreprise propriétaire
				&schema.SchemaField{
					Name:     "owner_company",
					Type:     schema.FieldTypeRelation,
					Required: true,
					Options: &schema.RelationOptions{
						CollectionId:  companiesCol.Id,
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},
				// Info libre de localisation
				&schema.SchemaField{
					Name:    "location",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(255)},
				},
				// Actif / désactivé
				&schema.SchemaField{
					Name: "is_active",
					Type: schema.FieldTypeBool,
				},
				// Configuration POS (JSON libre)
				&schema.SchemaField{
					Name: "settings",
					Type: schema.FieldTypeJson,
				},
			),
		}

		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'cash_registers' créée")
		return nil
	}

	// La collection existe, mettre à jour les règles si nécessaires
	log.Println("📦 Collection 'cash_registers' existe déjà, mise à jour des règles...")

	needsUpdate := false
	authRule := "@request.auth.id != ''"

	// Vérifier et mettre à jour chaque règle
	if collection.ListRule == nil || *collection.ListRule != authRule {
		collection.ListRule = types.Pointer(authRule)
		needsUpdate = true
	}
	if collection.ViewRule == nil || *collection.ViewRule != authRule {
		collection.ViewRule = types.Pointer(authRule)
		needsUpdate = true
	}
	if collection.CreateRule == nil || *collection.CreateRule != adminRule {
		collection.CreateRule = types.Pointer(adminRule)
		needsUpdate = true
	}
	if collection.UpdateRule == nil || *collection.UpdateRule != adminRule {
		collection.UpdateRule = types.Pointer(adminRule)
		needsUpdate = true
	}
	if collection.DeleteRule == nil || *collection.DeleteRule != adminRule {
		collection.DeleteRule = types.Pointer(adminRule)
		needsUpdate = true
	}

	if needsUpdate {
		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Règles de 'cash_registers' mises à jour")
	} else {
		log.Println("✅ Collection 'cash_registers' OK (règles déjà présentes)")
	}

	return nil
}
