package routes

import (
	"sync"
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/migrate"
)

// Deux postes qui vendent le même produit en même temps doivent retirer deux
// unités. C'est LA règle du 19 août 2026, et elle n'a pas d'autre gardien.
func TestMouvementsConcurrentsNeSEcrasentPas(t *testing.T) {
	app := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir: t.TempDir(),
	})
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	defer app.ResetBootstrapState()

	// Bootstrap ouvre la base ; il ne crée pas les tables système. En
	// fonctionnement c'est `app.Start()` qui les pose.
	runner, err := migrate.NewRunner(app.DB(), migrations.AppMigrations)
	if err != nil {
		t.Fatalf("runner: %v", err)
	}
	if _, err := runner.Up(); err != nil {
		t.Fatalf("migrations système: %v", err)
	}

	col := &models.Collection{Name: "products", Type: models.CollectionTypeBase}
	col.Schema = schema.NewSchema(
		&schema.SchemaField{Name: "name", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "sku", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "legacy_id", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "stock", Type: schema.FieldTypeNumber},
	)
	if err := app.Dao().SaveCollection(col); err != nil {
		t.Fatalf("collection products: %v", err)
	}

	rec := models.NewRecord(col)
	rec.Set("name", "Ampli")
	rec.Set("legacy_id", "nedb1")
	rec.Set("stock", 100.0)
	if err := app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("produit: %v", err)
	}

	const ventes = 60

	var wg sync.WaitGroup
	for i := 0; i < ventes; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Une vente sur deux désigne le produit par sa clé NeDB : les deux
			// chemins de résolution doivent se sérialiser pareil.
			cle := rec.Id
			if i%2 == 0 {
				cle = "nedb1"
			}
			applyOneMovement(app, StockMovementInput{
				ProductID: cle,
				Delta:     ptr(-1),
			})
		}()
	}
	wg.Wait()

	final, err := app.Dao().FindRecordById("products", rec.Id)
	if err != nil {
		t.Fatalf("relecture: %v", err)
	}

	if got := final.GetFloat("stock"); got != 100-ventes {
		t.Fatalf(
			"stock final %v, attendu %v — des mouvements se sont écrasés",
			got, 100-ventes,
		)
	}
}
