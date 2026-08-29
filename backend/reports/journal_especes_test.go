package reports

import (
	"testing"
	"time"
)

// Le solde théorique du tiroir doit être l'équation du §3.1 de
// 05-le-z-v3-et-le-journal-especes.md, et pas une autre :
//
//	fonds + espèces des ventes + apports − sorties − remises − remboursements
//
// Chacun des termes est indispensable quelle que soit sa nature comptable : un
// apport de fonds n'est pas une vente, mais il est bien dans le tiroir. Ignorer
// les mouvements libres creusait, sur les Z, un écart fictif de 7 686,14 € sur
// 17 rapports — c'est la mesure qui a fait renoncer à les retirer du calcul.
func TestLeSoldeDuTiroirEstLaSommeDeSesFlux(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)
	_ = caisse

	// Une vente en espèces : matérialisée par un cash_in portant la pièce.
	facture := creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"number": "TCK-001", "date": jour + " 10:00:00.000Z",
		"total_ht": 41.67, "total_tva": 8.33, "total_ttc": 50.00,
		"payment_method": "especes", "payment_method_label": "especes",
	})
	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"movement_type": "cash_in", "amount": 50.00,
		"related_invoice": facture.Id, "reason": "vente",
	})

	// Un apport libre, une remise en banque, un remboursement espèces.
	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"movement_type": "cash_in", "amount": 20.00, "reason": "appoint monnaie",
	})
	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"movement_type": "safe_drop", "amount": 300.00, "reason": "pour la banque",
	})
	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"movement_type": "refund_out", "amount": 10.00, "reason": "avoir",
	})

	aujourdhui := time.Now().Format("2006-01-02")
	jours, totaux, err := JournalDesEspeces(app, societeDeTest, jour, aujourdhui)
	if err != nil {
		t.Fatalf("journal des espèces: %v", err)
	}

	var journee *JourneeEspeces
	for i := range jours {
		if jours[i].NbMouvements > 0 {
			journee = &jours[i]
			break
		}
	}
	if journee == nil {
		t.Fatal("aucune journée ne porte de mouvement")
	}

	// Les deux populations sont séparées : la vente n'est pas un apport.
	if journee.EspecesDesVentes != 50.00 {
		t.Errorf("espèces des ventes = %.2f, attendu 50,00", journee.EspecesDesVentes)
	}
	if journee.Apports != 20.00 {
		t.Errorf("apports = %.2f, attendu 20,00 : une vente n'est pas un apport",
			journee.Apports)
	}
	if journee.RemisesEnBanque != 300.00 {
		t.Errorf("remises = %.2f, attendu 300,00", journee.RemisesEnBanque)
	}
	if journee.Remboursements != 10.00 {
		t.Errorf("remboursements = %.2f, attendu 10,00 : refund_out sort du tiroir",
			journee.Remboursements)
	}

	// Le solde : fonds (100, posé par caisseEtSessionDuJour) + 50 + 20 − 300 − 10.
	attendu := journee.SoldeOuverture + 50.00 + 20.00 - 300.00 - 10.00
	if journee.SoldeTheorique != roundAmount(attendu) {
		t.Errorf("solde théorique = %.2f, attendu %.2f",
			journee.SoldeTheorique, roundAmount(attendu))
	}

	if totaux.NbMouvements != 4 {
		t.Errorf("%d mouvements au cumul, attendu 4", totaux.NbMouvements)
	}
}

// Le fonds d'ouverture est un SOLDE, pas un flux : il ne doit jamais être
// compté comme un apport. L'erreur inverse compterait chaque jour comme une
// entrée l'argent qui était déjà dans le tiroir la veille.
func TestLeFondsDOuvertureNEstPasUnApport(t *testing.T) {
	app := nouvelleAppDeTest(t)
	_, session, jour := caisseEtSessionDuJour(t, app)
	_ = session

	aujourdhui := time.Now().Format("2006-01-02")
	jours, totaux, err := JournalDesEspeces(app, societeDeTest, jour, aujourdhui)
	if err != nil {
		t.Fatalf("journal des espèces: %v", err)
	}

	for _, j := range jours {
		if j.Apports != 0 {
			t.Errorf("le %s porte %.2f d'apports sans aucun mouvement : "+
				"le fonds d'ouverture y est entré comme un flux", j.Date, j.Apports)
		}
		if j.OuvertureConnue && j.SoldeTheorique != j.SoldeOuverture {
			t.Errorf("le %s : solde %.2f pour une ouverture à %.2f sans mouvement",
				j.Date, j.SoldeTheorique, j.SoldeOuverture)
		}
	}
	if totaux.Apports != 0 {
		t.Errorf("cumul des apports = %.2f, attendu 0", totaux.Apports)
	}
}

