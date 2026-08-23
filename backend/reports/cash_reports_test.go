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

// ════════════════════════════════════════════════════════════════════════════
// Ticket Z-7 — les gardiens du contrat « un total, quatre lignes »
// (frontend/modules/cash/PocketCash-docs/04-refonte-du-z.md)
//
// Ce que ces tests protègent tient en une phrase : SEULE la ligne 1 est du
// chiffre d'affaires. Les trois autres sont de l'argent encaissé. Les
// confondre, c'est déclarer deux fois une TVA déjà déclarée — et le PDF du
// rapport Z part chez le comptable.
// ════════════════════════════════════════════════════════════════════════════

// Le cas COURANT, et de loin : 240 factures hors caisse sur 263 (91,3 %) sont
// réglées le jour même de leur émission. En magasin la facture n'est pas un
// instrument de crédit, c'est un ticket avec le nom du client dessus, établi
// pour la garantie. Elle est donc une vente du jour, au même titre qu'un ticket,
// et porte du HT et de la TVA.
func TestUneFactureEncaisseeLeJourDeSonEmissionEstUneVenteDuJour(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)
	_ = session

	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company":        societeDeTest,
		"is_pos_ticket":        false,
		"status":               "issued",
		"invoice_type":         "invoice",
		"is_paid":              true,
		"date":                 jour + " 10:00:00.000Z",
		"paid_at":              jour + " 10:05:00.000Z",
		"total_ht":             100.00,
		"total_tva":            20.00,
		"total_ttc":            120.00,
		"payment_method":       "cb",
		"payment_method_label": "cb",
	})

	totaux := genererZ(t, app, caisse.Id, jour)

	if totaux.TotalTTC != 120.00 {
		t.Errorf("ligne 1 (ventes du jour) = %.2f, attendu 120,00", totaux.TotalTTC)
	}
	if totaux.TotalTVA != 20.00 {
		t.Errorf("TVA de la ligne 1 = %.2f, attendu 20,00", totaux.TotalTVA)
	}
	if totaux.CollectedFromReceivablesTTC != 0 {
		t.Errorf("ligne 2 = %.2f, attendu 0 : la facture est émise ce jour",
			totaux.CollectedFromReceivablesTTC)
	}
}

// Une facture émise un jour antérieur et réglée aujourd'hui n'est PAS du chiffre
// d'affaires du jour : sa TVA a déjà été déclarée à l'émission. La fondre dans
// la ligne 1 la ferait déclarer deux fois. C'est le cœur de la refonte —
// 9 documents, 3 891,32 € mélangés dans les 46 Z existants.
func TestUneFactureAnterieureEntreEnLigne2EtJamaisEnLigne1(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, _, jour := caisseEtSessionDuJour(t, app)
	veille := time.Now().AddDate(0, 0, -10).Format("2006-01-02")

	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company":        societeDeTest,
		"is_pos_ticket":        false,
		"status":               "issued",
		"invoice_type":         "invoice",
		"is_paid":              true,
		"date":                 veille + " 14:00:00.000Z",
		"paid_at":              jour + " 11:00:00.000Z",
		"total_ht":             250.00,
		"total_tva":            50.00,
		"total_ttc":            300.00,
		"payment_method":       "cheque",
		"payment_method_label": "cheque",
	})

	totaux := genererZ(t, app, caisse.Id, jour)

	if totaux.TotalTTC != 0 {
		t.Errorf("ligne 1 = %.2f, attendu 0 : un règlement de créance n'est pas une vente du jour",
			totaux.TotalTTC)
	}
	if totaux.TotalTVA != 0 {
		t.Errorf("TVA de la ligne 1 = %.2f, attendu 0 : cette TVA a déjà été déclarée à l'émission",
			totaux.TotalTVA)
	}
	if totaux.CollectedFromReceivablesTTC != 300.00 {
		t.Errorf("ligne 2 = %.2f, attendu 300,00", totaux.CollectedFromReceivablesTTC)
	}
	if totaux.CollectedTTC != 300.00 {
		t.Errorf("total encaissé = %.2f, attendu 300,00 : l'argent est bien entré",
			totaux.CollectedTTC)
	}
}

