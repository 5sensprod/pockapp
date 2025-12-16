// backend/hooks/inventory_hooks.go
// 📦 Gestion automatique du stock après ventes POS
// Version STUB : Pour l'instant, génère uniquement des logs
// TODO : Implémenter la décrémentation réelle quand l'API produits sera en écriture

package hooks

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func RegisterInventoryHooks(app *pocketbase.PocketBase) {

	// ==========================================================================
	// HOOK : Décrémenter le stock après vente POS
	// ==========================================================================
	app.OnRecordAfterCreateRequest("invoices").Add(func(e *core.RecordCreateEvent) error {
		invoice := e.Record

		// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		// FILTRE 1 : Ne gérer QUE les ventes POS
		// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		cashRegister := invoice.GetString("cash_register")
		if cashRegister == "" {
			// Ce n'est pas une vente POS, on ignore
			return nil
		}

		// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		// FILTRE 2 : Ne gérer QUE les factures validées (pas les brouillons)
		// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		status := invoice.GetString("status")
		if status == "draft" {
			log.Printf("📦 Stock: Brouillon %s ignoré", invoice.GetString("number"))
			return nil
		}

		// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		// FILTRE 3 : Ne gérer QUE les factures (pas les avoirs)
		// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		invoiceType := invoice.GetString("invoice_type")
		if invoiceType == "credit_note" {
			// Pour les avoirs, il faudrait RE-INCRÉMENTER le stock
			// TODO : À implémenter quand l'API sera en écriture
			log.Printf("📦 Stock: Avoir %s → TODO: Réincrémenter stock", invoice.GetString("number"))
			return nil
		}

		log.Printf("📦 Stock: Traitement vente POS %s", invoice.GetString("number"))

		// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		// RÉCUPÉRATION DES ITEMS
		// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		items := invoice.Get("items")
		if items == nil {
			log.Printf("📦 Stock: Aucun item dans la facture")
			return nil
		}

		itemsList, ok := items.([]interface{})
		if !ok {
			log.Printf("📦 Stock: Format items invalide")
			return nil
		}

		// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		// TRAITEMENT DE CHAQUE PRODUIT VENDU
		// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		for i, item := range itemsList {
			itemMap, ok := item.(map[string]interface{})
			if !ok {
				log.Printf("📦 Stock: Item %d invalide", i)
				continue
			}

			// Extraire product_id
			productID, ok := itemMap["product_id"].(string)
			if !ok || productID == "" {
				log.Printf("📦 Stock: Item %d sans product_id", i)
				continue
			}

			// Extraire quantity
			quantity, ok := itemMap["quantity"].(float64)
			if !ok {
				log.Printf("📦 Stock: Item %d sans quantity", i)
				continue
			}

			productName, _ := itemMap["name"].(string)

			// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
			// TODO : DÉCRÉMENTER LE STOCK (quand l'API sera en écriture)
			// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
			log.Printf("📦 TODO: Décrémenter stock - Produit: %s (%s) | Quantité: %.0f",
				productName, productID, quantity)

			// Plus tard, quand l'API produits sera en écriture :
			// if err := decrementStock(app, productID, int(quantity)); err != nil {
			//     log.Printf("⚠️ Erreur décrémentation stock produit %s: %v", productID, err)
			//     // Ne pas bloquer la vente, juste logger l'erreur
			// } else {
			//     log.Printf("✅ Stock décrémenté: %s - %.0f unités", productName, quantity)
			// }
		}

		return nil
	})
}

// ============================================================================
// FONCTION : decrementStock (À implémenter plus tard)
// ============================================================================

