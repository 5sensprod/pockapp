package routes

import (
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/migrate"
)

// appJournal monte un PocketBase avec `products` et `product_events`, le select
// de ce dernier réduit à ce que les tests utilisent.
func appJournal(t *testing.T) (*pocketbase.PocketBase, *models.Record) {
	t.Helper()
	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	t.Cleanup(func() { app.ResetBootstrapState() })

	runner, err := migrate.NewRunner(app.DB(), migrations.AppMigrations)
	if err != nil {
		t.Fatalf("runner: %v", err)
	}
	if _, err := runner.Up(); err != nil {
		t.Fatalf("migrations système: %v", err)
	}

	produits := &models.Collection{Name: "products", Type: models.CollectionTypeBase}
	produits.Schema = schema.NewSchema(
		&schema.SchemaField{Name: "name", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "sku", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "legacy_id", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "stock", Type: schema.FieldTypeNumber},
		&schema.SchemaField{Name: "stock_b", Type: schema.FieldTypeNumber},
	)
	if err := app.Dao().SaveCollection(produits); err != nil {
		t.Fatalf("collection products: %v", err)
	}

	evenements := &models.Collection{Name: "product_events", Type: models.CollectionTypeBase}
	evenements.Schema = schema.NewSchema(
		&schema.SchemaField{Name: "product_id", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "product_name_snapshot", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "product_sku_snapshot", Type: schema.FieldTypeText},
		&schema.SchemaField{
			Name: "event_type", Type: schema.FieldTypeSelect,
			Options: &schema.SelectOptions{MaxSelect: 1, Values: []string{"stock_sale", "stock_restock", "stock_return", "stock_to_stock_b"}},
		},
		&schema.SchemaField{
			Name: "source", Type: schema.FieldTypeSelect,
			Options: &schema.SelectOptions{MaxSelect: 1, Values: []string{"sale", "manual", "return"}},
		},
		&schema.SchemaField{Name: "source_id", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "operator", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "occurred_at", Type: schema.FieldTypeDate},
		&schema.SchemaField{Name: "before", Type: schema.FieldTypeJson, Options: &schema.JsonOptions{MaxSize: 10240}},
		&schema.SchemaField{Name: "after", Type: schema.FieldTypeJson, Options: &schema.JsonOptions{MaxSize: 10240}},
		&schema.SchemaField{Name: "delta", Type: schema.FieldTypeJson, Options: &schema.JsonOptions{MaxSize: 1024}},
		&schema.SchemaField{Name: "metadata", Type: schema.FieldTypeJson, Options: &schema.JsonOptions{MaxSize: 10240}},
	)
	if err := app.Dao().SaveCollection(evenements); err != nil {
		t.Fatalf("collection product_events: %v", err)
	}

	rec := models.NewRecord(produits)
	rec.Set("name", "Ampli")
	rec.Set("sku", "AMP-1")
	rec.Set("legacy_id", "nedb1")
	rec.Set("stock", 10.0)
	if err := app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("produit: %v", err)
	}
	return app, rec
}

func evenementsDe(t *testing.T, app *pocketbase.PocketBase, productID string) []*models.Record {
	t.Helper()
	recs, err := app.Dao().FindRecordsByExpr("product_events")
	if err != nil {
		t.Fatalf("lecture du journal: %v", err)
	}
	var out []*models.Record
	for _, r := range recs {
		if r.GetString("product_id") == productID {
			out = append(out, r)
		}
	}
	return out
}

func stockDe(t *testing.T, app *pocketbase.PocketBase, id string) float64 {
	t.Helper()
	r, err := app.Dao().FindRecordById("products", id)
	if err != nil {
		t.Fatalf("relecture produit: %v", err)
	}
	return r.GetFloat("stock")
}

