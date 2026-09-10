// backend/migrations/add_stock_reasons_to_product_events.go
// ═══════════════════════════════════════════════════════════════════════════
// UN MOUVEMENT DE STOCK MANUEL DIT POURQUOI
// ═══════════════════════════════════════════════════════════════════════════
//
// Jusqu'au 10 septembre 2026, modifier le stock depuis la fiche produit passait
// par `setCountedStock` et se journalisait `stock_adjusted_inventory`, source
// `inventory_session` : un réassort, une casse et un vrai comptage étaient
// indiscernables dans l'historique. La fiche exige désormais un motif, et
// chaque motif a son type d'événement — c'est ce qui permettra de filtrer et
// d'afficher le suivi de stock d'un produit.
//
// La source reste `manual`, déjà déclarée par `ensureProductEventsCollection`
// et déjà comptée par le garde-fou de purge (`backend/catalog/load/guard.go`).
//
// ⚠️ `ensureProductEventsCollection` sort si la collection existe : modifier sa
// liste de valeurs ne toucherait AUCUNE base installée. D'où cette migration.
// Et un `event_type` absent du select fait échouer la création de l'événement
// — en silence, le journal étant best-effort (`product-events-pocketbase.ts`).
//
// `stock_to_stock_b` est déclaré dès maintenant pour ne pas rouvrir le schéma à
// la mission Stock B ; aucun écran ne l'écrit encore.
package migrations

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// StockReasonEventTypes — un type d'événement par motif manuel.
// Même liste que `eventTypeFor` dans `frontend/lib/queries/stock-adjust.ts`.
var StockReasonEventTypes = []string{
	"stock_restock",    // réassort, réception fournisseur
	"stock_correction", // correction d'inventaire ponctuelle
	"stock_loss",       // casse, perte, vol
	"stock_to_stock_b", // passage en Stock B (mission à venir)
	"stock_other",      // autre, commentaire obligatoire
}

// AddStockReasonsToProductEvents ajoute les motifs manuels au select
// `product_events.event_type`. Idempotente : ne rajoute que ce qui manque.
func AddStockReasonsToProductEvents(app *pocketbase.PocketBase) error {
	events, err := app.Dao().FindCollectionByNameOrId("product_events")
	if err != nil {
		log.Println("⚠️ AddStockReasonsToProductEvents: collection product_events introuvable")
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	field := events.Schema.GetFieldByName("event_type")
	if field == nil {
		return fmt.Errorf("product_events.event_type introuvable")
	}
	options, ok := field.Options.(*schema.SelectOptions)
	if !ok {
		return fmt.Errorf("product_events.event_type n'est pas un select")
	}

	ajoutes := 0
	for _, valeur := range StockReasonEventTypes {
		present := false
		for _, existante := range options.Values {
			if existante == valeur {
				present = true
				break
			}
		}
		if !present {
			options.Values = append(options.Values, valeur)
			ajoutes++
		}
	}

	if ajoutes == 0 {
		log.Println("✅ Motifs de stock déjà présents sur product_events")
		return nil
	}

	if err := app.Dao().SaveCollection(events); err != nil {
		return err
	}

	log.Printf("✅ %d motif(s) de stock ajouté(s) sur product_events.event_type", ajoutes)
	return nil
}
