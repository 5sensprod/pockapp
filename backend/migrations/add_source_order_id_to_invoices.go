// backend/migrations/add_source_order_id_to_invoices.go
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// AddSourceOrderIdToInvoices ajoute le champ source_order_id sur invoices.
// Doit tourner APRÈS ensureOrdersCollection (cf migrations.go).
func AddSourceOrderIdToInvoices(app *pocketbase.PocketBase) error {
	invoicesCol, err := app.Dao().FindCollectionByNameOrId("invoices")
	if err != nil {
		log.Println("⚠️ AddSourceOrderIdToInvoices: collection invoices introuvable")
		return nil // non bloquant
	}

	// Déjà présent → rien à faire
	if invoicesCol.Schema.GetFieldByName("source_order_id") != nil {
		log.Println("✅ source_order_id déjà présent sur invoices")
		return nil
	}

	ordersCol, err := app.Dao().FindCollectionByNameOrId("orders")
	if err != nil {
		// orders n'existe pas encore — fallback text
		log.Println("⚠️ AddSourceOrderIdToInvoices: collection orders introuvable, ajout en Text")
		invoicesCol.Schema.AddField(&schema.SchemaField{
			Name:    "source_order_id",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(50)},
		})
	} else {
		// Relation propre vers orders
		invoicesCol.Schema.AddField(&schema.SchemaField{
			Name: "source_order_id",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  ordersCol.Id,
				MaxSelect:     types.Pointer(1),
				CascadeDelete: false,
			},
		})
	}

	if err := app.Dao().SaveCollection(invoicesCol); err != nil {
		return err
	}

	log.Println("✅ Champ source_order_id ajouté sur invoices")
	return nil
}
