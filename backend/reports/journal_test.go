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

// La journée d'un ticket est réputée clôturée si la SESSION de ce ticket est
// entrée dans un Z — pas si un Z porte la date de la journée.
//
// La nuance n'est pas théorique : mesuré sur la base de production, 42 sessions
// sur 65 s'ouvrent un jour et se ferment le lendemain ou plus tard. Une session
// ouverte le 17 avril a été fermée le 30, avec 59 tickets. Chercher un Z daté du
// 17 avril afficherait « non clôturé » sur une journée dont les tickets sont
// bel et bien scellés dans le Z du 30.
func TestUneJourneeEstCloturneeParLaSessionPasParLaDate(t *testing.T) {
	app := nouvelleAppDeTest(t)

	caisse := creerEnregistrement(t, app, "cash_registers", map[string]any{
		"owner_company": societeDeTest, "code": "C1", "name": "Comptoir",
	})

	// Une session ouverte la veille et fermée le lendemain — le cas majoritaire.
	veille := time.Now().AddDate(0, 0, -2).Format("2006-01-02")
	lendemain := time.Now().AddDate(0, 0, -1).Format("2006-01-02")

	session := creerEnregistrement(t, app, "cash_sessions", map[string]any{
		"owner_company": societeDeTest, "cash_register": caisse.Id,
		"status":      "closed",
		"opened_at":   veille + " 18:00:00.000Z",
		"closed_at":   lendemain + " 09:00:00.000Z",
		"z_report_id": "",
	})

	// Le ticket est daté de la VEILLE, jour d'ouverture.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"date": veille, "paid_at": veille + " 18:30:00.000Z",
		"total_ht": 41.67, "total_tva": 8.33, "total_ttc": 50.00,
		"payment_method": "cb", "payment_method_label": "cb",
	})

	// Avant clôture : la journée de la veille attend son Z.
	jours, _, err := JournalDesVentes(app, societeDeTest, veille, lendemain)
	if err != nil {
		t.Fatalf("journal: %v", err)
	}
	avant := journeeDu(t, jours, veille)
	if avant.TicketsHorsZ != 1 {
		t.Errorf("tickets hors Z = %d, attendu 1 avant toute clôture", avant.TicketsHorsZ)
	}

	// Le Z est généré le jour de FERMETURE, pas celui du ticket.
	rapport, err := GenerateRapportZ(app, caisse.Id, lendemain)
	if err != nil {
		t.Fatalf("génération du Z: %v", err)
	}

	jours, _, err = JournalDesVentes(app, societeDeTest, veille, lendemain)
	if err != nil {
		t.Fatalf("journal: %v", err)
	}
	apres := journeeDu(t, jours, veille)

	if apres.TicketsHorsZ != 0 {
		t.Errorf("tickets hors Z = %d après clôture, attendu 0 : le ticket est "+
			"dans %s, daté du lendemain", apres.TicketsHorsZ, rapport.Number)
	}
	if len(apres.ZNumbers) != 1 || apres.ZNumbers[0] != rapport.Number {
		t.Errorf("rapports couvrant la journée = %v, attendu [%s]",
			apres.ZNumbers, rapport.Number)
	}
}

// Une journée sans le moindre ticket n'a rien à clôturer : l'absence de Z n'y
// est pas une anomalie. C'est le cas de la plupart des journées — 65 sessions
// pour 171 journées d'activité — où l'argent arrive par facture hors caisse.
func TestUneJourneeSansTicketNAttendAucunZ(t *testing.T) {
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
	j := journeeDu(t, jours, jour)

	if j.NbTickets != 0 {
		t.Errorf("tickets = %d, attendu 0", j.NbTickets)
	}
	if j.TicketsHorsZ != 0 {
		t.Errorf("tickets hors Z = %d, attendu 0 : sans ticket, rien à clôturer",
			j.TicketsHorsZ)
	}
	if j.VentesDuJour != 120.00 {
		t.Errorf("ventes du jour = %.2f, attendu 120,00", j.VentesDuJour)
	}
}

// Les sessions fermées sans Z sont le SEUL manque réel de clôture, et elles se
// listent hors de toute période : une session de janvier doit rester visible
// quand on regarde les trente derniers jours.
func TestLesSessionsFermeesSansZSontListees(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)

	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"date": jour, "total_ht": 41.67, "total_tva": 8.33, "total_ttc": 50.00,
		"payment_method": "cb", "payment_method_label": "cb",
	})

	attente, err := SessionsEnAttenteDeZ(app, societeDeTest)
	if err != nil {
		t.Fatalf("sessions en attente: %v", err)
	}
	if len(attente) != 1 {
		t.Fatalf("sessions en attente = %d, attendu 1", len(attente))
	}
	if attente[0].NbTickets != 1 || attente[0].TTC != 50.00 {
		t.Errorf("session en attente : %d ticket(s), %.2f € — attendu 1 et 50,00",
			attente[0].NbTickets, attente[0].TTC)
	}
	if attente[0].JourDejaClos {
		t.Errorf("la session est annoncée bloquée alors qu'aucun Z ne porte ce jour")
	}

	// Une fois le Z généré, plus rien n'attend.
	if _, err := GenerateRapportZ(app, caisse.Id, jour); err != nil {
		t.Fatalf("génération du Z: %v", err)
	}
	attente, err = SessionsEnAttenteDeZ(app, societeDeTest)
	if err != nil {
		t.Fatalf("sessions en attente: %v", err)
	}
	if len(attente) != 0 {
		t.Errorf("sessions en attente = %d après clôture, attendu 0", len(attente))
	}
}

