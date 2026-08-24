package reports

import (
	"testing"
)

// Une session ouverte pour la seule saisie d'une remise en banque porte un
// fonds déjà net de cette remise, que le mouvement retranche une seconde fois :
// les espèces attendues tombent sous zéro. Corriger le FONDS remet le
// rapprochement d'aplomb sans toucher au mouvement — la remise a eu lieu, elle
// doit rester tracée.
func TestCorrigerLeFondsRemetLesEspecesAttenduesDAplomb(t *testing.T) {
	app := nouvelleAppDeTest(t)
	_, session, _ := caisseEtSessionDuJour(t, app)

	// Le décor du 03/06/2026 en miniature : fonds saisi APRÈS la remise, et la
	// remise en mouvement. Fonds 100 (posé par le décor), sortie 300.
	session.Set("counted_cash_total", 99.85)
	if err := app.Dao().SaveRecord(session); err != nil {
		t.Fatalf("comptage: %v", err)
	}
	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"movement_type": "cash_out", "amount": 300.00, "reason": "Dépôt banque",
	})

	avant, err := CorrigerFondsDOuverture(app, session.Id, 400.00, false)
	if err != nil {
		t.Fatalf("simulation: %v", err)
	}
	if avant.AncienAttendu != -200.00 {
		t.Fatalf("espèces attendues au départ = %.2f, attendu -200,00 : le décor "+
			"ne reproduit pas le cas", avant.AncienAttendu)
	}
	if avant.NouvelAttendu != 100.00 {
		t.Errorf("espèces attendues après = %.2f, attendu 100,00", avant.NouvelAttendu)
	}
	if avant.NouvelEcart != -0.15 {
		t.Errorf("écart après = %.2f, attendu -0,15", avant.NouvelEcart)
	}

	// Simulation : rien n'a bougé en base.
	relue, _ := app.Dao().FindRecordById("cash_sessions", session.Id)
	if relue.GetFloat("opening_float") != 100.00 {
		t.Fatalf("la simulation a écrit le fonds (%.2f)", relue.GetFloat("opening_float"))
	}

	if _, err := CorrigerFondsDOuverture(app, session.Id, 400.00, true); err != nil {
		t.Fatalf("application: %v", err)
	}
	relue, _ = app.Dao().FindRecordById("cash_sessions", session.Id)
	if relue.GetFloat("opening_float") != 400.00 {
		t.Errorf("fonds en base = %.2f, attendu 400,00", relue.GetFloat("opening_float"))
	}

	// Le mouvement n'est pas touché : la remise en banque reste tracée.
	movs, _ := app.Dao().FindRecordsByFilter("cash_movements",
		"session = '"+session.Id+"'", "", 0, 0)
	if len(movs) != 1 || movs[0].GetFloat("amount") != 300.00 {
		t.Errorf("le mouvement de remise a été altéré : %v", movs)
	}
}

// Le fonds d'une session déjà clôturée par un Z est scellé dans un document
// fiscal : le corriger sans rejeu laisserait le rapport en désaccord avec sa
// propre session. L'ordre est fonds → rattachement → rejeu, jamais l'inverse.
func TestLeFondsDUneSessionDejaDansUnZEstRefuse(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)

	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"date": jour, "total_ht": 41.67, "total_tva": 8.33, "total_ttc": 50.00,
		"payment_method": "cb", "payment_method_label": "cb",
	})
	if _, err := GenerateRapportZ(app, caisse.Id, jour); err != nil {
		t.Fatalf("génération du Z: %v", err)
	}

	if _, err := CorrigerFondsDOuverture(app, session.Id, 400.00, true); err == nil {
		t.Fatalf("la correction a été acceptée sur une session scellée dans un Z")
	}

	relue, _ := app.Dao().FindRecordById("cash_sessions", session.Id)
	if relue.GetFloat("opening_float") != 100.00 {
		t.Errorf("le fonds a été réécrit malgré le refus : %.2f",
			relue.GetFloat("opening_float"))
	}
}
