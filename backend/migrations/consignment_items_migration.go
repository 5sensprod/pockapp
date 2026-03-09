package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// EnsureConsignmentItemsCollection crée la collection consignment_items si elle n'existe pas.
// Un consignment_item représente un instrument d'occasion déposé par un client (dépôt-vente).
func EnsureConsignmentItemsCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("consignment_items"); err == nil {
		log.Println("📦 Collection 'consignment_items' existe déjà")
		return nil
	}

	customersCol, err := app.Dao().FindCollectionByNameOrId("customers")
	if err != nil {
		return err
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	log.Println("📦 Création de la collection 'consignment_items'...")

	collection := &models.Collection{
		Name:       "consignment_items",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != ''"),
		Schema: schema.NewSchema(
			// Description de l'instrument
			&schema.SchemaField{
				Name:     "description",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(1000)},
			},

			// Prix souhaité par le vendeur (client)
			&schema.SchemaField{
				Name:     "seller_price",
				Type:     schema.FieldTypeNumber,
				Required: true,
				Options: &schema.NumberOptions{
					Min: types.Pointer(float64(0)),
				},
			},

			// Prix de vente affiché en magasin
			&schema.SchemaField{
				Name:     "store_price",
				Type:     schema.FieldTypeNumber,
				Required: true,
				Options: &schema.NumberOptions{
					Min: types.Pointer(float64(0)),
				},
			},

			// Statut du dépôt
			&schema.SchemaField{
				Name:     "status",
				Type:     schema.FieldTypeSelect,
				Required: false,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"available", "sold", "returned"},
				},
			},

			// Notes internes
			&schema.SchemaField{
				Name:    "notes",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(2000)},
			},

			// Relation vers le client déposant
			&schema.SchemaField{
				Name:     "customer",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  customersCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},

			// Relation vers l'entreprise propriétaire du magasin
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
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'consignment_items' créée")
	return nil
}
