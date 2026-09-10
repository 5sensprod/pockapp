// backend/migrations/add_promo_price_to_products.go
// ═══════════════════════════════════════════════════════════════════════════
// LE PRIX PROMO EST UN SECOND PRIX — LE PRIX D'ORIGINE NE BOUGE PAS
// ═══════════════════════════════════════════════════════════════════════════
//
// Décision du 10 septembre 2026. `sale_state` (« Soldé », « Promotion ») n'était
// qu'une étiquette : `add_sale_state_to_products.go` annonçait déjà que le jour
// où une remise chiffrée serait demandée, ce serait « un champ de plus ». Le
// voici.
//
// ── POURQUOI UN SECOND CHAMP ET PAS UN `price_ttc` BAISSÉ ──────────────────
// Baisser `price_ttc` perdrait le prix d'origine : ni le ticket, ni la facture,
// ni le client ne sauraient ce qui a été remisé, et retirer la promo
// obligerait à se souvenir de l'ancien prix.
//
// ── COMMENT IL ATTEINT LE TICKET ───────────────────────────────────────────
// Il n'est JAMAIS le prix de la ligne. À l'ajout au panier ou au document, il
// devient une REMISE DE LIGNE sur le prix d'origine — le mécanisme qui existait
// déjà : `unit_price_ttc_before_discount` et `line_discount_ttc` sur la ligne,
// `line_discounts_total_ttc` sur le document, et le Z les additionne dans
// `total_discounts` sans rien recalculer (`reports/cash_reports.go`,
// `aggregateInvoiceIntoTotals`). La TVA porte sur le prix payé, comme pour
// toute remise. AUCUNE règle nouvelle dans le Z.
//
// Il n'est appliqué que si `sale_state` vaut `sale` ou `promo` et s'il est
// strictement inférieur à `price_ttc` : la règle vit dans
// `frontend/lib/pricing/promo-price.ts`, une seule fois.
//
// Le vide (0) veut dire « pas de prix promo ».
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// AddPromoPriceToProducts ajoute `promo_price_ttc` sur products.
//
// Doit tourner APRÈS MigrateCatalogV2, qui recrée la collection. Gardien :
// backend/migrations/ordre_test.go.
func AddPromoPriceToProducts(app *pocketbase.PocketBase) error {
	products, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		log.Println("⚠️ AddPromoPriceToProducts: collection products introuvable")
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	if products.Schema.GetFieldByName("promo_price_ttc") != nil {
		log.Println("✅ promo_price_ttc déjà présent sur products")
		return nil
	}

	products.Schema.AddField(&schema.SchemaField{
		Name:    "promo_price_ttc",
		Type:    schema.FieldTypeNumber,
		Options: &schema.NumberOptions{},
	})

	if err := app.Dao().SaveCollection(products); err != nil {
		return err
	}

	log.Println("✅ Champ promo_price_ttc ajouté sur products")
	return nil
}
