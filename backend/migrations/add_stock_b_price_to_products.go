// backend/migrations/add_stock_b_price_to_products.go
// ═══════════════════════════════════════════════════════════════════════════
// LE PRIX D'UNE UNITÉ STOCK B — UNE REMISE, PAS UN PRIX DE LIGNE
// ═══════════════════════════════════════════════════════════════════════════
//
// Décision du 10 septembre 2026, mission 5. Quand la caisse vend une unité du
// Stock B (`stock_b`, `add_stock_b_to_products.go`), elle doit savoir à quel
// prix. Même mécanisme que le prix promo (`add_promo_price_to_products.go`) :
// il devient une REMISE DE LIGNE sur `price_ttc`, le ticket garde le prix
// d'origine, et le Z compte la remise dans `total_discounts` sans règle neuve.
//
// Facultatif : vide (0), aucune remise automatique — le vendeur saisit la
// sienne sur la ligne, comme avant. La règle vit dans
// `frontend/lib/pricing/promo-price.ts` (`prixStockB`).
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// AddStockBPriceToProducts ajoute `stock_b_price_ttc` sur products.
//
// Doit tourner APRÈS MigrateCatalogV2, qui recrée la collection. Gardien :
// backend/migrations/ordre_test.go.
func AddStockBPriceToProducts(app *pocketbase.PocketBase) error {
	products, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		log.Println("⚠️ AddStockBPriceToProducts: collection products introuvable")
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	if products.Schema.GetFieldByName("stock_b_price_ttc") != nil {
		log.Println("✅ stock_b_price_ttc déjà présent sur products")
		return nil
	}

	products.Schema.AddField(&schema.SchemaField{
		Name:    "stock_b_price_ttc",
		Type:    schema.FieldTypeNumber,
		Options: &schema.NumberOptions{},
	})

	if err := app.Dao().SaveCollection(products); err != nil {
		return err
	}

	log.Println("✅ Champ stock_b_price_ttc ajouté sur products")
	return nil
}