// Un acompte n'est pas du chiffre d'affaires — sa facture parente porte le
// total — mais c'est de l'argent qui entre dans le tiroir. Il doit donc se
// retrouver en ligne 3 ET au rapprochement espèces, qui, lui, ne se déduit pas
// du total encaissé : il se lit sur les mouvements de caisse.
//
// Avant ce contrat, l'acompte n'était nulle part : le filtre
// `original_invoice_id` vide l'écartait par accident, et DepositsTTC restait
// structurellement à zéro.
func TestUnAcompteEspecesEntreEnLigne3EtAuRapprochement(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)

	parente := creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest,
		"is_pos_ticket": false,
		"status":        "issued",
		"invoice_type":  "invoice",
		"is_paid":       false,
		"date":          jour + " 09:00:00.000Z",
		"total_ttc":     974.00,
	})

	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company":        societeDeTest,
		"is_pos_ticket":        false,
		"status":               "issued",
		"invoice_type":         "deposit",
		"is_paid":              true,
		"original_invoice_id":  parente.Id,
		"date":                 jour + " 09:30:00.000Z",
		"paid_at":              jour + " 09:30:00.000Z",
		"total_ttc":            50.00,
		"payment_method":       "especes",
		"payment_method_label": "especes",
	})

	// L'argent au tiroir : CreateCashMovementIfEspeces pose ce mouvement.
	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest,
		"session":       session.Id,
		"movement_type": "cash_in",
		"amount":        50.00,
		"reason":        "acompte",
	})

	totaux := genererZ(t, app, caisse.Id, jour)

	if totaux.CollectedDepositsTTC != 50.00 {
		t.Errorf("ligne 3 (acomptes) = %.2f, attendu 50,00", totaux.CollectedDepositsTTC)
	}
	if totaux.TotalTTC != 0 || totaux.TotalTVA != 0 {
		t.Errorf("ligne 1 = %.2f TTC / %.2f TVA, attendu 0 : un acompte n'est pas du chiffre d'affaires",
			totaux.TotalTTC, totaux.TotalTVA)
	}
	// Rapprochement espèces : fonds de caisse (100) + le mouvement (50).
	if totaux.TotalCashExpected != 150.00 {
		t.Errorf("espèces attendues = %.2f, attendu 150,00", totaux.TotalCashExpected)
	}
	if totaux.CollectedByMethod["especes"] != 50.00 {
		t.Errorf("encaissé en espèces = %.2f, attendu 50,00",
			totaux.CollectedByMethod["especes"])
	}
}

// Une conversion de ticket en facture n'est un encaissement de personne : son
// chiffre d'affaires est DÉJÀ dans le ticket (ligne 1) et son règlement n'a pas
// eu lieu à la caisse ce jour-là — ConvertTicketToInvoicePage recopie is_paid et
// paid_at du ticket sans passer par pay.go, aucun mouvement de caisse n'est créé.
//
// Elle doit être écartée par une exclusion NOMMÉE — l'origine est un ticket —
// et non par un filtre sur `original_invoice_id` qui rejetait au passage les
// acomptes et les factures de solde.
func TestUneConversionDeTicketNEntreDansAucuneLigne(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)

	ticket := creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company":        societeDeTest,
		"session":              session.Id,
		"is_pos_ticket":        true,
		"status":               "issued",
		"invoice_type":         "invoice",
		"total_ht":             50.00,
		"total_tva":            10.00,
		"total_ttc":            60.00,
		"payment_method":       "cb",
		"payment_method_label": "cb",
	})

	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company":        societeDeTest,
		"is_pos_ticket":        false,
		"status":               "issued",
		"invoice_type":         "invoice",
		"is_paid":              true,
		"original_invoice_id":  ticket.Id,
		"date":                 jour + " 12:00:00.000Z",
		"paid_at":              jour + " 12:00:00.000Z",
		"total_ht":             50.00,
		"total_tva":            10.00,
		"total_ttc":            60.00,
		"payment_method":       "cb",
		"payment_method_label": "cb",
	})

	totaux := genererZ(t, app, caisse.Id, jour)

	if totaux.TotalTTC != 60.00 {
		t.Errorf("ligne 1 = %.2f, attendu 60,00 (le ticket seul ; 120,00 = conversion comptée deux fois)",
			totaux.TotalTTC)
	}
	if totaux.CollectedFromReceivablesTTC != 0 || totaux.CollectedDepositsTTC != 0 {
		t.Errorf("la conversion est entrée en ligne 2 (%.2f) ou 3 (%.2f) ; elle n'entre nulle part",
			totaux.CollectedFromReceivablesTTC, totaux.CollectedDepositsTTC)
	}
	if totaux.CollectedTTC != 60.00 {
		t.Errorf("total encaissé = %.2f, attendu 60,00", totaux.CollectedTTC)
	}
}

