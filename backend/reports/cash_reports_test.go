package reports

import (
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/migrate"
)

// Le total TTC d'un rapport Z doit valoir la somme de ses tickets — pas le
// double. Le 20 mai 2026, le commit 156692e a ajouté `aggregateInvoiceIntoTotals`
// pour partager l'agrégation avec les factures B2B, sans retirer le
// `totalTTC += sessionTTC` qui suivait la boucle. Les tickets POS ont donc été
// comptés deux fois dans les totaux journaliers pendant trois mois, alors que
// la ventilation TVA et les moyens de paiement, eux, ne l'étaient qu'une fois :
// le document se contredisait lui-même. Mesuré sur la base de dév : 22 rapports
// Z touchés, du Z-022 au Z-045.
func TestLesTicketsNeSontComptesQuUneFoisDansLeZ(t *testing.T) {
	app := nouvelleAppDeTest(t)

	const societe = "co1"
	caisse := creerEnregistrement(t, app, "cash_registers", map[string]any{
		"owner_company": societe,
		"code":          "C1",
		"name":          "Comptoir",
	})

	// Une session fermée hier, jamais consommée par un Z.
	jour := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	session := creerEnregistrement(t, app, "cash_sessions", map[string]any{
		"owner_company":      societe,
		"cash_register":      caisse.Id,
		"status":             "closed",
		"opened_at":          jour + " 08:00:00.000Z",
		"closed_at":          jour + " 19:00:00.000Z",
		"opening_float":      100.0,
		"counted_cash_total": 160.0,
		"z_report_id":        "",
	})

	// Deux tickets : 50,00 € et 10,00 € TTC.
	for _, ticket := range []struct {
		ht, tva, ttc float64
		moyen        string
	}{
		{41.67, 8.33, 50.00, "especes"},
		{8.33, 1.67, 10.00, "cb"},
	} {
		creerEnregistrement(t, app, "invoices", map[string]any{
			"owner_company":        societe,
			"session":              session.Id,
			"is_pos_ticket":        true,
			"status":               "issued",
			"invoice_type":         "invoice",
			"total_ht":             ticket.ht,
			"total_tva":            ticket.tva,
			"total_ttc":            ticket.ttc,
			"payment_method":       ticket.moyen,
			"payment_method_label": ticket.moyen,
			"original_invoice_id":  "",
		})
	}

	const (
		attenduHT  = 50.00
		attenduTVA = 10.00
		attenduTTC = 60.00
	)

	rapport, err := GenerateRapportZ(app, caisse.Id, jour)
	if err != nil {
		t.Fatalf("génération du Z: %v", err)
	}

	totaux := rapport.DailyTotals

	if totaux.InvoiceCount != 2 {
		t.Errorf("nombre de tickets = %d, attendu 2", totaux.InvoiceCount)
	}
	if totaux.TotalTTC != attenduTTC {
		t.Errorf("total TTC = %.2f, attendu %.2f (double comptage si %.2f)",
			totaux.TotalTTC, attenduTTC, attenduTTC*2)
	}
	if totaux.TotalHT != attenduHT {
		t.Errorf("total HT = %.2f, attendu %.2f", totaux.TotalHT, attenduHT)
	}
	if totaux.TotalTVA != attenduTVA {
		t.Errorf("total TVA = %.2f, attendu %.2f", totaux.TotalTVA, attenduTVA)
	}
}

// Le rapport ne doit pas se contredire lui-même : le total annoncé et la somme
// de ses propres ventilations sont le même argent. C'est ce qui rendait le
// défaut visible sans connaître les tickets — sur Z-2026-000045, `total_ttc`
// valait 1959,62 € contre 979,81 € de moyens de paiement, et `total_tva`
// 311,56 € contre 155,78 € de TVA ventilée.
func TestLesTotauxDuZEgalentLeursVentilations(t *testing.T) {
	app := nouvelleAppDeTest(t)

	const societe = "co1"
	caisse := creerEnregistrement(t, app, "cash_registers", map[string]any{
		"owner_company": societe,
		"code":          "C1",
		"name":          "Comptoir",
	})

	jour := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	session := creerEnregistrement(t, app, "cash_sessions", map[string]any{
		"owner_company": societe,
		"cash_register": caisse.Id,
		"status":        "closed",
		"opened_at":     jour + " 08:00:00.000Z",
		"closed_at":     jour + " 19:00:00.000Z",
		"opening_float": 0.0,
		"z_report_id":   "",
	})

	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company":        societe,
		"session":              session.Id,
		"is_pos_ticket":        true,
		"status":               "issued",
		"invoice_type":         "invoice",
		"total_ht":             100.00,
		"total_tva":            20.00,
		"total_ttc":            120.00,
		"payment_method":       "cb",
		"payment_method_label": "cb",
		"original_invoice_id":  "",
		// La ventilation part de `items`, pas de `vat_breakdown` : sur un champ
		// JSON, `Record.Get` rend un types.JsonRaw ([]byte), que
		// isVATBreakdownValid ne sait pas reconnaître (son switch ne couvre que
		// string, map et []interface{}) — le code retombe donc toujours sur
		// aggregateVATFromItems, qui, lui, gère []byte. Le fixture reproduit ce
		// chemin réel plutôt que la branche morte.
		"items": []any{
			map[string]any{"tva_rate": 20.0, "total_ht": 100.00, "total_ttc": 120.00},
		},
	})

	rapport, err := GenerateRapportZ(app, caisse.Id, jour)
	if err != nil {
		t.Fatalf("génération du Z: %v", err)
	}
	totaux := rapport.DailyTotals

	var sommeMoyens float64
	for _, v := range totaux.ByMethod {
		sommeMoyens += v
	}
	if roundAmount(sommeMoyens) != totaux.TotalTTC {
		t.Errorf("somme des moyens de paiement = %.2f, mais total_ttc = %.2f",
			sommeMoyens, totaux.TotalTTC)
	}

	var sommeTVA, sommeBaseHT float64
	for _, d := range totaux.VATByRate {
		sommeTVA += d.VATAmount
		sommeBaseHT += d.BaseHT
	}
	if roundAmount(sommeTVA) != totaux.TotalTVA {
		t.Errorf("TVA ventilée = %.2f, mais total_tva = %.2f", sommeTVA, totaux.TotalTVA)
	}
	if roundAmount(sommeBaseHT) != totaux.TotalHT {
		t.Errorf("bases HT ventilées = %.2f, mais total_ht = %.2f", sommeBaseHT, totaux.TotalHT)
	}
}

