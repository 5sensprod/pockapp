// backend/migrations/add_consignor_to_products.go
//
// Le déposant d'un produit d'occasion est un client, pas un fournisseur.
// Une relation conserve l'identité du particulier si son nom change, là où un
// texte libre deviendrait orphelin. Elle reste facultative : presque tous les
// produits du catalogue n'ont aucun déposant.
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// AddConsignorToProducts ajoute la relation facultative `consignor` vers
// `customers`. Elle doit tourner après MigrateCatalogV2, qui recrée products.
func AddConsignorToProducts(app *pocketbase.PocketBase) error {
	products, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		log.Println("⚠️ AddConsignorToProducts: collection products introuvable")
		return nil
	}

	if products.Schema.GetFieldByName("consignor") != nil {
		log.Println("✅ consignor déjà présent sur products")
		return nil
	}

	customers, err := app.Dao().FindCollectionByNameOrId("customers")
	if err != nil {
		log.Println("⚠️ AddConsignorToProducts: collection customers introuvable")
		return nil
	}

	products.Schema.AddField(&schema.SchemaField{
		Name: "consignor",
		Type: schema.FieldTypeRelation,
		Options: &schema.RelationOptions{
			CollectionId:  customers.Id,
			MaxSelect:     types.Pointer(1),
			CascadeDelete: false,
		},
	})

	if err := app.Dao().SaveCollection(products); err != nil {
		return err
	}

	log.Println("✅ Champ consignor ajouté sur products (relation facultative vers customers)")
	return nil
}