// L'invariant du contrat, et la raison d'être de sa forme : le total en tête est
// la somme des quatre lignes, ni plus ni moins. C'est le nombre que le
// commerçant reconnaît, celui qui doit correspondre à son tiroir et à sa banque.
func TestLeTotalEncaisseEgaleLaSommeDesQuatreLignes(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)
	veille := time.Now().AddDate(0, 0, -10).Format("2006-01-02")

	// Ligne 1 — un ticket de caisse.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"total_ht": 41.67, "total_tva": 8.33, "total_ttc": 50.00,
		"payment_method": "especes", "payment_method_label": "especes",
	})
	// Ligne 1 — une facture émise et payée ce jour.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "invoice", "is_paid": true,
		"date": jour + " 10:00:00.000Z", "paid_at": jour + " 10:00:00.000Z",
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
		"total_ttc": -30.00, "refund_method": "especes",
	})

	totaux := genererZ(t, app, caisse.Id, jour)

	const (
		ligne1 = 290.00 // 50,00 + 240,00
		ligne2 = 300.00
		ligne3 = 80.50
		ligne4 = 30.00
	)

	if totaux.TotalTTC != ligne1 {
		t.Errorf("ligne 1 = %.2f, attendu %.2f", totaux.TotalTTC, ligne1)
	}
	if totaux.CollectedFromReceivablesTTC != ligne2 {
		t.Errorf("ligne 2 = %.2f, attendu %.2f", totaux.CollectedFromReceivablesTTC, ligne2)
	}
	if totaux.CollectedDepositsTTC != ligne3 {
		t.Errorf("ligne 3 = %.2f, attendu %.2f", totaux.CollectedDepositsTTC, ligne3)
	}
	if totaux.RefundsTTC != ligne4 {
		t.Errorf("ligne 4 = %.2f, attendu %.2f", totaux.RefundsTTC, ligne4)
	}

	attendu := roundAmount(ligne1 + ligne2 + ligne3 - ligne4)
	if totaux.CollectedTTC != attendu {
		t.Errorf("total encaissé = %.2f, mais la somme de ses quatre lignes vaut %.2f",
			totaux.CollectedTTC, attendu)
	}

	var sommeMoyens float64
	for _, v := range totaux.CollectedByMethod {
		sommeMoyens += v
	}
	if roundAmount(sommeMoyens) != totaux.CollectedTTC {
		t.Errorf("ventilation du total encaissé = %.2f, mais total = %.2f",
			sommeMoyens, totaux.CollectedTTC)
	}

	if totaux.SchemaVersion != 2 {
		t.Errorf("schema_version = %d, attendu 2 : sans lui, un Z relu dans six mois "+
			"ne dira pas sous quelle règle son total_ht a été produit", totaux.SchemaVersion)
	}
}

// Ticket Z-4 — la règle anti-doublon parente / acompte / solde.
//
// Le modèle de deposit.go produit TROIS documents pour un seul encaissement
// possible, et les trois peuvent porter is_paid = true. Les sommer naïvement
// compterait l'argent deux fois : mesuré, 7 factures parentes dans ce cas, pour
// 2 523,70 €. Les cinq dossiers ci-dessous sont réels, repris du §2 du contrat.
func TestUnDossierAcompteNEstComptePasDeuxFois(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, _, jour := caisseEtSessionDuJour(t, app)

	dossiers := []struct {
		nom              string
		acompte, solde   float64
		attenduDuDossier float64
	}{
		{"FAC-2026-000076", 225.00, 525.00, 750.00},
		{"FAC-2026-000107", 50.00, 398.00, 448.00},
		{"FAC-2026-000118", 10.00, 5.90, 15.90},
		{"FAC-2026-000134", 50.00, 453.00, 503.00},
		{"FAC-2026-000165", 249.00, 250.00, 499.00},
	}

	var attendu float64
	for _, d := range dossiers {
		attendu += d.attenduDuDossier

		// La parente porte le TOTAL du dossier, et elle est marquée payée.
		parente := creerEnregistrement(t, app, "invoices", map[string]any{
			"owner_company": societeDeTest, "number": d.nom,
			"is_pos_ticket": false, "status": "issued", "invoice_type": "invoice",
			"is_paid": true,
			"date":    jour + " 09:00:00.000Z", "paid_at": jour + " 09:00:00.000Z",
			"total_ttc":      d.attenduDuDossier,
			"payment_method": "cb", "payment_method_label": "cb",
		})
		creerEnregistrement(t, app, "invoices", map[string]any{
			"owner_company": societeDeTest, "is_pos_ticket": false,
			"status": "issued", "invoice_type": "deposit", "is_paid": true,
			"original_invoice_id": parente.Id,
			"date":                jour + " 09:10:00.000Z", "paid_at": jour + " 09:10:00.000Z",
			"total_ttc": d.acompte, "payment_method": "cb", "payment_method_label": "cb",
		})
		creerEnregistrement(t, app, "invoices", map[string]any{
			"owner_company": societeDeTest, "is_pos_ticket": false,
			"status": "issued", "invoice_type": "invoice", "is_paid": true,
			"original_invoice_id": parente.Id,
			"date":                jour + " 09:20:00.000Z", "paid_at": jour + " 09:20:00.000Z",
			"total_ttc": d.solde, "payment_method": "cb", "payment_method_label": "cb",
		})
	}

	totaux := genererZ(t, app, caisse.Id, jour)

	if totaux.CollectedDepositsTTC != roundAmount(attendu) {
		t.Errorf("ligne 3 = %.2f, attendu %.2f (%.2f = les parentes comptées en plus)",
			totaux.CollectedDepositsTTC, attendu, attendu*2)
	}
	if totaux.TotalTTC != 0 {
		t.Errorf("ligne 1 = %.2f, attendu 0 : une parente porteuse d'acomptes n'est pas une vente du jour",
			totaux.TotalTTC)
	}
	if totaux.CollectedTTC != roundAmount(attendu) {
		t.Errorf("total encaissé = %.2f, attendu %.2f", totaux.CollectedTTC, attendu)
	}
}

