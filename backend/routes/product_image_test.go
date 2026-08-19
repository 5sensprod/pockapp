package routes

import (
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/migrate"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Le décor : un `products` réduit aux deux champs fichier qui nous occupent,
// au même gabarit que `backend/migrations/catalog_v2.go:660-680` — `image`
// prend un fichier, `gallery` jusqu'à dix.
func baseProduits(t *testing.T) (*pocketbase.PocketBase, *models.Collection) {
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

	col := &models.Collection{Name: "products", Type: models.CollectionTypeBase}
	col.Schema = schema.NewSchema(
		&schema.SchemaField{Name: "name", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "legacy_id", Type: schema.FieldTypeText},
		&schema.SchemaField{
			Name:    "image",
			Type:    schema.FieldTypeFile,
			Options: &schema.FileOptions{MaxSelect: 1, MaxSize: 5242880},
		},
		&schema.SchemaField{
			Name:    "gallery",
			Type:    schema.FieldTypeFile,
			Options: &schema.FileOptions{MaxSelect: 10, MaxSize: 5242880},
		},
	)
	if err := app.Dao().SaveCollection(col); err != nil {
		t.Fatalf("collection products: %v", err)
	}
	return app, col
}

func unProduit(t *testing.T, app *pocketbase.PocketBase, col *models.Collection, image string, galerie []string) *models.Record {
	t.Helper()
	rec := models.NewRecord(col)
	rec.Set("name", "Ampli")
	rec.Set("legacy_id", "nedb1")
	rec.Set("image", image)
	rec.Set("gallery", galerie)
	if err := app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("produit: %v", err)
	}
	return rec
}

// LA règle du 19 août 2026 : promouvoir B rétrograde A, et A n'est pas perdue.
func TestPromouvoirEchangeLesDeuxChamps(t *testing.T) {
	app, col := baseProduits(t)
	rec := unProduit(t, app, col, "a.jpg", []string{"b.jpg", "c.jpg", "d.jpg"})

	image, galerie, err := PromoteProductImage(app, rec.Id, "c.jpg")
	if err != nil {
		t.Fatalf("promotion refusée : %v", err)
	}

	if image != "c.jpg" {
		t.Errorf("image principale = %q, attendu c.jpg", image)
	}
	// L'échange est EN PLACE : l'ancienne principale prend le rang de la promue.
	attendu := []string{"b.jpg", "a.jpg", "d.jpg"}
	if len(galerie) != 3 || galerie[0] != attendu[0] || galerie[1] != attendu[1] || galerie[2] != attendu[2] {
		t.Errorf("galerie = %v, attendu %v", galerie, attendu)
	}

	// Et c'est bien écrit en base, pas seulement rendu.
	relu, err := app.Dao().FindRecordById("products", rec.Id)
	if err != nil {
		t.Fatalf("relecture : %v", err)
	}
	if relu.GetString("image") != "c.jpg" {
		t.Errorf("en base, image = %q", relu.GetString("image"))
	}
	// AUCUNE IMAGE PERDUE : les quatre noms de départ sont toujours référencés.
	vus := map[string]bool{relu.GetString("image"): true}
	for _, nom := range relu.GetStringSlice("gallery") {
		vus[nom] = true
	}
	for _, nom := range []string{"a.jpg", "b.jpg", "c.jpg", "d.jpg"} {
		if !vus[nom] {
			t.Errorf("%s a disparu — « une image ne se perd pas »", nom)
		}
	}
}

// Un produit sans principale : la promue quitte la galerie, rien ne la remplace.
func TestPromouvoirSansPrincipaleExistante(t *testing.T) {
	app, col := baseProduits(t)
	rec := unProduit(t, app, col, "", []string{"b.jpg", "c.jpg"})

	image, galerie, err := PromoteProductImage(app, rec.Id, "b.jpg")
	if err != nil {
		t.Fatalf("promotion refusée : %v", err)
	}
	if image != "b.jpg" {
		t.Errorf("image = %q", image)
	}
	if len(galerie) != 1 || galerie[0] != "c.jpg" {
		t.Errorf("galerie = %v, attendu [c.jpg]", galerie)
	}
}

// Un nom étranger ne doit RIEN écrire : sans cette garde, `image` prendrait un
// nom qui ne désigne aucun fichier et l'écran afficherait un cadre vide.
func TestPromouvoirRefuseUnNomHorsGalerie(t *testing.T) {
	app, col := baseProduits(t)
	rec := unProduit(t, app, col, "a.jpg", []string{"b.jpg"})

	if _, _, err := PromoteProductImage(app, rec.Id, "z.jpg"); !errors.Is(err, ErrImageAbsente) {
		t.Fatalf("erreur = %v, attendu ErrImageAbsente", err)
	}

	relu, _ := app.Dao().FindRecordById("products", rec.Id)
	if relu.GetString("image") != "a.jpg" {
		t.Errorf("l'image principale a bougé alors que la promotion échouait : %q", relu.GetString("image"))
	}
}

// La clé stable NeDB ouvre la route au même titre que l'identifiant PocketBase.
func TestPromouvoirParLegacyId(t *testing.T) {
	app, col := baseProduits(t)
	unProduit(t, app, col, "a.jpg", []string{"b.jpg"})

	if _, _, err := PromoteProductImage(app, "nedb1", "b.jpg"); err != nil {
		t.Fatalf("promotion par legacy_id refusée : %v", err)
	}
}

// ── LE GARDIEN DE LA CONCEPTION ───────────────────────────────────────────
// Ce test ne teste pas notre code : il teste la BIBLIOTHÈQUE, et il existe
// pour qu'une session future ne « simplifie » pas la route en la ramenant côté
// client. Tant qu'il passe, l'échange par l'API REST est impossible : le nom
// venu de `gallery` est inconnu de `image`.
//
// Le jour où une mise à jour de PocketBase le fera échouer, c'est que la
// contrainte est levée — et la route pourra être reconsidérée, pas avant.
func TestLAPIRESTRefuseLEchangeEntreChamps(t *testing.T) {
	app, col := baseProduits(t)
	rec := unProduit(t, app, col, "a.jpg", []string{"b.jpg"})

	form := forms.NewRecordUpsert(app, rec)
	err := form.LoadData(map[string]any{
		"image":   "b.jpg", // un nom qui vit dans `gallery`
		"gallery": types.JsonArray[string]{"a.jpg"},
	})
	if err == nil {
		t.Fatal("PocketBase a accepté l'échange par RecordUpsert : la raison d'être de la route est peut-être caduque — relire forms/record_upsert.go et docs/DECISIONS.md avant de conclure")
	}
	t.Logf("refus attendu, tel que rendu par la bibliothèque : %v", err)
}