func TestLeMouvementEstJournaliseDansSaTransaction(t *testing.T) {
	app, produit := appJournal(t)

	res := applyOneMovement(app, StockMovementInput{
		ProductID: "nedb1", // par la clé NeDB : l'événement porte l'id PocketBase
		Delta:     ptr(-2),
		Metadata:  map[string]any{"quantity_sold": 2},
	}, &StockJournalInput{
		EventType: "stock_sale",
		Source:    "sale",
		SourceID:  "ticket-1",
		Metadata:  map[string]any{"origin": "caisse", "quantity_sold": 99},
	})

	if !res.Applied || res.Error != "" {
		t.Fatalf("mouvement non appliqué : %+v", res)
	}
	evs := evenementsDe(t, app, produit.Id)
	if len(evs) != 1 {
		t.Fatalf("attendu 1 événement, obtenu %d", len(evs))
	}
	ev := evs[0]
	if ev.GetString("event_type") != "stock_sale" || ev.GetString("source_id") != "ticket-1" {
		t.Errorf("événement mal qualifié : %v", ev.PublicExport())
	}
	if ev.GetString("product_name_snapshot") != "Ampli" || ev.GetString("product_sku_snapshot") != "AMP-1" {
		t.Errorf("le nom du produit doit remplacer un nom absent : %v", ev.PublicExport())
	}
	var delta, meta map[string]any
	if err := ev.UnmarshalJSONField("delta", &delta); err != nil || delta["stock"] != -2.0 {
		t.Errorf("delta attendu -2, obtenu %v (%v)", delta, err)
	}
	if err := ev.UnmarshalJSONField("metadata", &meta); err != nil {
		t.Fatalf("metadata: %v", err)
	}
	// La ligne prime sur le lot.
	if meta["quantity_sold"] != 2.0 || meta["origin"] != "caisse" {
		t.Errorf("fusion des métadonnées incorrecte : %v", meta)
	}
}

func TestUnJournalRefuseAnnuleLeMouvement(t *testing.T) {
	// La règle du 10 septembre 2026 : plus de stock modifié sans trace.
	app, produit := appJournal(t)

	res := applyOneMovement(app, StockMovementInput{
		ProductID: produit.Id,
		Absolute:  ptr(3),
	}, &StockJournalInput{EventType: "stock_loss", Source: "manual"})

	if res.Applied || res.Error == "" {
		t.Fatalf("un type absent du schéma doit être refusé : %+v", res)
	}
	if res.StockBefore != nil || res.StockAfter != nil {
		t.Errorf("les bornes d'un mouvement annulé ne doivent pas être rendues : %+v", res)
	}
	if got := stockDe(t, app, produit.Id); got != 10 {
		t.Fatalf("stock %v : le mouvement aurait dû être annulé avec son journal", got)
	}
	if n := len(evenementsDe(t, app, produit.Id)); n != 0 {
		t.Fatalf("%d événement(s) écrit(s) pour un mouvement annulé", n)
	}
}

func TestUnComptageConformeNeJournaliseRien(t *testing.T) {
	app, produit := appJournal(t)

	res := applyOneMovement(app, StockMovementInput{
		ProductID: produit.Id,
		Absolute:  ptr(10),
	}, &StockJournalInput{EventType: "stock_restock", Source: "manual"})

	if res.Applied {
		t.Fatalf("un stock inchangé n'est pas un mouvement : %+v", res)
	}
	if n := len(evenementsDe(t, app, produit.Id)); n != 0 {
		t.Fatalf("%d événement(s) pour un stock inchangé", n)
	}
}

func TestSansJournalRienNEstEcrit(t *testing.T) {
	app, produit := appJournal(t)

	res := applyOneMovement(app, StockMovementInput{ProductID: produit.Id, Delta: ptr(1)}, nil)
	if !res.Applied {
		t.Fatalf("mouvement non appliqué : %+v", res)
	}
	if n := len(evenementsDe(t, app, produit.Id)); n != 0 {
		t.Fatalf("la route ne doit pas deviner un motif : %d événement(s)", n)
	}
}

func stockBDe(t *testing.T, app *pocketbase.PocketBase, id string) float64 {
	t.Helper()
	r, err := app.Dao().FindRecordById("products", id)
	if err != nil {
		t.Fatalf("relecture produit: %v", err)
	}
	return r.GetFloat("stock_b")
}

