package promo

import (
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/migrate"
)

func TestJourParisSuitLeFuseauEtLHeureDEte(t *testing.T) {
	// 22:30 UTC le 30 septembre : déjà le 1er octobre à Paris (UTC+2 l'été).
	ete := time.Date(2026, 9, 30, 22, 30, 0, 0, time.UTC)
	if got := JourParis(ete); got != "2026-10-01" {
		t.Fatalf("été : %s, attendu 2026-10-01", got)
	}
	// 23:30 UTC le 31 décembre : 1er janvier à Paris (UTC+1 l'hiver).
	hiver := time.Date(2026, 12, 31, 23, 30, 0, 0, time.UTC)
	if got := JourParis(hiver); got != "2027-01-01" {
		t.Fatalf("hiver : %s, attendu 2027-01-01", got)
	}
	// 22:30 UTC le 31 décembre : encore le 31 à Paris.
	if got := JourParis(hiver.Add(-time.Hour)); got != "2026-12-31" {
		t.Fatalf("hiver, avant minuit : %s", got)
	}
}

// Les MÊMES cas que `promo-price.test.ts` et que `server/tests` : la règle est
// écrite trois fois, ses cas une fois de chaque côté.
func TestEnCoursBornesIncluses(t *testing.T) {
	cas := []struct {
		debut, fin, jour string
		attendu          bool
	}{
		{"", "", "2026-09-10", true},
		{"2026-09-10", "2026-09-20", "2026-09-10", true},
		{"2026-09-10", "2026-09-20", "2026-09-20", true},
		{"2026-09-10", "2026-09-20", "2026-09-09", false},
		{"2026-09-10", "2026-09-20", "2026-09-21", false},
		{"2026-09-10", "", "2026-12-31", true},
		{"", "2026-09-20", "2026-01-01", true},
	}
	for _, c := range cas {
		if got := EnCours(c.debut, c.fin, c.jour); got != c.attendu {
			t.Errorf("EnCours(%q, %q, %q) = %v", c.debut, c.fin, c.jour, got)
		}
	}
}

func TestExpireeSeulementLeLendemainDeLaFin(t *testing.T) {
	if Expiree("promo", "2026-09-20", "2026-09-20") {
		t.Error("le jour de fin, la promo vaut encore")
	}
	if !Expiree("promo", "2026-09-20", "2026-09-21") {
		t.Error("le lendemain, elle expire")
	}
	if !Expiree("sale", "2026-09-20", "2026-09-21") {
		t.Error("un solde expire comme une promo")
	}
	if Expiree("", "2026-09-20", "2026-09-21") {
		t.Error("un plein tarif n'a rien à expirer")
	}
	if Expiree("promo", "", "2030-01-01") {
		t.Error("sans fin, pas d'expiration")
	}
}

func TestExpirerPromosRemetLaFicheEnPleinTarif(t *testing.T) {
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
		&schema.SchemaField{
			Name: "sale_state", Type: schema.FieldTypeSelect,
			Options: &schema.SelectOptions{MaxSelect: 1, Values: []string{"sale", "promo"}},
		},
		&schema.SchemaField{Name: "promo_price_ttc", Type: schema.FieldTypeNumber},
		&schema.SchemaField{Name: "promo_start", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "promo_end", Type: schema.FieldTypeText},
	)
	if err := app.Dao().SaveCollection(produits); err != nil {
		t.Fatalf("collection: %v", err)
	}

	cree := func(nom, etat, fin string) *models.Record {
		rec := models.NewRecord(produits)
		rec.Set("name", nom)
		rec.Set("sale_state", etat)
		rec.Set("promo_price_ttc", 90)
		rec.Set("promo_start", "2026-09-01")
		rec.Set("promo_end", fin)
		if err := app.Dao().SaveRecord(rec); err != nil {
			t.Fatalf("produit %s: %v", nom, err)
		}
		return rec
	}
	finie := cree("finie", "promo", "2026-09-09")
	dernierJour := cree("dernier-jour", "sale", "2026-09-10")
	sansFin := cree("sans-fin", "promo", "")

	n, err := ExpirerPromos(app.Dao(), "2026-09-10")
	if err != nil {
		t.Fatalf("expiration: %v", err)
	}
	if n != 1 {
		t.Fatalf("%d fiche(s) réécrite(s), 1 attendue", n)
	}

	relue, _ := app.Dao().FindRecordById("products", finie.Id)
	if relue.GetString("sale_state") != "" || relue.GetFloat("promo_price_ttc") != 0 ||
		relue.GetString("promo_start") != "" || relue.GetString("promo_end") != "" {
		t.Fatalf("la fiche expirée n'est pas en plein tarif : %v", relue.PublicExport())
	}
	for _, rec := range []*models.Record{dernierJour, sansFin} {
		r, _ := app.Dao().FindRecordById("products", rec.Id)
		if r.GetString("sale_state") == "" {
			t.Fatalf("%s ne devait pas expirer", r.GetString("name"))
		}
	}
}
