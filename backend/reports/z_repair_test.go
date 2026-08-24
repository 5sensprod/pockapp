package reports

import (
	"testing"
)

// Le rejeu doit écrire dès que le CONTENU d'un rapport diffère, pas seulement
// quand son hash change.
//
// Tout ce qui est recalculé n'entre pas dans le hash : les montants du
// rapprochement espèces en sont absents. Une correction qui ne touchait qu'eux
// laissait donc le hash identique, et la condition d'écriture la faisait passer
// à la trappe — recalculée à chaque rejeu, jamais écrite.
//
// Constaté en production le 24 août 2026 : le correctif `refund_out` sur les
// espèces attendues d'un rapport, 4,00 €, restait sans effet après plusieurs
// rejeux pourtant appliqués. Le rapprochement espèces est le seul chiffre que le
// commerçant vérifie contre son tiroir ; le laisser faux parce qu'il n'est pas
// haché serait exactement le mauvais arbitrage.
func TestLeRejeuEcritMemeQuandLeHashNeChangePas(t *testing.T) {
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
	// Fonds de caisse 100 €, aucun mouvement : espèces attendues = 100 €.
	if rapport.DailyTotals.TotalCashExpected != 100.00 {
		t.Fatalf("espèces attendues au départ = %.2f, attendu 100,00",
			rapport.DailyTotals.TotalCashExpected)
	}
	hashAvant := rapport.Hash

	// Un mouvement d'espèces apparaît APRÈS la clôture — exactement ce que
	// corrige un rejeu. Il ne touche AUCUN champ haché.
	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"movement_type": "refund_out", "amount": 4.00, "reason": "avoir",
	})

	bilan, err := RepairZReports(app, true)
	if err != nil {
		t.Fatalf("rejeu: %v", err)
	}
	if len(bilan.Entries) != 1 {
		t.Fatalf("rapports examinés = %d, attendu 1", len(bilan.Entries))
	}
	if bilan.Entries[0].Change {
		t.Errorf("le hash a changé : le test ne couvre plus le cas qu'il vise")
	}

	rec, err := app.Dao().FindRecordById("z_reports", rapport.ZReportId)
	if err != nil {
		t.Fatalf("relecture du rapport: %v", err)
	}
	if rec.GetFloat("total_cash_expected") != 96.00 {
		t.Errorf("espèces attendues en base = %.2f, attendu 96,00 : la correction "+
			"a été calculée puis jamais écrite",
			rec.GetFloat("total_cash_expected"))
	}
	if rec.GetString("hash") != hashAvant {
		t.Errorf("le hash a été réécrit alors que rien de haché n'a changé")
	}
}