func journeeDu(t *testing.T, jours []JournalJour, date string) JournalJour {
	t.Helper()
	for _, j := range jours {
		if j.Date == date {
			return j
		}
	}
	t.Fatalf("journée %s absente du journal", date)
	return JournalJour{}
}

// Les documents d'une journée se lisent dans l'ordre où ils se sont produits.
//
// Le journal les collecte par PASSES — tous les tickets de caisse, puis les
// documents hors caisse — et sans tri final ils sortaient dans cet ordre-là :
// le 20 août 2026, un ticket de 15:28 s'affichait au-dessus des factures de
// 10:05 et 14:02. La journée était juste au centime près, et illisible.
func TestLesDocumentsDUneJourneeSortentDansLOrdreDesHeures(t *testing.T) {
	app := nouvelleAppDeTest(t)
	_, session, jour := caisseEtSessionDuJour(t, app)

	// Deux factures hors caisse le matin et l'après-midi, un ticket entre les
	// deux — c'est la journée du 20 août en miniature.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "invoice", "is_paid": true,
		"number": "FAC-103",
		"date":   jour + " 10:05:00.000Z", "paid_at": jour + " 10:05:00.000Z",
		"total_ht": 157.50, "total_tva": 31.50, "total_ttc": 189.00,
		"payment_method": "cb", "payment_method_label": "cb",
	})
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "invoice", "is_paid": true,
		"number": "FAC-104",
		"date":   jour + " 14:02:00.000Z", "paid_at": jour + " 14:02:00.000Z",
		"total_ht": 235.04, "total_tva": 47.01, "total_ttc": 282.05,
		"payment_method": "multi", "payment_method_label": "multi",
	})
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"number": "TIK-821",
		"date":   jour + " 15:28:00.000Z", "paid_at": jour + " 15:28:00.000Z",
		"total_ht": 3.80, "total_tva": 0.76, "total_ttc": 4.56,
		"payment_method": "card", "payment_method_label": "Carte bancaire",
	})

	jours, _, err := JournalDesVentes(app, societeDeTest, jour, jour)
	if err != nil {
		t.Fatalf("journal: %v", err)
	}
	if len(jours) != 1 {
		t.Fatalf("journées rendues = %d, attendu 1", len(jours))
	}

	attendu := []string{"FAC-103", "FAC-104", "TIK-821"}
	obtenu := make([]string, 0, len(jours[0].Documents))
	for _, d := range jours[0].Documents {
		obtenu = append(obtenu, d.Number)
	}
	if len(obtenu) != len(attendu) {
		t.Fatalf("documents = %v, attendu %v", obtenu, attendu)
	}
	for i := range attendu {
		if obtenu[i] != attendu[i] {
			t.Fatalf("ordre des documents = %v, attendu %v (par heure)", obtenu, attendu)
		}
	}

	heures := []string{"10:05", "14:02", "15:28"}
	for i, d := range jours[0].Documents {
		if d.Heure != heures[i] {
			t.Errorf("heure du document %s = %q, attendu %q", d.Number, d.Heure, heures[i])
		}
	}
}

// Un encaissement non horodaté — `paid_at` à minuit — se range à l'heure de sa
// CRÉATION, et non en tête de journée.
//
// C'est le repli de `instantDe`, et il vaut mieux que l'alternative : une date à
// minuit placerait le document avant tous les autres, en annonçant une
// antériorité que rien ne mesure.
func TestUnEncaissementNonHorodateSeRangeAsonHeureDeCreation(t *testing.T) {
	app := nouvelleAppDeTest(t)
	_, _, jour := caisseEtSessionDuJour(t, app)

	// Créée en premier, mais sans heure d'encaissement : son `created` est
	// pourtant postérieur au 09:00 de la veille de l'autre facture.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "invoice", "is_paid": true,
		"number": "FAC-MINUIT",
		"date":   jour + " 00:00:00.000Z", "paid_at": jour + " 00:00:00.000Z",
		"total_ht": 50.00, "total_tva": 10.00, "total_ttc": 60.00,
		"payment_method": "cb", "payment_method_label": "cb",
	})
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "invoice", "is_paid": true,
		"number": "FAC-MATIN",
		"date":   jour + " 09:00:00.000Z", "paid_at": jour + " 09:00:00.000Z",
		"total_ht": 100.00, "total_tva": 20.00, "total_ttc": 120.00,
		"payment_method": "cb", "payment_method_label": "cb",
	})

	jours, _, err := JournalDesVentes(app, societeDeTest, jour, jour)
	if err != nil {
		t.Fatalf("journal: %v", err)
	}
	if len(jours[0].Documents) != 2 {
		t.Fatalf("documents = %d, attendu 2", len(jours[0].Documents))
	}
	if jours[0].Documents[0].Number != "FAC-MATIN" {
		t.Errorf("premier document = %s, attendu FAC-MATIN : le document dont "+
			"l'encaissement n'est pas horodaté a pris la tête de la journée",
			jours[0].Documents[0].Number)
	}
	if jours[0].Documents[1].Heure == "00:00" {
		t.Errorf("le document rendu annonce 00:00 : le repli sur `created` " +
			"n'a pas joué")
	}
}
