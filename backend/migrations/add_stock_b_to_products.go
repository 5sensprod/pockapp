// backend/migrations/add_stock_b_to_products.go
// ═══════════════════════════════════════════════════════════════════════════
// LE STOCK B EST UNE SECONDE QUANTITÉ, PAS UN ÉTAT DU PRODUIT
// ═══════════════════════════════════════════════════════════════════════════
//
// Décision du 10 septembre 2026. Un même produit peut avoir 5 unités neuves et
// 2 unités B-stock (ouvertes, rayées, retour client fonctionnel), et la caisse
// doit pouvoir vendre l'une ou l'autre. Une valeur de plus dans
// `commercial_state` rendrait ce cas inexprimable : l'état porte sur la fiche
// entière, pas sur une partie de ses unités.
//
// On garde donc UNE fiche — même code-barres, mêmes images, même page en
// ligne — et deux compteurs : `stock` (neuf, inchangé) et `stock_b`.
//
// ⚠️ `stock_b` ne s'écrit JAMAIS par l'API REST ni par un patch de fiche : il
// bouge par `POST /api/stock/adjust`, comme `stock`, et pour la même raison
// (deux postes). Le passage neuf → B y est un seul mouvement, dans une seule
// transaction, avec un seul événement portant les deux deltas.
//
// Le vide vaut zéro : aucun rattrapage des ~3000 fiches.
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// AddStockBToProducts ajoute `stock_b` sur products.
//
// Doit tourner APRÈS MigrateCatalogV2, qui recrée la collection. Gardien :
// backend/migrations/ordre_test.go.
func AddStockBToProducts(app *pocketbase.PocketBase) error {
	products, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		log.Println("⚠️ AddStockBToProducts: collection products introuvable")
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	if products.Schema.GetFieldByName("stock_b") != nil {
		log.Println("✅ stock_b déjà présent sur products")
		return nil
	}

	products.Schema.AddField(&schema.SchemaField{
		Name:    "stock_b",
		Type:    schema.FieldTypeNumber,
		Options: &schema.NumberOptions{NoDecimal: true},
	})

	if err := app.Dao().SaveCollection(products); err != nil {
		return err
	}

	log.Println("✅ Champ stock_b ajouté sur products")
	return nil
}