// Un mouvement sans pièce liée est du tiroir ; un mouvement qui porte une pièce
// est une vente. Le discriminant est fixé à un seul endroit (§6 question D du
// contrat v3), et il lit `related_invoice` OU `meta` — les deux, jamais l'un
// seulement, parce que les deux existent en base.
func TestLeDiscriminantDesMouvementsDeVenteLitLesDeuxSources(t *testing.T) {
	app := nouvelleAppDeTest(t)
	_, session, jour := caisseEtSessionDuJour(t, app)

	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"movement_type": "cash_in", "amount": 30.00,
		"meta": map[string]any{"invoice_number": "TCK-042"},
	})
	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"movement_type": "cash_in", "amount": 7.00, "reason": "eau Carrefour",
	})

	aujourdhui := time.Now().Format("2006-01-02")
	jours, _, err := JournalDesEspeces(app, societeDeTest, jour, aujourdhui)
	if err != nil {
		t.Fatalf("journal des espèces: %v", err)
	}

	natures := make(map[string]float64)
	for _, j := range jours {
		for _, m := range j.Mouvements {
			natures[m.Nature] += m.Montant
		}
	}

	if natures["vente"] != 30.00 {
		t.Errorf("mouvements de vente = %.2f, attendu 30,00 : "+
			"le numéro de pièce dans `meta` n'a pas été lu", natures["vente"])
	}
	if natures["tiroir"] != 7.00 {
		t.Errorf("mouvements de tiroir = %.2f, attendu 7,00", natures["tiroir"])
	}
}

// Une session fermée sans Z mais SANS AUCUN DOCUMENT ne doit pas alerter.
//
// Le bandeau du journal des ventes existe pour dire « de l'argent est hors
// clôture ». Une session vide n'en porte aucun — et son alerte serait
// indéracinable : on ne peut ni générer un Z vide, ni supprimer la session
// (z_repair.go relit session_ids). Constaté le 29 août 2026 : « 1 session(s)
// fermée(s) sans rapport Z — 0,00 € ».
func TestUneSessionVideNAlertePas(t *testing.T) {
	app := nouvelleAppDeTest(t)

	caisse := creerEnregistrement(t, app, "cash_registers", map[string]any{
		"owner_company": societeDeTest, "code": "C1", "name": "Comptoir",
	})
	jour := time.Now().AddDate(0, 0, -1).Format("2006-01-02")

	// Une session vide, fermée, sans Z.
	creerEnregistrement(t, app, "cash_sessions", map[string]any{
		"owner_company": societeDeTest, "cash_register": caisse.Id,
		"status":    "closed",
		"opened_at": jour + " 08:00:00.000Z", "closed_at": jour + " 19:00:00.000Z",
		"opening_float": 227.68, "z_report_id": "",
	})

	// Une seconde, fermée sans Z elle aussi, mais qui porte un ticket.
	avecTicket := creerEnregistrement(t, app, "cash_sessions", map[string]any{
		"owner_company": societeDeTest, "cash_register": caisse.Id,
		"status":    "closed",
		"opened_at": jour + " 08:00:00.000Z", "closed_at": jour + " 19:30:00.000Z",
		"opening_float": 100.0, "z_report_id": "",
	})
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": avecTicket.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"number": "TCK-950", "date": jour + " 10:00:00.000Z",
		"total_ht": 41.67, "total_tva": 8.33, "total_ttc": 50.00,
		"payment_method": "especes", "payment_method_label": "especes",
	})

	attente, err := SessionsEnAttenteDeZ(app, societeDeTest)
	if err != nil {
		t.Fatalf("sessions en attente: %v", err)
	}

	if len(attente) != 1 {
		t.Fatalf("%d session(s) signalée(s), attendu 1 — la session vide alerte "+
			"pour 0,00 €, et son alerte serait indéracinable", len(attente))
	}
	if attente[0].TTC != 50.00 {
		t.Fatalf("la session signalée porte %.2f €, attendu 50,00", attente[0].TTC)
	}
}