func TestLePassageEnStockBEstUnSeulMouvement(t *testing.T) {
	// −3 neuf, +3 B, UN événement : pas une perte suivie d'un réassort.
	app, produit := appJournal(t)

	res := applyOneMovement(app, StockMovementInput{
		ProductID:   produit.Id,
		TransferToB: ptr(3),
	}, &StockJournalInput{EventType: "stock_to_stock_b", Source: "manual"})

	if !res.Applied || res.Error != "" {
		t.Fatalf("transfert non appliqué : %+v", res)
	}
	if got := stockDe(t, app, produit.Id); got != 7 {
		t.Errorf("stock neuf %v, attendu 7", got)
	}
	if got := stockBDe(t, app, produit.Id); got != 3 {
		t.Errorf("stock B %v, attendu 3", got)
	}
	evs := evenementsDe(t, app, produit.Id)
	if len(evs) != 1 {
		t.Fatalf("attendu 1 événement, obtenu %d", len(evs))
	}
	var delta map[string]any
	if err := evs[0].UnmarshalJSONField("delta", &delta); err != nil {
		t.Fatalf("delta: %v", err)
	}
	if delta["stock"] != -3.0 || delta["stock_b"] != 3.0 {
		t.Errorf("l'événement doit porter les deux deltas : %v", delta)
	}
}

func TestUnTransfertNePrendPasAuNeufCeQuIlNAPas(t *testing.T) {
	app, produit := appJournal(t)

	res := applyOneMovement(app, StockMovementInput{
		ProductID:   produit.Id,
		TransferToB: ptr(11),
	}, &StockJournalInput{EventType: "stock_to_stock_b", Source: "manual"})

	if res.Applied || res.Error == "" {
		t.Fatalf("11 unités ne se prennent pas sur 10 : %+v", res)
	}
	if got := stockDe(t, app, produit.Id); got != 10 {
		t.Errorf("stock neuf %v : rien n'aurait dû bouger", got)
	}
	if got := stockBDe(t, app, produit.Id); got != 0 {
		t.Errorf("stock B %v : rien n'aurait dû bouger", got)
	}
}

func TestUnRetourClasseStockBAlimenteLeCompteurB(t *testing.T) {
	app, produit := appJournal(t)

	res := applyOneMovement(app, StockMovementInput{
		ProductID: produit.Id,
		Counter:   "stock_b",
		Delta:     ptr(2),
		Metadata:  map[string]any{"destination": "stock_b"},
	}, &StockJournalInput{EventType: "stock_return", Source: "return"})

	if !res.Applied {
		t.Fatalf("retour non appliqué : %+v", res)
	}
	if got := stockDe(t, app, produit.Id); got != 10 {
		t.Errorf("le neuf ne doit pas bouger : %v", got)
	}
	if got := stockBDe(t, app, produit.Id); got != 2 {
		t.Errorf("stock B %v, attendu 2", got)
	}
}

func TestNextCounters(t *testing.T) {
	cas := []struct {
		nom      string
		mvt      StockMovementInput
		neuf, b  float64
		enErreur bool
	}{
		{"le neuf par défaut", StockMovementInput{Delta: ptr(-1)}, 9, 2, false},
		{"le compteur B nommé", StockMovementInput{Counter: "stock_b", Absolute: ptr(5)}, 10, 5, false},
		{"un transfert", StockMovementInput{TransferToB: ptr(4)}, 6, 6, false},
		{"le transfert prime sur le reste", StockMovementInput{TransferToB: ptr(1), Delta: ptr(-9), Counter: "stock_b"}, 9, 3, false},
		{"pas de transfert fractionnaire", StockMovementInput{TransferToB: ptr(1.5)}, 10, 2, true},
		{"pas de transfert nul", StockMovementInput{TransferToB: ptr(0)}, 10, 2, true},
		{"un compteur inconnu", StockMovementInput{Counter: "stock_c", Delta: ptr(1)}, 10, 2, true},
	}
	for _, c := range cas {
		neuf, b, err := NextCounters(10, 2, c.mvt)
		if (err != nil) != c.enErreur {
			t.Errorf("%s : erreur %v, attendue %v", c.nom, err, c.enErreur)
			continue
		}
		if !c.enErreur && (neuf != c.neuf || b != c.b) {
			t.Errorf("%s : obtenu %v/%v, attendu %v/%v", c.nom, neuf, b, c.neuf, c.b)
		}
	}
}