// Second cas de la règle : PAS de facture de solde. La parente entre alors,
// mais amputée des acomptes déjà encaissés. Dossier réel FAC-2026-000092 :
// 277,80 − 257,80 = 20, plus l'acompte 257,80, le même jour → 277,80. Une fois.
func TestUneParenteSansSoldeEntreAmputeeDeSesAcomptes(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, _, jour := caisseEtSessionDuJour(t, app)

	parente := creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "number": "FAC-2026-000092",
		"is_pos_ticket": false, "status": "issued", "invoice_type": "invoice",
		"is_paid": true,
		"date":    jour + " 09:00:00.000Z", "paid_at": jour + " 09:00:00.000Z",
		"total_ttc": 277.80, "payment_method": "cb", "payment_method_label": "cb",
	})
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "deposit", "is_paid": true,
		"original_invoice_id": parente.Id,
		"date":                jour + " 09:10:00.000Z", "paid_at": jour + " 09:10:00.000Z",
		"total_ttc": 257.80, "payment_method": "cb", "payment_method_label": "cb",
	})

	totaux := genererZ(t, app, caisse.Id, jour)

	if totaux.CollectedDepositsTTC != 277.80 {
		t.Errorf("ligne 3 = %.2f, attendu 277,80 (535,60 = la parente comptée en entier)",
			totaux.CollectedDepositsTTC)
	}
}

// Un avoir hors caisse SANS moyen de remboursement est une annulation : aucun
// argent n'est sorti du tiroir. Le porter en déduction creuserait un trou
// fictif — 20 documents, 7 061,51 € en production.
func TestUnAvoirSansMoyenDeRemboursementNeDeduitRien(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, _, jour := caisseEtSessionDuJour(t, app)

	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "is_pos_ticket": false,
		"status": "issued", "invoice_type": "credit_note",
		"date": jour + " 15:00:00.000Z", "total_ttc": -300.00,
		"refund_method": "", "payment_method": "",
	})

	totaux := genererZ(t, app, caisse.Id, jour)

	if totaux.RefundsTTC != 0 {
		t.Errorf("ligne 4 = %.2f, attendu 0 : cet avoir est une annulation, pas un remboursement",
			totaux.RefundsTTC)
	}
	if totaux.CollectedTTC != 0 {
		t.Errorf("total encaissé = %.2f, attendu 0", totaux.CollectedTTC)
	}
}

// ─── Échafaudage ────────────────────────────────────────────────────────────

const societeDeTest = "co1"

// caisseEtSessionDuJour pose une caisse et une session fermée la veille, jamais
// consommée par un Z — le décor minimal de tout rapport. Le fonds de caisse est
// à 100 € pour que le rapprochement espèces ait une valeur à vérifier.
func caisseEtSessionDuJour(
	t *testing.T,
	app *pocketbase.PocketBase,
) (caisse *models.Record, session *models.Record, jour string) {
	t.Helper()

	caisse = creerEnregistrement(t, app, "cash_registers", map[string]any{
		"owner_company": societeDeTest,
		"code":          "C1",
		"name":          "Comptoir",
	})
	jour = time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	session = creerEnregistrement(t, app, "cash_sessions", map[string]any{
		"owner_company": societeDeTest,
		"cash_register": caisse.Id,
		"status":        "closed",
		"opened_at":     jour + " 08:00:00.000Z",
		"closed_at":     jour + " 19:00:00.000Z",
		"opening_float": 100.0,
		"z_report_id":   "",
	})
	return caisse, session, jour
}

func genererZ(
	t *testing.T,
	app *pocketbase.PocketBase,
	caisseID string,
	jour string,
) DailyTotalsSummary {
	t.Helper()

	rapport, err := GenerateRapportZ(app, caisseID, jour)
	if err != nil {
		t.Fatalf("génération du Z: %v", err)
	}
	return rapport.DailyTotals
}

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
		// Ticket Z-1 : le total encaissé et ses quatre lignes.
		"schema_version": num, "collected_ttc": num,
		"collected_from_receivables_ttc": num, "collected_deposits_ttc": num,
		"refunds_ttc": num, "collected_by_method": jsn,
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
