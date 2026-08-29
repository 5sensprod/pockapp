// backend/session_du_jour_test.go
// Gardiens de l'étape E-1 — la session implicite du jour.

package backend

import (
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/migrate"

	"pocket-react/backend/reports"
)

// Deux encaissements le même jour donnent UNE session, pas deux. C'est toute la
// raison d'être de la fonction : sans elle, chaque appelant aurait ouvert la
// sienne, et un Z aurait compté autant de sessions que de tickets.
func TestDeuxEncaissementsLeMemeJourDonnentUneSeuleSession(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	caisse := creerCaisse(t, app, "co1")

	midi := time.Date(2026, 8, 29, 12, 0, 0, 0, time.Local)
	seize := time.Date(2026, 8, 29, 16, 30, 0, 0, time.Local)

	premiere, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user1", midi)
	if err != nil {
		t.Fatalf("premier encaissement: %v", err)
	}
	seconde, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user2", seize)
	if err != nil {
		t.Fatalf("second encaissement: %v", err)
	}

	if premiere.Id != seconde.Id {
		t.Fatalf("deux sessions pour la même journée : %s puis %s", premiere.Id, seconde.Id)
	}

	// opened_by est l'utilisateur du PREMIER encaissement, et il ne change pas
	// en cours de journée : c'est lui qui a ouvert le tiroir.
	if premiere.GetString("opened_by") != "user1" {
		t.Fatalf("opened_by = %q, attendu user1", premiere.GetString("opened_by"))
	}

	sessions, err := app.Dao().FindRecordsByFilter("cash_sessions", "owner_company = 'co1'", "opened_at", 0, 0)
	if err != nil {
		t.Fatalf("relecture: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("%d sessions en base, attendu 1", len(sessions))
	}
}

// Un encaissement le lendemain donne une SECONDE session, et la veille est
// fermée — mais fermée à la fin de SA journée, pas à l'heure courante.
//
// GenerateRapportZ ne retient que les sessions dont le `closed_at` tombe dans
// la journée du rapport (cash_reports.go). Une session de la veille portant un
// `closed_at` du lendemain sortirait de toute clôture, sans erreur : ses
// tickets ne seraient plus dans aucun Z.
func TestUnEncaissementLeLendemainOuvreUneSecondeSessionEtFermeLaVeilleDansSaJournee(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	caisse := creerCaisse(t, app, "co1")

	veille := time.Date(2026, 8, 28, 17, 0, 0, 0, time.Local)
	lendemain := time.Date(2026, 8, 29, 9, 15, 0, 0, time.Local)

	hier, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user1", veille)
	if err != nil {
		t.Fatalf("session de la veille: %v", err)
	}
	aujourdhui, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user1", lendemain)
	if err != nil {
		t.Fatalf("session du lendemain: %v", err)
	}

	if hier.Id == aujourdhui.Id {
		t.Fatalf("une seule session pour deux journées : %s", hier.Id)
	}

	relue, err := app.Dao().FindRecordById("cash_sessions", hier.Id)
	if err != nil {
		t.Fatalf("relecture de la session de la veille: %v", err)
	}
	if relue.GetString("status") != "closed" {
		t.Fatalf("la session de la veille est restée %q", relue.GetString("status"))
	}
	if jourDeLaDate(relue.GetString("closed_at")) != "2026-08-28" {
		t.Fatalf("closed_at = %q : la session de la veille doit être fermée DANS sa journée, "+
			"sinon le Z du 28 ne la voit plus", relue.GetString("closed_at"))
	}

	// Et son comptage n'est pas inventé : fermer n'est pas compter.
	if relue.GetFloat("counted_cash_total") != 0 {
		t.Fatalf("counted_cash_total = %.2f : la fermeture automatique ne compte pas le tiroir",
			relue.GetFloat("counted_cash_total"))
	}
}

// Un encaissement espèces reçu sans qu'aucune session ne soit ouverte n'est
// plus PERDU. Avant le 29 août 2026, CreateCashMovementIfEspeces abandonnait en
// silence : aucun mouvement n'était écrit et l'argent n'entrait dans aucun
// tiroir (04-refonte-du-z.md §2).
func TestUnMouvementEspecesNEstPlusPerduFauteDeSession(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	creerCaisse(t, app, "co1")

	mouvement := CreateCashMovementIfEspeces(app.Dao(), "especes", CashMovementParams{
		OwnerCompany: "co1",
		MovementType: "cash_in",
		Amount:       42.50,
		Reason:       "Paiement facture FAC-2026-000280",
		CreatedBy:    "user1",
	})

	if mouvement == nil {
		t.Fatal("mouvement perdu : aucune session ouverte, et le helper a abandonné")
	}
	if mouvement.GetString("session") == "" {
		t.Fatal("mouvement sans session : il n'entrerait dans aucun tiroir")
	}

	session, err := app.Dao().FindRecordById("cash_sessions", mouvement.GetString("session"))
	if err != nil {
		t.Fatalf("la session du mouvement n'existe pas: %v", err)
	}
	if session.GetString("status") != "open" {
		t.Fatalf("session %q, attendue ouverte", session.GetString("status"))
	}
}

// LE GARDIEN DE E-4, et c'est le plus important de la série : une journée
// entièrement implicite — session ouverte par le premier encaissement, fermée
// par le passage de journée — doit se retrouver dans le Z de SA journée.
//
// GenerateRapportZ ne retient que les sessions dont le `closed_at` tombe dans la
// journée du rapport (cash_reports.go). Si la fermeture automatique posait
// l'heure courante au lieu de la fin de la journée de la session, ce Z serait
// VIDE — et les tickets sortiraient de toute clôture, sans la moindre erreur.
func TestUneJourneeImpliciteEntreDansLeZDeSaJournee(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	caisse := creerCaisse(t, app, "co1")

	veille := time.Now().AddDate(0, 0, -1)
	jourVeille := veille.Format("2006-01-02")

	// 1. Le premier encaissement de la veille ouvre la session, tout seul.
	session, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user1",
		time.Date(veille.Year(), veille.Month(), veille.Day(), 9, 30, 0, 0, time.Local))
	if err != nil {
		t.Fatalf("session de la veille: %v", err)
	}

	colInvoices, err := app.Dao().FindCollectionByNameOrId("invoices")
	if err != nil {
		t.Fatalf("collection invoices: %v", err)
	}
	ticket := models.NewRecord(colInvoices)
	ticket.Set("owner_company", "co1")
	ticket.Set("session", session.Id)
	ticket.Set("is_pos_ticket", true)
	ticket.Set("status", "issued")
	ticket.Set("invoice_type", "invoice")
	ticket.Set("number", "TCK-900")
	ticket.Set("date", jourVeille+" 10:00:00.000Z")
	ticket.Set("total_ht", 41.67)
	ticket.Set("total_tva", 8.33)
	ticket.Set("total_ttc", 50.00)
	ticket.Set("payment_method", "especes")
	ticket.Set("payment_method_label", "especes")
	if err := app.Dao().SaveRecord(ticket); err != nil {
		t.Fatalf("ticket: %v", err)
	}

	// 2. Le lendemain, le premier encaissement ferme la veille et en ouvre une
	//    nouvelle — sans que personne n'ait cliqué sur quoi que ce soit.
	if _, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user1", time.Now()); err != nil {
		t.Fatalf("session du lendemain: %v", err)
	}

	// 3. Le Z de la veille doit voir la session, et son ticket.
	rapport, err := reports.GenerateRapportZ(app, caisse.Id, jourVeille)
	if err != nil {
		t.Fatalf("génération du Z de la veille: %v", err)
	}
	if rapport.DailyTotals.TotalTTC != 50.00 {
		t.Fatalf("le Z de la veille porte %.2f € au lieu de 50,00 € : sa session lui a "+
			"échappé (closed_at hors de sa journée ?)", rapport.DailyTotals.TotalTTC)
	}
	if rapport.DailyTotals.PosTicketCount != 1 {
		t.Fatalf("le Z compte %d ticket(s) au lieu de 1", rapport.DailyTotals.PosTicketCount)
	}
}

