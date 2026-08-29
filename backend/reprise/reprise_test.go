package reprise

import (
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/migrate"

	_ "github.com/pocketbase/pocketbase/migrations"
	pbmigrations "github.com/pocketbase/pocketbase/migrations"
)

const societe = "SOC1"

// ── Le gardien central ──────────────────────────────────────────────────────
//
// Un document repris garde son id — c'est lui qui porte les relations — mais
// PAS son numéro, PAS sa séquence, PAS son hash : ceux-là appartiennent à notre
// chaîne. Mesuré le 29 août 2026 : quatre des dix documents à reprendre
// portaient un numéro DÉJÀ attribué chez nous (FAC-2026-000107 à 000110), la
// base du client fabriquant encore des doublons. Les recopier aurait dédoublé.
func TestUnDocumentRepriseGardeSonIdEtChangeDeNumero(t *testing.T) {
	source, cible := deuxBases(t)

	// Chez nous : une facture qui occupe DÉJÀ le numéro FAC-2026-000107.
	creerDoc(t, cible, "occupant0000001", map[string]any{
		"owner_company": societe, "number": "FAC-2026-000107",
		"invoice_type": "invoice", "fiscal_year": 2026,
		"date": "2026-04-10 10:00:00.000Z", "total_ttc": 448.0,
		"sequence_number": 1, "hash": "abc", "status": "validated",
	})

	// Chez le client : une facture NEUVE qui porte le même numéro.
	creerDoc(t, source, "neuve0000000001", map[string]any{
		"owner_company": societe, "number": "FAC-2026-000107",
		"invoice_type": "invoice", "fiscal_year": 2026,
		"date": "2026-08-25 14:00:00.000Z", "total_ttc": 2000.0,
		"sequence_number": 1201, "hash": "zzz", "previous_hash": "yyy",
		"status": "validated",
	})

	plan, err := Preparer(source.Dao(), cible.Dao(), societe, "2026-08-25", "2026-08-25", nil)
	if err != nil {
		t.Fatalf("preparer: %v", err)
	}
	if len(plan.Documents) != 1 {
		t.Fatalf("%d document(s) au plan, attendu 1", len(plan.Documents))
	}

	if err := Appliquer(source.Dao(), cible.Dao(), plan, nil); err != nil {
		t.Fatalf("appliquer: %v", err)
	}

	repris, err := cible.Dao().FindRecordById("invoices", "neuve0000000001")
	if err != nil {
		t.Fatalf("le document n'a pas été repris sous son id : %v", err)
	}

	if repris.GetString("number") == "FAC-2026-000107" {
		t.Fatal("le numéro du client a été recopié : il écrase un numéro déjà " +
			"attribué chez nous — c'est le défaut des 114 doublons, recréé")
	}
	if repris.GetString("number") != "FAC-2026-000108" {
		t.Errorf("numéro attribué = %q, attendu FAC-2026-000108 (le suivant de NOTRE série)",
			repris.GetString("number"))
	}
	if repris.GetInt("sequence_number") != 2 {
		t.Errorf("séquence = %d, attendu 2 (à la suite de NOTRE chaîne, pas de la sienne)",
			repris.GetInt("sequence_number"))
	}
	if repris.GetString("previous_hash") != "abc" {
		t.Errorf("previous_hash = %q, attendu \"abc\" : un maillon repris d'une "+
			"AUTRE chaîne est incohérent sans aucune erreur", repris.GetString("previous_hash"))
	}
	if h := repris.GetString("hash"); h == "" || h == "zzz" {
		t.Errorf("hash = %q : il doit être recalculé chez nous, jamais recopié", h)
	}
}