// ─── Échafaudage ────────────────────────────────────────────────────────────

// nouvelleAppDeTest monte une PocketBase en mémoire avec le strict nécessaire
// pour GenerateRapportZ. Même patron que backend/routes/stock_atomic_test.go :
// Bootstrap ouvre la base mais ne pose pas les tables système, c'est app.Start()
// qui le fait en fonctionnement — d'où le runner de migrations explicite.
func nouvelleAppDeTest(t *testing.T) *pocketbase.PocketBase {
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

	txt := schema.FieldTypeText
	num := schema.FieldTypeNumber
	bul := schema.FieldTypeBool
	jsn := schema.FieldTypeJson

	creerCollection(t, app, "cash_registers", map[string]string{
		"owner_company": txt, "code": txt, "name": txt,
	})
	creerCollection(t, app, "cash_sessions", map[string]string{
		"owner_company": txt, "cash_register": txt, "status": txt,
		"opened_at": txt, "closed_at": txt, "opened_by": txt, "closed_by": txt,
		"opening_float": num, "counted_cash_total": num, "z_report_id": txt,
	})
	creerCollection(t, app, "invoices", map[string]string{
		"owner_company": txt, "session": txt, "status": txt, "invoice_type": txt,
		"number": txt, "customer": txt, "date": txt, "paid_at": txt,
		"payment_method": txt, "payment_method_label": txt, "refund_method": txt,
		"original_invoice_id": txt,
		"is_pos_ticket":       bul, "is_paid": bul,
		"total_ht": num, "total_tva": num, "total_ttc": num,
		"cart_discount_ttc": num, "line_discounts_total_ttc": num,
		"vat_breakdown": jsn, "items": jsn,
	})
	creerCollection(t, app, "cash_movements", map[string]string{
		"owner_company": txt, "session": txt, "movement_type": txt,
		"reason": txt, "related_invoice": txt, "created_by": txt,
		"amount": num, "meta": jsn,
	})
	creerCollection(t, app, "z_reports", map[string]string{
		"number": txt, "owner_company": txt, "cash_register": txt, "date": txt,
		"hash": txt, "previous_hash": txt, "note": txt, "generated_at": txt,
		"fiscal_year": num, "sequence_number": num, "sessions_count": num,
		"invoice_count": num, "total_ht": num, "total_tva": num, "total_ttc": num,
		"total_cash_expected": num, "total_cash_counted": num,
		"total_cash_difference": num, "total_discounts": num,
		"credit_notes_count": num, "credit_notes_total": num,
		"session_ids": jsn, "vat_breakdown": jsn, "totals_by_method": jsn,
		"full_report": jsn,
	})

	return app
}

func creerCollection(
	t *testing.T,
	app *pocketbase.PocketBase,
	nom string,
	champs map[string]string,
) {
	t.Helper()

	col := &models.Collection{Name: nom, Type: models.CollectionTypeBase}
	fields := make([]*schema.SchemaField, 0, len(champs))
	for nomChamp, typeChamp := range champs {
		fields = append(fields, &schema.SchemaField{Name: nomChamp, Type: typeChamp})
	}
	col.Schema = schema.NewSchema(fields...)

	if err := app.Dao().SaveCollection(col); err != nil {
		t.Fatalf("collection %s: %v", nom, err)
	}
}

func creerEnregistrement(
	t *testing.T,
	app *pocketbase.PocketBase,
	collection string,
	valeurs map[string]any,
) *models.Record {
	t.Helper()

	col, err := app.Dao().FindCollectionByNameOrId(collection)
	if err != nil {
		t.Fatalf("collection %s introuvable: %v", collection, err)
	}

	rec := models.NewRecord(col)
	for k, v := range valeurs {
		rec.Set(k, v)
	}
	if err := app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("enregistrement %s: %v", collection, err)
	}
	return rec
}