// ── Harnais ────────────────────────────────────────────────────────────────

func nouvelleAppDeTestCaisse(t *testing.T) *pocketbase.PocketBase {
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

	creerCollectionDeTest(t, app, "cash_registers", map[string]string{
		"owner_company": txt, "code": txt, "name": txt, "is_active": bul,
	})
	creerCollectionDeTest(t, app, "cash_sessions", map[string]string{
		"owner_company": txt, "cash_register": txt, "status": txt,
		"opened_at": txt, "closed_at": txt, "opened_by": txt, "closed_by": txt,
		"opening_float": num, "counted_cash_total": num, "z_report_id": txt,
	})
	creerCollectionDeTest(t, app, "cash_movements", map[string]string{
		"owner_company": txt, "session": txt, "movement_type": txt,
		"reason": txt, "related_invoice": txt, "created_by": txt,
		"amount": num, "meta": jsn,
	})
	creerCollectionDeTest(t, app, "invoices", map[string]string{
		"owner_company": txt, "session": txt, "status": txt, "invoice_type": txt,
		"number": txt, "customer": txt, "date": txt, "paid_at": txt,
		"payment_method": txt, "payment_method_label": txt, "refund_method": txt,
		"original_invoice_id": txt,
		"is_pos_ticket":       bul, "is_paid": bul,
		"total_ht": num, "total_tva": num, "total_ttc": num,
		"cart_discount_ttc": num, "line_discounts_total_ttc": num,
		"vat_breakdown": jsn, "items": jsn,
	})
	creerCollectionDeTest(t, app, "z_reports", map[string]string{
		"number": txt, "owner_company": txt, "cash_register": txt, "date": txt,
		"hash": txt, "previous_hash": txt, "note": txt, "generated_at": txt,
		"fiscal_year": num, "sequence_number": num, "sessions_count": num,
		"invoice_count": num, "total_ht": num, "total_tva": num, "total_ttc": num,
		"total_cash_expected": num, "total_cash_counted": num,
		"total_cash_difference": num, "total_discounts": num,
		"credit_notes_count": num, "credit_notes_total": num,
		"session_ids": jsn, "vat_breakdown": jsn, "totals_by_method": jsn,
		"full_report":    jsn,
		"schema_version": num, "collected_ttc": num,
		"collected_from_receivables_ttc": num, "collected_deposits_ttc": num,
		"refunds_ttc": num, "collected_by_method": jsn,
		"pos_ticket_count": num, "external_invoice_count": num,
		"sales_documents": jsn,
	})

	return app
}