// Un second passage ne trouve rien. C'est l'idempotence, et elle est gratuite :
// l'identité est l'id PocketBase, pas un journal de reprise à tenir à jour.
func TestUnSecondPassageNeTrouvePlusRien(t *testing.T) {
	source, cible := deuxBases(t)

	creerDoc(t, source, "doc100000000001", map[string]any{
		"owner_company": societe, "number": "FAC-2026-000050",
		"invoice_type": "invoice", "fiscal_year": 2026,
		"date": "2026-08-25 09:00:00.000Z", "total_ttc": 100.0,
		"sequence_number": 900, "status": "validated",
	})

	plan, _ := Preparer(source.Dao(), cible.Dao(), societe, "2026-08-25", "2026-08-25", nil)
	if err := Appliquer(source.Dao(), cible.Dao(), plan, nil); err != nil {
		t.Fatalf("appliquer: %v", err)
	}

	second, err := Preparer(source.Dao(), cible.Dao(), societe, "2026-08-25", "2026-08-25", nil)
	if err != nil {
		t.Fatalf("preparer (2e): %v", err)
	}
	if !second.Vide() {
		t.Fatalf("le second passage reprendrait encore %d document(s) : "+
			"la reprise n'est pas idempotente", len(second.Documents))
	}
}

// La reprise REFUSE plutôt que de deviner. Un avoir dont la facture annulée
// n'est ni chez nous ni dans le lot pointerait dans le vide, sans erreur.
func TestUnLienNonResoluBloqueLaReprise(t *testing.T) {
	source, cible := deuxBases(t)

	creerDoc(t, source, "avoir0000000001", map[string]any{
		"owner_company": societe, "number": "AVO-2026-000040",
		"invoice_type": "credit_note", "fiscal_year": 2026,
		"date": "2026-08-25 15:00:00.000Z", "total_ttc": -184.90,
		"original_invoice_id": "facturedisparue",
		"sequence_number":     1204, "status": "validated",
	})

	plan, err := Preparer(source.Dao(), cible.Dao(), societe, "2026-08-25", "2026-08-25", nil)
	if err != nil {
		t.Fatalf("preparer: %v", err)
	}
	if len(plan.Refus) != 1 {
		t.Fatalf("%d refus, attendu 1", len(plan.Refus))
	}
	if err := Appliquer(source.Dao(), cible.Dao(), plan, nil); err == nil {
		t.Fatal("la reprise a écrit malgré un lien non résolu")
	}
	if _, err := cible.Dao().FindRecordById("invoices", "avoir0000000001"); err == nil {
		t.Fatal("l'avoir a été écrit alors que sa cible n'existe pas")
	}
}

// Un document écarté délibérément n'est ni repris, ni oublié : il est montré.
func TestUnDocumentEcarteEstMontreEtPasRepris(t *testing.T) {
	source, cible := deuxBases(t)

	creerDoc(t, source, "doublon00000001", map[string]any{
		"owner_company": societe, "number": "FAC-2026-000107",
		"invoice_type": "invoice", "fiscal_year": 2026,
		"date": "2026-08-25 17:07:00.000Z", "total_ttc": 2000.0,
		"sequence_number": 1201, "status": "validated",
	})

	plan, _ := Preparer(source.Dao(), cible.Dao(), societe, "2026-08-25", "2026-08-25",
		map[string]bool{"FAC-2026-000107": true})

	if len(plan.Documents) != 0 {
		t.Fatalf("%d document(s) repris, attendu 0", len(plan.Documents))
	}
	if len(plan.Ignores) != 1 {
		t.Fatalf("%d écarté(s), attendu 1 — un document écarté doit rester VISIBLE",
			len(plan.Ignores))
	}
}

