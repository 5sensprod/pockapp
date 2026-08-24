package reports

import (
	"testing"
)

// Une session fermée le jour d'un Z déjà émis ne peut plus être clôturée par
// une génération : GenerateRapportZ rend le rapport existant sans rien y
// ajouter. Son argent reste alors hors clôture indéfiniment — deux sessions
// dans ce cas en production le 24 août 2026, dont une portant 140,67 €.
//
// Le rattachement corrige le DÉCOUPAGE du rapport, puis le rejeu refait ses
// valeurs par aggregateZ. Ce test vérifie les trois choses qui doivent tenir
// ensemble : les deux moitiés du lien sont posées, les tickets entrent dans les
// totaux, et rien n'est compté deux fois.
func TestRattacherUneSessionQueLeZDuJourAvaitManquee(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)

	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"date": jour, "total_ht": 41.67, "total_tva": 8.33, "total_ttc": 50.00,
		"payment_method": "cb", "payment_method_label": "cb",
	})

	rapport, err := GenerateRapportZ(app, caisse.Id, jour)
	if err != nil {
		t.Fatalf("génération du Z: %v", err)
	}
	if rapport.DailyTotals.TotalTTC != 50.00 {
		t.Fatalf("ventes du jour au départ = %.2f, attendu 50,00",
			rapport.DailyTotals.TotalTTC)
	}

	// La seconde session est fermée LE MÊME JOUR, après la clôture. Elle porte
	// 30 € et personne ne les a jamais clôturés.
	orpheline := creerEnregistrement(t, app, "cash_sessions", map[string]any{
		"owner_company": societeDeTest, "cash_register": caisse.Id,
		"status":    "closed",
		"opened_at": jour + " 19:30:00.000Z", "closed_at": jour + " 20:00:00.000Z",
		"opening_float": 0.0, "z_report_id": "",
	})
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": orpheline.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"date": jour, "total_ht": 25.00, "total_tva": 5.00, "total_ttc": 30.00,
		"payment_method": "cb", "payment_method_label": "cb",
	})

	// Le constat qui motive tout : régénérer ne rattrape rien.
	rejeu, err := GenerateRapportZ(app, caisse.Id, jour)
	if err != nil {
		t.Fatalf("re-génération: %v", err)
	}
	if rejeu.DailyTotals.TotalTTC != 50.00 {
		t.Fatalf("la re-génération a changé le rapport (%.2f) : elle est censée "+
			"rendre l'existant tel quel", rejeu.DailyTotals.TotalTTC)
	}

	liens, err := RattacherSessionsOrphelines(app, societeDeTest, true)
	if err != nil {
		t.Fatalf("rattachement: %v", err)
	}
	if len(liens) != 1 {
		t.Fatalf("sessions rattachées = %d, attendu 1", len(liens))
	}
	if liens[0].Erreur != "" {
		t.Fatalf("erreur au rattachement : %s", liens[0].Erreur)
	}
	if liens[0].NouveauTTC != 80.00 {
		t.Errorf("ventes annoncées après rattachement = %.2f, attendu 80,00",
			liens[0].NouveauTTC)
	}

	// Les deux moitiés du lien. N'en poser qu'une laisserait le problème dans
	// l'autre sens : un rapport qui compte une session que rien ne dit close, ou
	// une session close qu'aucun rapport ne compte.
	sessionRelue, err := app.Dao().FindRecordById("cash_sessions", orpheline.Id)
	if err != nil {
		t.Fatalf("relecture de la session: %v", err)
	}
	if sessionRelue.GetString("z_report_id") != rapport.ZReportId {
		t.Errorf("z_report_id de la session = %q, attendu %q",
			sessionRelue.GetString("z_report_id"), rapport.ZReportId)
	}
	zRelu, err := app.Dao().FindRecordById("z_reports", rapport.ZReportId)
	if err != nil {
		t.Fatalf("relecture du rapport: %v", err)
	}
	ids := zRelu.GetStringSlice("session_ids")
	if len(ids) != 2 || !contient(ids, orpheline.Id) {
		t.Fatalf("session_ids = %v, attendu les deux sessions", ids)
	}

	// Le rattachement ne touche AUCUNE valeur : c'est le rejeu qui les refait.
	if zRelu.GetFloat("total_ttc") != 50.00 {
		t.Errorf("le rattachement a écrit des totaux (%.2f) : ce n'est pas son rôle",
			zRelu.GetFloat("total_ttc"))
	}

	if _, err := RepairZReports(app, true); err != nil {
		t.Fatalf("rejeu: %v", err)
	}
	zApresRejeu, err := app.Dao().FindRecordById("z_reports", rapport.ZReportId)
	if err != nil {
		t.Fatalf("relecture après rejeu: %v", err)
	}
	if zApresRejeu.GetFloat("total_ttc") != 80.00 {
		t.Errorf("ventes du jour après rejeu = %.2f, attendu 80,00",
			zApresRejeu.GetFloat("total_ttc"))
	}
	if zApresRejeu.GetInt("invoice_count") != 2 {
		t.Errorf("tickets comptés = %d, attendu 2",
			zApresRejeu.GetInt("invoice_count"))
	}

	// Relancé, le rattachement ne doit plus rien trouver — et surtout ne pas
	// ajouter une seconde fois la session à `session_ids`.
	encore, err := RattacherSessionsOrphelines(app, societeDeTest, true)
	if err != nil {
		t.Fatalf("second rattachement: %v", err)
	}
	if len(encore) != 0 {
		t.Errorf("le second passage a retrouvé %d session(s) : le lien n'a pas tenu",
			len(encore))
	}
}

// Une session orpheline dont la journée ne porte AUCUN Z n'est pas l'affaire de
// ce code : `z-clotures` sait émettre son rapport, et inventer ici un
// rattachement vers un Z d'un autre jour redécouperait l'histoire.
func TestLeRattachementIgnoreLesJourneesSansZ(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)

	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"date": jour, "total_ht": 41.67, "total_tva": 8.33, "total_ttc": 50.00,
		"payment_method": "cb", "payment_method_label": "cb",
	})

	liens, err := RattacherSessionsOrphelines(app, societeDeTest, true)
	if err != nil {
		t.Fatalf("rattachement: %v", err)
	}
	if len(liens) != 0 {
		t.Fatalf("sessions rattachées = %d, attendu 0 : la journée n'a pas de Z",
			len(liens))
	}
	relue, err := app.Dao().FindRecordById("cash_sessions", session.Id)
	if err != nil {
		t.Fatalf("relecture: %v", err)
	}
	if relue.GetString("z_report_id") != "" {
		t.Errorf("la session a été rattachée à %q alors qu'aucun Z n'existe",
			relue.GetString("z_report_id"))
	}
	_ = caisse
}