func creerCollectionDeTest(t *testing.T, app *pocketbase.PocketBase, nom string, champs map[string]string) {
	t.Helper()

	col := &models.Collection{Name: nom, Type: models.CollectionTypeBase}
	for champ, typ := range champs {
		col.Schema.AddField(&schema.SchemaField{Name: champ, Type: typ})
	}
	if err := app.Dao().SaveCollection(col); err != nil {
		t.Fatalf("création de %s: %v", nom, err)
	}
}

func creerCaisse(t *testing.T, app *pocketbase.PocketBase, societe string) *models.Record {
	t.Helper()

	col, err := app.Dao().FindCollectionByNameOrId("cash_registers")
	if err != nil {
		t.Fatalf("collection cash_registers: %v", err)
	}
	rec := models.NewRecord(col)
	rec.Set("owner_company", societe)
	rec.Set("code", "C1")
	rec.Set("name", "Comptoir")
	rec.Set("is_active", true)
	if err := app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("création de la caisse: %v", err)
	}
	return rec
}

// Un encaissement à 00 h 30 appartient à la journée du COMMERÇANT, pas à celle
// d'UTC. Mesuré le 29 août 2026 : `opened_at` s'écrivait en heure locale
// suffixée d'un « Z », soit deux heures inventées par rapport au `created` du
// ticket. Corrigé — l'instant est stocké en UTC, la journée reste locale.
func TestLaJourneeEstCelleDuCommercantPasCelleDUTC(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	caisse := creerCaisse(t, app, "co1")

	// 00 h 30, heure locale : en été à Paris, c'est 22 h 30 UTC la VEILLE.
	minuitPasse := time.Date(2026, 8, 30, 0, 30, 0, 0, time.Local)
	matin := time.Date(2026, 8, 30, 9, 0, 0, 0, time.Local)

	premiere, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user1", minuitPasse)
	if err != nil {
		t.Fatalf("encaissement de 00 h 30: %v", err)
	}
	seconde, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user1", matin)
	if err != nil {
		t.Fatalf("encaissement du matin: %v", err)
	}

	if premiere.Id != seconde.Id {
		t.Fatalf("00 h 30 et 9 h du MÊME jour ont donné deux sessions : la journée " +
			"a été lue en UTC et non en heure locale")
	}

	// Et l'instant stocké est bien de l'UTC, pas de l'heure locale déguisée.
	if jourLocalDe(premiere.GetString("opened_at")) != "2026-08-30" {
		t.Fatalf("opened_at = %q ne se relit pas comme le 30 août local",
			premiere.GetString("opened_at"))
	}
}
