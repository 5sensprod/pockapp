package migrations

import (
	"fmt"
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
)

// ─────────────────────────────────────────────────────────────────────────────
// ensureInventorySessionsCollection
// Collection : inventory_sessions
// Une session = un inventaire physique avec statut, périmètre et opérateur
// ✅ Idempotent — si la collection existe déjà, les données sont préservées.
// ─────────────────────────────────────────────────────────────────────────────
func ensureInventorySessionsCollection(app *pocketbase.PocketBase) error {
	const collectionName = "inventory_sessions"

	// Si la collection existe déjà → rien à faire, on préserve les données
	existing, _ := app.Dao().FindCollectionByNameOrId(collectionName)
	if existing != nil {
		log.Printf("✅ Collection %s déjà présente, conservée telle quelle", collectionName)
		return nil
	}

	log.Printf("📦 Création de la collection %s...", collectionName)

	collection := &models.Collection{
		Name: collectionName,
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			// ── Statut de la session ─────────────────────────────────────────
			&schema.SchemaField{
				Name:     "status",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"draft", "in_progress", "completed", "cancelled"},
				},
			},
			// ── Dates ────────────────────────────────────────────────────────
			&schema.SchemaField{
				Name:     "started_at",
				Type:     schema.FieldTypeDate,
				Required: true,
			},
			&schema.SchemaField{
				Name:     "completed_at",
				Type:     schema.FieldTypeDate,
				Required: false,
			},
			// ── Opérateur ────────────────────────────────────────────────────
			&schema.SchemaField{
				Name:     "operator",
				Type:     schema.FieldTypeText,
				Required: true,
			},
			// ── Périmètre ────────────────────────────────────────────────────
			&schema.SchemaField{
				Name:     "scope",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"all", "selection"},
				},
			},
			// IDs catégories AppPOS sélectionnées (si scope = "selection")
			&schema.SchemaField{
				Name:     "scope_category_ids",
				Type:     schema.FieldTypeJson,
				Required: false,
				Options:  &schema.JsonOptions{MaxSize: 5242880},
			},
			// IDs catégories dont le comptage est validé (verrouillées)
			&schema.SchemaField{
				Name:     "validated_category_ids",
				Type:     schema.FieldTypeJson,
				Required: false,
				Options:  &schema.JsonOptions{MaxSize: 5242880},
			},
			// Timestamp du gel des stocks théoriques (snapshot AppPOS)
			&schema.SchemaField{
				Name:     "apppos_snapshot_at",
				Type:     schema.FieldTypeDate,
				Required: true,
			},
			// Notes libres de l'opérateur
			&schema.SchemaField{
				Name:     "notes",
				Type:     schema.FieldTypeText,
				Required: false,
			},
			// ── Stats dénormalisées (écrites à la clôture) ───────────────────
			// Permettent d'afficher l'historique sans requêter inventory_entries
			&schema.SchemaField{
				Name:     "stats_total_products",
				Type:     schema.FieldTypeNumber,
				Required: false,
				Options: &schema.NumberOptions{
					Min: func() *float64 { v := float64(0); return &v }(),
				},
			},
			&schema.SchemaField{
				Name:     "stats_counted_products",
				Type:     schema.FieldTypeNumber,
				Required: false,
				Options: &schema.NumberOptions{
					Min: func() *float64 { v := float64(0); return &v }(),
				},
			},
			// Nombre de produits avec écart ≠ 0 après comptage
			&schema.SchemaField{
				Name:     "stats_total_gaps",
				Type:     schema.FieldTypeNumber,
				Required: false,
				Options: &schema.NumberOptions{
					Min: func() *float64 { v := float64(0); return &v }(),
				},
			},
			// Snapshot des noms de catégories inventoriées (pour affichage historique)
			&schema.SchemaField{
				Name:     "stats_category_names",
				Type:     schema.FieldTypeJson,
				Required: false,
				Options:  &schema.JsonOptions{MaxSize: 5242880},
			},
		),
	}

	// Règles d'accès — tout utilisateur authentifié
	emptyRule := ""
	collection.ListRule = &emptyRule
	collection.ViewRule = &emptyRule
	collection.CreateRule = &emptyRule
	collection.UpdateRule = &emptyRule
	collection.DeleteRule = &emptyRule

	if err := app.Dao().SaveCollection(collection); err != nil {
		return fmt.Errorf("erreur création %s: %w", collectionName, err)
	}

	log.Printf("✅ Collection %s créée avec succès", collectionName)
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureInventoryEntriesCollection
// Collection : inventory_entries
// Une entrée = un produit dans une session (snapshot stock + quantité saisie)
// ✅ Idempotent — si la collection existe déjà, les données sont préservées.
// ─────────────────────────────────────────────────────────────────────────────
func ensureInventoryEntriesCollection(app *pocketbase.PocketBase) error {
	const collectionName = "inventory_entries"

	// Si la collection existe déjà → rien à faire, on préserve les données
	existing, _ := app.Dao().FindCollectionByNameOrId(collectionName)
	if existing != nil {
		log.Printf("✅ Collection %s déjà présente, conservée telle quelle", collectionName)
		return nil
	}

	log.Printf("📦 Création de la collection %s...", collectionName)

	// Récupérer l'ID de inventory_sessions pour la relation
	sessionsCollection, err := app.Dao().FindCollectionByNameOrId("inventory_sessions")
	if err != nil || sessionsCollection == nil {
		return fmt.Errorf("la collection inventory_sessions doit exister avant inventory_entries")
	}

	collection := &models.Collection{
		Name: collectionName,
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			// Relation vers la session parente — cascade delete
			&schema.SchemaField{
				Name:     "session_id",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  sessionsCollection.Id,
					CascadeDelete: true,
					MaxSelect:     func() *int { v := 1; return &v }(),
				},
			},
			// ID du produit AppPOS (clé externe string, pas une relation PB)
			&schema.SchemaField{
				Name:     "product_id",
				Type:     schema.FieldTypeText,
				Required: true,
			},
			// Snapshot nom du produit au moment du gel
			&schema.SchemaField{
				Name:     "product_name",
				Type:     schema.FieldTypeText,
				Required: true,
			},
			// Snapshot SKU
			&schema.SchemaField{
				Name:     "product_sku",
				Type:     schema.FieldTypeText,
				Required: false,
			},
			// Snapshot code-barres (pour scan rapide et affichage historique)
			&schema.SchemaField{
				Name:     "product_barcode",
				Type:     schema.FieldTypeText,
				Required: false,
			},
			// Snapshot URL image (pour l'UI de comptage)
			&schema.SchemaField{
				Name:     "product_image",
				Type:     schema.FieldTypeText,
				Required: false,
			},
			// ID de la catégorie AppPOS (clé externe string)
			&schema.SchemaField{
				Name:     "category_id",
				Type:     schema.FieldTypeText,
				Required: true,
			},
			// Snapshot nom de la catégorie
			&schema.SchemaField{
				Name:     "category_name",
				Type:     schema.FieldTypeText,
				Required: true,
			},
			// Stock AppPOS au moment du gel (référence théorique)
			// Required: false — PocketBase rejette 0 comme "missing" sur un Number requis
			&schema.SchemaField{
				Name:     "stock_theorique",
				Type:     schema.FieldTypeNumber,
				Required: false,
				Options: &schema.NumberOptions{
					Min: func() *float64 { v := float64(0); return &v }(),
				},
			},
			// Quantité comptée physiquement (null = pas encore saisie)
			&schema.SchemaField{
				Name:     "stock_compte",
				Type:     schema.FieldTypeNumber,
				Required: false,
				Options: &schema.NumberOptions{
					Min: func() *float64 { v := float64(0); return &v }(),
				},
			},
			// Statut de l'entrée
			&schema.SchemaField{
				Name:     "status",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"pending", "counted"},
				},
			},
			// Timestamp de la saisie
			&schema.SchemaField{
				Name:     "counted_at",
				Type:     schema.FieldTypeDate,
				Required: false,
			},
			// True si l'ajustement AppPOS a été appliqué (écart != 0 et PUT effectué)
			&schema.SchemaField{
				Name:     "adjusted",
				Type:     schema.FieldTypeBool,
				Required: false,
			},
			// Timestamp de l'ajustement AppPOS
			&schema.SchemaField{
				Name:     "adjusted_at",
				Type:     schema.FieldTypeDate,
				Required: false,
			},
		),
	}

	// Règles d'accès — tout utilisateur authentifié
	emptyRule2 := ""
	collection.ListRule = &emptyRule2
	collection.ViewRule = &emptyRule2
	collection.CreateRule = &emptyRule2
	collection.UpdateRule = &emptyRule2
	collection.DeleteRule = &emptyRule2

	if err := app.Dao().SaveCollection(collection); err != nil {
		return fmt.Errorf("erreur création %s: %w", collectionName, err)
	}

	log.Printf("✅ Collection %s créée avec succès", collectionName)
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// backfillInventoryStats
// Parcourt les sessions dont les stats sont à 0 et les recalcule en lisant
// les produits dans inventory_entries.
// ─────────────────────────────────────────────────────────────────────────────
func backfillInventoryStats(app *pocketbase.PocketBase) error {
	log.Println("🔄 Démarrage du rattrapage des statistiques d'inventaire...")

	// 1. Récupérer les sessions (cancelled ou completed) avec 0 produit dans les stats
	var sessions []*models.Record
	err := app.Dao().RecordQuery("inventory_sessions").
		AndWhere(dbx.In("status", "cancelled", "completed")).
		AndWhere(dbx.NewExp("stats_total_products = 0 OR stats_total_products IS NULL")).
		All(&sessions)

	if err != nil {
		return err
	}

	if len(sessions) == 0 {
		log.Println("✅ Aucune session à rattraper.")
		return nil
	}

	log.Printf("🛠️ %d session(s) à mettre à jour...", len(sessions))

	// 2. Pour chaque session, calculer les vraies statistiques
	for _, session := range sessions {
		sessionID := session.Id

		// Récupérer toutes les entrées de cette session
		var entries []*models.Record
		err := app.Dao().RecordQuery("inventory_entries").
			AndWhere(dbx.HashExp{"session_id": sessionID}).
			All(&entries)

		if err != nil {
			log.Printf("❌ Erreur lecture entrées pour session %s: %v", sessionID, err)
			continue
		}

		totalProducts := len(entries)
		if totalProducts == 0 {
			continue // La session est vraiment vide, on l'ignore
		}

		countedProducts := 0
		gapsCount := 0
		categoryMap := make(map[string]bool)

		// Parcourir les produits pour faire les comptes
		for _, entry := range entries {
			// Lister les catégories uniques
			catName := entry.GetString("category_name")
			if catName != "" {
				categoryMap[catName] = true
			}

			// Vérifier les produits comptés et les écarts
			if entry.GetString("status") == "counted" {
				countedProducts++

				// PocketBase stocke les nombres en float64
				stockTheorique := entry.GetFloat("stock_theorique")
				stockCompte := entry.GetFloat("stock_compte")

				if stockCompte != stockTheorique {
					gapsCount++
				}
			}
		}

		// Convertir la map de catégories en tableau de strings
		var categoryNames []string
		for cat := range categoryMap {
			categoryNames = append(categoryNames, cat)
		}

		// 3. Sauvegarder les bons chiffres dans la session
		session.Set("stats_total_products", totalProducts)
		session.Set("stats_counted_products", countedProducts)
		session.Set("stats_total_gaps", gapsCount)
		session.Set("stats_category_names", categoryNames)

		if err := app.Dao().SaveRecord(session); err != nil {
			log.Printf("❌ Erreur sauvegarde session %s: %v", sessionID, err)
		} else {
			log.Printf("✅ Session %s réparée : %d produits trouvés", sessionID, totalProducts)
		}
	}

	log.Println("🎉 Rattrapage terminé !")
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// purgeEmptyInventorySessions
//
// Supprime toutes les sessions d'inventaire dont AUCUN produit n'a été compté.
//
// Critères de suppression :
//   - Sessions "completed" ou "cancelled" avec stats_counted_products = 0
//   - Sessions "draft" ou "in_progress" sans aucune entrée au status "counted"
//     (vérification directe dans inventory_entries car les stats ne sont pas
//     encore écrites pour ces statuts)
//
// Grâce au CascadeDelete sur session_id dans inventory_entries,
// supprimer la session suffit — les entrées sont supprimées automatiquement.
//
// ✅ Idempotent — peut être relancé sans risque.
// ⚠️  Irréversible — faire un backup PocketBase avant en production.
// ─────────────────────────────────────────────────────────────────────────────
func purgeEmptyInventorySessions(app *pocketbase.PocketBase) error {
	log.Println("🧹 Démarrage de la purge des sessions d'inventaire vides...")

	totalDeleted := 0

	// ── 1. Sessions clôturées (completed / cancelled) sans aucun comptage ────
	// Les stats sont dénormalisées à la clôture → on peut filtrer directement.
	var closedSessions []*models.Record
	err := app.Dao().RecordQuery("inventory_sessions").
		AndWhere(dbx.In("status", "completed", "cancelled")).
		AndWhere(dbx.NewExp("stats_counted_products = 0 OR stats_counted_products IS NULL")).
		All(&closedSessions)

	if err != nil {
		log.Printf("❌ Erreur lecture sessions clôturées : %v", err)
		return err
	}

	log.Printf("🔍 %d session(s) clôturée(s) sans comptage trouvée(s)", len(closedSessions))

	for _, session := range closedSessions {
		sessionID := session.Id
		operator := session.GetString("operator")
		status := session.GetString("status")
		startedAt := session.GetString("started_at")

		log.Printf(
			"🗑️  Suppression session clôturée [%s] status=%s opérateur=%s démarrée=%s",
			sessionID, status, operator, startedAt,
		)

		if err := app.Dao().DeleteRecord(session); err != nil {
			log.Printf("❌ Erreur suppression session %s : %v", sessionID, err)
			// On continue — une erreur sur une session ne bloque pas les autres
			continue
		}

		totalDeleted++
	}

	// ── 2. Sessions actives (draft / in_progress) sans aucune entrée comptée ─
	// Les stats ne sont pas encore écrites → on doit requêter inventory_entries.
	var activeSessions []*models.Record
	err = app.Dao().RecordQuery("inventory_sessions").
		AndWhere(dbx.In("status", "draft", "in_progress")).
		All(&activeSessions)

	if err != nil {
		log.Printf("❌ Erreur lecture sessions actives : %v", err)
		return err
	}

	log.Printf("🔍 %d session(s) active(s) à vérifier", len(activeSessions))

	for _, session := range activeSessions {
		sessionID := session.Id
		operator := session.GetString("operator")
		status := session.GetString("status")

		// Compter les entrées "counted" pour cette session
		var countedEntries []*models.Record
		err := app.Dao().RecordQuery("inventory_entries").
			AndWhere(dbx.HashExp{"session_id": sessionID}).
			AndWhere(dbx.HashExp{"status": "counted"}).
			All(&countedEntries)

		if err != nil {
			log.Printf("❌ Erreur lecture entrées session %s : %v", sessionID, err)
			continue
		}

		if len(countedEntries) > 0 {
			// Au moins un produit compté → on garde la session
			log.Printf(
				"✅ Session active [%s] conservée (%d produits comptés)",
				sessionID, len(countedEntries),
			)
			continue
		}

		// Aucun comptage → suppression
		log.Printf(
			"🗑️  Suppression session active [%s] status=%s opérateur=%s (0 produit compté)",
			sessionID, status, operator,
		)

		if err := app.Dao().DeleteRecord(session); err != nil {
			log.Printf("❌ Erreur suppression session %s : %v", sessionID, err)
			continue
		}

		totalDeleted++
	}

	// ── Résumé ───────────────────────────────────────────────────────────────
	if totalDeleted == 0 {
		log.Println("✅ Aucune session vide à supprimer.")
	} else {
		log.Printf("🎉 Purge terminée : %d session(s) supprimée(s) (entries supprimées par cascade).", totalDeleted)
	}

	return nil
}
