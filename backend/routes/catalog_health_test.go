package routes

import (
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/migrate"
)

func TestProductHealthScore(t *testing.T) {
	complete := productHealthValues{
		Name:        "Guitare folk",
		Description: "<p>Prête à jouer.</p>",
		Image:       "guitare.webp",
		Categories:  []string{"guitares"},
		PriceTTC:    299,
		Slug:        "guitare-folk",
	}
	if got := productHealthScore(complete); got != productHealthMax {
		t.Fatalf("fiche complète = %d/%d", got, productHealthMax)
	}

	incomplete := complete
	incomplete.Description = "  "
	incomplete.Image = ""
	incomplete.Categories = nil
	if got := productHealthScore(incomplete); got != 3 {
		t.Fatalf("fiche incomplète = %d/6, attendu 3/6", got)
	}
}

func baseCatalogHealth(t *testing.T) (*pocketbase.PocketBase, *models.Collection, string) {
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

	categories := &models.Collection{Name: "health_categories", Type: models.CollectionTypeBase}
	categories.Schema = schema.NewSchema(&schema.SchemaField{Name: "name", Type: schema.FieldTypeText})
	if err := app.Dao().SaveCollection(categories); err != nil {
		t.Fatalf("collection catégories: %v", err)
	}
	category := models.NewRecord(categories)
	category.Set("name", "Guitares")
	if err := app.Dao().SaveRecord(category); err != nil {
		t.Fatalf("catégorie: %v", err)
	}

	products := &models.Collection{Name: "products", Type: models.CollectionTypeBase}
	products.Schema = schema.NewSchema(
		&schema.SchemaField{Name: "name", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "description", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "image", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "price_ttc", Type: schema.FieldTypeNumber},
		&schema.SchemaField{Name: "slug", Type: schema.FieldTypeText},
		&schema.SchemaField{
			Name: "categories",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId: categories.Id,
				MaxSelect:    nil,
			},
		},
	)
	if err := app.Dao().SaveCollection(products); err != nil {
		t.Fatalf("collection produits: %v", err)
	}
	return app, products, category.Id
}

func saveHealthProduct(t *testing.T, app *pocketbase.PocketBase, collection *models.Collection, values productHealthValues) {
	t.Helper()
	record := models.NewRecord(collection)
	record.Set("name", values.Name)
	record.Set("description", values.Description)
	record.Set("image", values.Image)
	record.Set("categories", values.Categories)
	record.Set("price_ttc", values.PriceTTC)
	record.Set("slug", values.Slug)
	if err := app.Dao().SaveRecord(record); err != nil {
		t.Fatalf("produit %q: %v", values.Name, err)
	}
}

func TestProductHealthSQLTrieAvantPagination(t *testing.T) {
	app, collection, categoryID := baseCatalogHealth(t)
	saveHealthProduct(t, app, collection, productHealthValues{Name: "Faible"})
	saveHealthProduct(t, app, collection, productHealthValues{
		Name:        "Complète",
		Description: "<p>Prête.</p>",
		Image:       "image.webp",
		Categories:  []string{categoryID},
		PriceTTC:    100,
		Slug:        "complete",
	})

	query, err := filteredProductQuery(app, "")
	if err != nil {
		t.Fatal(err)
	}
	var products []*models.Record
	if err := query.AndOrderBy(productHealthSQL + " ASC").Limit(1).All(&products); err != nil {
		t.Fatalf("tri SQL: %v", err)
	}
	if len(products) != 1 || products[0].GetString("name") != "Faible" {
		t.Fatalf("première page santé = %#v, attendu Faible", products)
	}

	filtered, err := filteredProductQuery(app, "description = ''")
	if err != nil {
		t.Fatal(err)
	}
	products = nil
	if err := filtered.All(&products); err != nil {
		t.Fatalf("filtre sans description: %v", err)
	}
	if len(products) != 1 || products[0].GetString("name") != "Faible" {
		t.Fatalf("sans description = %#v, attendu Faible", products)
	}
}

func TestProductHealthSQLFiltreUneNoteExacte(t *testing.T) {
	app, collection, categoryID := baseCatalogHealth(t)
	saveHealthProduct(t, app, collection, productHealthValues{Name: "Faible"})
	saveHealthProduct(t, app, collection, productHealthValues{
		Name:        "Complète",
		Description: "<p>Prête.</p>",
		Image:       "image.webp",
		Categories:  []string{categoryID},
		PriceTTC:    100,
		Slug:        "complete",
	})

	query, err := filteredProductQuery(app, "")
	if err != nil {
		t.Fatal(err)
	}
	if err := applyProductHealthFilter(query, "6"); err != nil {
		t.Fatalf("filtre santé: %v", err)
	}
	var products []*models.Record
	if err := query.All(&products); err != nil {
		t.Fatalf("lecture filtrée: %v", err)
	}
	if len(products) != 1 || products[0].GetString("name") != "Complète" {
		t.Fatalf("note 6/6 = %#v, attendu Complète", products)
	}
}

func TestProductHealthFilterRefuseUneNoteInvalide(t *testing.T) {
	for _, score := range []string{"-1", "7", "abc"} {
		t.Run(score, func(t *testing.T) {
			app, _, _ := baseCatalogHealth(t)
			query, err := filteredProductQuery(app, "")
			if err != nil {
				t.Fatal(err)
			}
			if err := applyProductHealthFilter(query, score); err == nil {
				t.Fatalf("la note %q aurait dû être refusée", score)
			}
		})
	}
}

func TestCatalogProductOrderUtiliseUneListeBlanche(t *testing.T) {
	if got := catalogProductOrder("-created", "")[0]; got != "products.created DESC" {
		t.Fatalf("tri créé descendant = %q", got)
	}
	if got := catalogProductOrder("name; DROP TABLE products", "")[0]; got != "products.name_sort ASC" {
		t.Fatalf("repli du tri inconnu = %q", got)
	}
}