// decrementStock décrémente le stock d'un produit dans la collection products
// TODO : À implémenter quand l'API produits sera en écriture
func decrementStock(app *pocketbase.PocketBase, productID string, quantity int) error {
	log.Printf("📦 decrementStock appelé : produit=%s, quantité=%d", productID, quantity)

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// TODO : Code à implémenter quand l'API produits sera en écriture
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	/*
		// ÉTAPE 1 : Récupérer le produit depuis la collection products
		product, err := app.Dao().FindRecordById("products", productID)
		if err != nil {
			return fmt.Errorf("produit introuvable: %w", err)
		}

		// ÉTAPE 2 : Récupérer le stock actuel
		currentStock := product.GetInt("stock_quantity")
		log.Printf("📦 Stock actuel : %d", currentStock)

		// ÉTAPE 3 : Calculer le nouveau stock
		newStock := currentStock - quantity

		// ÉTAPE 4 : Alerter si stock négatif (mais autoriser quand même)
		if newStock < 0 {
			log.Printf("⚠️ ALERTE: Stock négatif pour produit %s: %d", productID, newStock)
			// Possibilité d'envoyer une notification, un email, etc.
		}

		// ÉTAPE 5 : Mettre à jour le stock
		product.Set("stock_quantity", newStock)
		product.Set("last_stock_update", time.Now().Format(time.RFC3339))

		// ÉTAPE 6 : Sauvegarder
		if err := app.Dao().SaveRecord(product); err != nil {
			return fmt.Errorf("erreur sauvegarde stock: %w", err)
		}

		log.Printf("✅ Stock mis à jour : %d → %d", currentStock, newStock)

		// ÉTAPE 7 : Créer un log de mouvement de stock (optionnel)
		if err := createStockMovement(app, productID, quantity, "sale", invoiceNumber); err != nil {
			log.Printf("⚠️ Erreur création log stock: %v", err)
			// Ne pas bloquer, juste logger
		}

		return nil
	*/

	return nil
}

// ============================================================================
// FONCTION : incrementStock (Pour les avoirs - À implémenter plus tard)
// ============================================================================

// incrementStock réincrémente le stock lors d'un avoir (retour produit)
// TODO : À implémenter quand l'API produits sera en écriture
func incrementStock(app *pocketbase.PocketBase, productID string, quantity int) error {
	log.Printf("📦 incrementStock appelé : produit=%s, quantité=%d", productID, quantity)

	// Même logique que decrementStock, mais avec un +

	return nil
}

// ============================================================================
// FONCTION : createStockMovement (Optionnel - À implémenter plus tard)
// ============================================================================

// createStockMovement crée un log de mouvement de stock pour traçabilité
// TODO : À implémenter si vous voulez un historique des mouvements de stock
func createStockMovement(app *pocketbase.PocketBase, productID string, quantity int, movementType string, reference string) error {
	log.Printf("📦 createStockMovement : produit=%s, type=%s, ref=%s", productID, movementType, reference)

	/*
		// Si vous créez une collection "stock_movements" :
		collection, err := app.Dao().FindCollectionByNameOrId("stock_movements")
		if err != nil {
			return err
		}

		record := models.NewRecord(collection)
		record.Set("product_id", productID)
		record.Set("quantity", quantity)
		record.Set("movement_type", movementType) // "sale", "return", "adjustment", etc.
		record.Set("reference", reference) // Numéro de facture, avoir, etc.
		record.Set("created_at", time.Now().Format(time.RFC3339))

		return app.Dao().SaveRecord(record)
	*/

	return nil
}

// ============================================================================
// NOTES D'IMPLÉMENTATION FUTURE
// ============================================================================

/*
QUAND IMPLÉMENTER LA DÉCRÉMENTATION RÉELLE ?

1. Quand l'API produits AppPOS sera en écriture (actuellement lecture seule)
2. OU quand vous aurez une collection "products" dans PocketBase

ÉTAPES D'IMPLÉMENTATION :

1. Décommenter le code dans decrementStock()
2. Vérifier que la collection "products" a un champ "stock_quantity"
3. Tester avec des ventes réelles
4. Ajouter des alertes si stock < seuil_alerte
5. Optionnel : Créer une collection "stock_movements" pour l'historique

ALERTES POSSIBLES :

- Stock négatif : log.Printf + email admin
- Stock bas (< 10) : notification dans l'interface
- Rupture de stock : bloquer la vente (si souhaité)

GESTION DES AVOIRS :

Pour les avoirs (credit_note), il faudra :
1. Détecter invoice_type = "credit_note"
2. Appeler incrementStock() au lieu de decrementStock()
3. Réincrémenter les quantités des produits retournés

EXEMPLE DE COLLECTION stock_movements :

{
  "product_id": "prod-123",
  "quantity": -5,
  "movement_type": "sale",
  "reference": "TIK-2025-000042",
  "user_id": "user-789",
  "created_at": "2025-12-15T14:30:00Z"
}

Cela permet de :
- Tracer tous les mouvements de stock
- Faire des audits
- Détecter des anomalies
- Générer des rapports

SYNCHRONISATION AVEC APPPOS :

Si vous utilisez AppPOS comme source de vérité :
1. Envoyer une requête API à AppPOS pour décrémenter
2. Gérer les erreurs réseau
3. Implémenter un système de retry
4. Logger tous les échecs pour traitement manuel

*/