// La série se déduit du document, aux mêmes conditions que le hook
// (backend/hooks/invoice_hooks.go:838-845). Une erreur ici enverrait un avoir
// dans la série des factures.
func TestLaSerieSeDeduitCommeDansLeHook(t *testing.T) {
	col := &models.Collection{Name: "invoices", Type: models.CollectionTypeBase}
	col.Schema = schema.NewSchema(
		&schema.SchemaField{Name: "invoice_type", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "cash_register", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "is_pos_ticket", Type: schema.FieldTypeBool},
	)

	cas := []struct {
		nom      string
		valeurs  map[string]any
		attendue string
	}{
		{"avoir", map[string]any{"invoice_type": "credit_note"}, "AVO"},
		{"acompte", map[string]any{"invoice_type": "deposit"}, "ACC"},
		{"ticket", map[string]any{"invoice_type": "invoice", "is_pos_ticket": true}, "TIK"},
		{"ticket par la caisse", map[string]any{"invoice_type": "invoice", "cash_register": "C1"}, "TIK"},
		{"facture", map[string]any{"invoice_type": "invoice"}, "FAC"},
	}

	for _, c := range cas {
		rec := models.NewRecord(col)
		for k, v := range c.valeurs {
			rec.Set(k, v)
		}
		if got := prefixeDe(rec); got != c.attendue {
			t.Errorf("%s : série %q, attendue %q", c.nom, got, c.attendue)
		}
	}
}

// ── Montage ─────────────────────────────────────────────────────────────────

func deuxBases(t *testing.T) (source, cible *pocketbase.PocketBase) {
	t.Helper()
	return nouvelleBase(t), nouvelleBase(t)
}

func nouvelleBase(t *testing.T) *pocketbase.PocketBase {
	t.Helper()

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	t.Cleanup(func() { app.ResetBootstrapState() })

	runner, err := migrate.NewRunner(app.DB(), pbmigrations.AppMigrations)
	if err != nil {
		t.Fatalf("runner: %v", err)
	}
	if _, err := runner.Up(); err != nil {
		t.Fatalf("migrations système: %v", err)
	}

	txt := schema.FieldTypeText
	num := schema.FieldTypeNumber
	bul := schema.FieldTypeBool

	creerCol(t, app, "customers", map[string]string{
		"owner_company": txt, "customer_number": txt, "name": txt, "email": txt,
	})
	creerCol(t, app, "cash_sessions", map[string]string{
		"owner_company": txt, "status": txt, "opened_at": txt, "closed_at": txt,
	})
	creerCol(t, app, "cash_movements", map[string]string{
		"owner_company": txt, "movement_type": txt, "amount": num,
		"reason": txt, "session": txt, "related_invoice": txt,
	})
	creerCol(t, app, "invoices", map[string]string{
		"owner_company": txt, "number": txt, "invoice_type": txt,
		"fiscal_year": num, "date": txt, "total_ht": num, "total_tva": num,
		"total_ttc": num, "status": txt, "customer": txt, "session": txt,
		"cash_register": txt, "is_pos_ticket": bul, "is_locked": bul,
		"sequence_number": num, "hash": txt, "previous_hash": txt,
		"original_invoice_id": txt,
	})

	return app
}

func creerCol(t *testing.T, app *pocketbase.PocketBase, nom string, champs map[string]string) {
	t.Helper()

	col := &models.Collection{Name: nom, Type: models.CollectionTypeBase}
	fields := make([]*schema.SchemaField, 0, len(champs))
	for n, ty := range champs {
		fields = append(fields, &schema.SchemaField{Name: n, Type: ty})
	}
	col.Schema = schema.NewSchema(fields...)

	if err := app.Dao().SaveCollection(col); err != nil {
		t.Fatalf("collection %s: %v", nom, err)
	}
}

func creerDoc(t *testing.T, app *pocketbase.PocketBase, id string, valeurs map[string]any) *models.Record {
	t.Helper()

	col, err := app.Dao().FindCollectionByNameOrId("invoices")
	if err != nil {
		t.Fatalf("collection invoices: %v", err)
	}
	rec := models.NewRecord(col)
	rec.SetId(id)
	for k, v := range valeurs {
		rec.Set(k, v)
	}
	if err := app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("document %s: %v", id, err)
	}
	return rec
}
