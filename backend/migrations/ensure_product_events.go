package migrations

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ─────────────────────────────────────────────────────────────────────────────
// ensureProductEventsCollection
// Collection : product_events
//
// Journal append-only de tous les événements significatifs autour d'un produit.
// Ne remplace PAS inventory_entries (source de vérité du comptage physique).
// Répond à la question : "Qu'est-il arrivé à ce produit dans le temps ?"
//
// Sources d'écriture prévues :
//   - countAndAdjustProduct()     → stock_adjusted_inventory
//   - updateAppPosProduct()       → stock_updated, price_changed, product_updated…
//   - decrementAppPosProductsStock() → sale
//   - incrementAppPosProductsStock() → return
//   - Futur : sync PocketApp      → sync_apppos
//
// ✅ Idempotent — si la collection existe déjà, les données sont préservées.
// ─────────────────────────────────────────────────────────────────────────────
func ensureProductEventsCollection(app *pocketbase.PocketBase) error {
	const collectionName = "product_events"

	if existing, _ := app.Dao().FindCollectionByNameOrId(collectionName); existing != nil {
		log.Printf("✅ Collection %s déjà présente, conservée telle quelle", collectionName)
		return nil
	}

	log.Printf("📦 Création de la collection %s...", collectionName)

	collection := &models.Collection{
		Name: collectionName,
		Type: models.CollectionTypeBase,

		// Append-only : create autorisé, update/delete interdits
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: nil, // immuable
		DeleteRule: nil, // immuable

		Schema: schema.NewSchema(

			// ── Produit concerné ──────────────────────────────────────────────
			// Clé externe AppPOS (string NeDB). Deviendra une Relation vers
			// la collection PocketBase `products` lors de la migration future.
			&schema.SchemaField{
				Name:     "product_id",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(100)},
			},

			// Snapshot du nom au moment de l'événement.
			// Permet d'afficher l'historique même si le produit est renommé.
			&schema.SchemaField{
				Name:     "product_name_snapshot",
				Type:     schema.FieldTypeText,
				Required: false,
				Options:  &schema.TextOptions{Max: types.Pointer(255)},
			},

			// Snapshot du SKU au moment de l'événement.
			&schema.SchemaField{
				Name:    "product_sku_snapshot",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(100)},
			},

			// ── Type d'événement ──────────────────────────────────────────────
			// Valeur finie et explicite — facilite les filtres et les stats.
			&schema.SchemaField{
				Name:     "event_type",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values: []string{
						// Cycle de vie produit
						"product_created",
						"product_updated",
						// Stock
						"stock_updated",            // modif ponctuelle (UI AppPOS ou admin)
						"stock_adjusted_inventory", // écart appliqué après comptage physique
						"stock_sale",               // décrémentation après vente
						"stock_return",             // incrémentation après retour client
						// Prix
						"purchase_price_changed",
						"sale_price_changed",
						// Fiche produit
						"name_changed",
						"designation_changed",
						"category_changed",
						"sku_changed",
						"barcode_changed",
						// Synchronisation
						"sync_apppos", // resynchronisation depuis AppPOS
					},
				},
			},

			// ── Source de l'événement ─────────────────────────────────────────
			// "Qui a déclenché ça ?" — utile pour filtrer les modifs manuelles
			// des modifs automatiques (inventaire, vente, import…).
			&schema.SchemaField{
				Name:     "source",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values: []string{
						"inventory_session", // ajustement post-comptage
						"sale",              // vente POS
						"return",            // retour client
						"apppos_update",     // modification via UI AppPOS
						"apppos_sync",       // resynchronisation AppPOS → PocketApp
						"manual",            // correction manuelle opérateur
						"import",            // import externe (fichier, API tierce)
					},
				},
			},

			// ID de la source (session_id, sale_id, entry_id…).
			// Permet de remonter à l'entité d'origine.
			&schema.SchemaField{
				Name:    "source_id",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(100)},
			},

			// ── Qui / Quand ───────────────────────────────────────────────────
			// Nom lisible de l'opérateur (pas de FK — AppPOS n'a pas les mêmes
			// users que PocketBase).
			&schema.SchemaField{
				Name:    "operator",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(100)},
			},

			// Timestamp métier de l'événement (≠ created qui est le timestamp PB).
			// Permet de reconstruire une timeline même si les événements sont insérés
			// avec du retard (ex: batch, offline-first).
			&schema.SchemaField{
				Name:     "occurred_at",
				Type:     schema.FieldTypeDate,
				Required: true,
			},

			// ── Valeurs avant / après ─────────────────────────────────────────
			// Structure libre en JSON — on n'impose pas les champs à l'avance
			// car ils varient selon l'event_type.
			//
			// Exemples :
			//   stock_adjusted_inventory → before: {stock: 12}, after: {stock: 9}
			//   sale_price_changed       → before: {price_ttc: 29.90}, after: {price_ttc: 24.90}
			//   category_changed         → before: {category: "Guitares"}, after: {category: "Basses"}
			&schema.SchemaField{
				Name:    "before",
				Type:    schema.FieldTypeJson,
				Options: &schema.JsonOptions{MaxSize: 10240}, // 10 Ko — largement suffisant
			},
			&schema.SchemaField{
				Name:    "after",
				Type:    schema.FieldTypeJson,
				Options: &schema.JsonOptions{MaxSize: 10240},
			},

			// Variation calculée (stock : after - before, prix : after - before…).
			// Dénormalisé pour éviter de recalculer côté client sur des milliers de lignes.
			// Structure : { stock?: number, price_ttc?: number, cost_price?: number }
			&schema.SchemaField{
				Name:    "delta",
				Type:    schema.FieldTypeJson,
				Options: &schema.JsonOptions{MaxSize: 1024},
			},

			// ── Métadonnées contextuelles ─────────────────────────────────────
			// Données supplémentaires spécifiques à la source.
			// Exemples :
			//   inventory_session → { session_id, entry_id, adjusted_at, session_label }
			//   sale              → { ticket_id, quantity_sold, unit_price }
			//   return            → { ticket_id, destination: "restock"|"sav"|"stock_b" }
			&schema.SchemaField{
				Name:    "metadata",
				Type:    schema.FieldTypeJson,
				Options: &schema.JsonOptions{MaxSize: 10240},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return fmt.Errorf("erreur création %s: %w", collectionName, err)
	}

	log.Printf("✅ Collection %s créée avec succès", collectionName)
	return nil
}
