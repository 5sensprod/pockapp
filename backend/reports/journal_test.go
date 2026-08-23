package reports

import (
	"testing"
	"time"
)

// LE gardien du journal des ventes : sur une journée donnée, il doit annoncer
// EXACTEMENT ce que le rapport Z annonce.
//
// Ce n'est pas une élégance, c'est la raison d'être du partage du
// classificateur. Le commerçant lit les deux documents ; s'ils divergeaient
// d'un centime, il ne saurait plus lequel croire — et c'est précisément ce qui
// s'est produit le 20 mai 2026, quand deux chemins d'agrégation ont divergé en
// silence pendant trois mois.
//
// La journée est chargée à dessein : un ticket, une facture encaissée le jour
// même, une facture antérieure, un acompte, un avoir remboursé, une conversion
// de ticket, et un avoir d'annulation. Les quatre lignes sont donc toutes
// occupées, et les deux exclusions nommées sont exercées.
func TestLeJournalDitLaMemeChoseQueLeZ(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)
	veille := time.Now().AddDate(0, 0, -10).Format("2006-01-02")

	// Ligne 1 — un ticket de caisse.
	ticket := creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"date": jour, "paid_at": jour + " 10:00:00.000Z",
		"total_ht": 41.67, "total_tva": 8.33, "total_ttc": 50.00,
		"payment_method": "especes", "payment_method_label": "especes",
	})

	// Ligne 1 — une facture émise et encaissée le jour même.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "invoice", "is_paid": true,
		"date": jour + " 10:00:00.000Z", "paid_at": jour + " 10:30:00.000Z",
		"total_ht": 200.00, "total_tva": 40.00, "total_ttc": 240.00,
		"payment_method": "cb", "payment_method_label": "cb",
	})

	// Ligne 2 — un règlement de facture antérieure.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "invoice", "is_paid": true,
		"date": veille + " 10:00:00.000Z", "paid_at": jour + " 11:00:00.000Z",
		"total_ht": 250.00, "total_tva": 50.00, "total_ttc": 300.00,
		"payment_method": "cheque", "payment_method_label": "cheque",
	})

	// Ligne 3 — un acompte.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "deposit", "is_paid": true,
		"date": jour + " 12:00:00.000Z", "paid_at": jour + " 12:00:00.000Z",
		"total_ttc": 80.50, "payment_method": "cb", "payment_method_label": "cb",
	})

	// Ligne 4 — un avoir POS remboursé en espèces.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "credit_note",
		"date": jour, "total_ttc": -30.00, "refund_method": "especes",
	})

	// Nulle part — une conversion du ticket ci-dessus en facture.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "invoice", "is_paid": true,
		"original_invoice_id": ticket.Id,
		"date":                jour + " 13:00:00.000Z", "paid_at": jour + " 13:00:00.000Z",
		"total_ht": 41.67, "total_tva": 8.33, "total_ttc": 50.00,
		"payment_method": "especes", "payment_method_label": "especes",
	})

	// Nulle part — un avoir hors caisse sans moyen de remboursement.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "credit_note",
		"date": jour + " 14:00:00.000Z", "total_ttc": -300.00,
		"refund_method": "", "payment_method": "",
	})

	// ── Le journal, avant toute clôture ────────────────────────────────────
	jours, totaux, err := JournalDesVentes(app, societeDeTest, jour, jour)
	if err != nil {
		t.Fatalf("journal: %v", err)
	}
	if len(jours) != 1 {
		t.Fatalf("journées rendues = %d, attendu 1", len(jours))
	}
	j := jours[0]

	// ── Le Z de la même journée ────────────────────────────────────────────
	z := genererZ(t, app, caisse.Id, jour)

	for _, cas := range []struct {
		nom           string
		journal, zeta float64
	}{
		{"ligne 1 — ventes du jour", j.VentesDuJour, z.TotalTTC},
		{"ligne 2 — créances", j.Creances, z.CollectedFromReceivablesTTC},
		{"ligne 3 — acomptes", j.Acomptes, z.CollectedDepositsTTC},
		{"ligne 4 — remboursements", j.Remboursements, z.RefundsTTC},
		{"total encaissé", j.Encaisse, z.CollectedTTC},
		{"base HT des ventes du jour", j.VentesHT, z.TotalHT},
		{"TVA des ventes du jour", j.VentesTVA, z.TotalTVA},
	} {
		if cas.journal != cas.zeta {
			t.Errorf("%s : le journal dit %.2f, le Z dit %.2f — les deux documents se contredisent",
				cas.nom, cas.journal, cas.zeta)
		}
	}

	// Et le journal s'équilibre lui-même.
	somme := roundAmount(j.VentesDuJour + j.Creances + j.Acomptes - j.Remboursements)
	if somme != j.Encaisse {
		t.Errorf("total encaissé = %.2f, mais la somme des quatre lignes vaut %.2f",
			j.Encaisse, somme)
	}
	if totaux.Encaisse != j.Encaisse {
		t.Errorf("cumul de la période = %.2f, attendu %.2f", totaux.Encaisse, j.Encaisse)
	}

	// Les deux documents écartés ne doivent apparaître dans aucune ligne du
	// détail : ni la conversion de ticket, ni l'avoir d'annulation.
	for _, d := range j.Documents {
		if d.TTC == 300.00 && d.Nature == "avoir" {
			t.Errorf("l'avoir d'annulation de 300 € est entré au journal")
		}
	}
	if j.NbDocuments != 5 {
		t.Errorf("documents au journal = %d, attendu 5 (ticket, facture du jour, "+
			"créance, acompte, avoir remboursé)", j.NbDocuments)
	}
}

// Une journée sans clôture doit quand même être visible : c'est tout l'objet du
// journal. Mesuré en production, 69 % de l'argent hors caisse tombe des jours
// sans aucun rapport Z — un journal fondé sur les z_reports laisserait le
// commerçant aveugle la moitié du temps.
func TestLeJournalVoitUnJourSansRapportZ(t *testing.T) {
	app := nouvelleAppDeTest(t)
	_, _, jour := caisseEtSessionDuJour(t, app)

	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "invoice", "is_paid": true,
		"date": jour + " 09:00:00.000Z", "paid_at": jour + " 09:00:00.000Z",
		"total_ht": 100.00, "total_tva": 20.00, "total_ttc": 120.00,
		"payment_method": "cb", "payment_method_label": "cb",
	})

	jours, _, err := JournalDesVentes(app, societeDeTest, jour, jour)
	if err != nil {
		t.Fatalf("journal: %v", err)
	}
	if len(jours) != 1 {
		t.Fatalf("journées rendues = %d, attendu 1", len(jours))
	}
	if jours[0].VentesDuJour != 120.00 {
		t.Errorf("ventes du jour = %.2f, attendu 120,00", jours[0].VentesDuJour)
	}
	if len(jours[0].ZNumbers) != 0 {
		t.Errorf("la journée est annoncée clôturée (%v) alors qu'aucun Z n'existe",
			jours[0].ZNumbers)
	}
}
