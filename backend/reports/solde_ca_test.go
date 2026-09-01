// backend/reports/solde_ca_test.go
//
// Gardiens du contrat schema_version 8 — le chiffre d'affaires d'un dossier
// acompte / solde.
//
// Sous les versions 1 à 7, ce CA n'était reconnu NULLE PART : la parente est
// hors lignes (règle anti-doublon), et l'acompte comme le solde partaient en
// ligne 3, en TTC seul. Un Z pouvait donc annoncer 0,00 € de ventes sur une
// journée où une livraison avait été facturée et encaissée — constaté sur le
// dossier FAC-2026-000286 le 1er septembre 2026.
//
// La facture de solde est désormais en ligne 1, avec son HT et sa TVA.

package reports

import (
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

// dossierAcompteSolde écrit les trois documents d'un dossier : la parente (non
// encaissée — elle ne s'encaisse pas quand un solde existe), l'acompte et le
// solde. Les jours d'encaissement sont donnés séparément pour pouvoir écrire un
// dossier à cheval sur deux journées.
func dossierAcompteSolde(
	t *testing.T,
	app *pocketbase.PocketBase,
	session *models.Record,
	jourAcompte, jourSolde string,
) (parente, acompte, solde *models.Record) {
	t.Helper()

	// Le dossier réel FAC-2026-000286, au centime : 29,90 € TTC.
	parente = creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest,
		"is_pos_ticket": false, "is_paid": false, "status": "validated",
		"invoice_type": "invoice", "number": "FAC-2026-000286",
		"date":     jourAcompte + " 09:00:00.000Z",
		"total_ht": 24.92, "total_tva": 4.98, "total_ttc": 29.90,
	})
	acompte = acompteEncaisse(t, app, session, jourAcompte,
		"ACC-2026-000021", parente.Id, 8.33, 1.67, 10.00)
	solde = creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": false, "is_paid": true, "status": "validated",
		"invoice_type": "invoice", "number": "FAC-2026-000287",
		"original_invoice_id": parente.Id,
		"date":                jourSolde + " 11:00:00.000Z",
		"paid_at":             jourSolde + " 11:00:00.000Z",
		"total_ht":            16.59, "total_tva": 3.31, "total_ttc": 19.90,
		"payment_method": "cb", "payment_method_label": "Carte bancaire",
	})
	return parente, acompte, solde
}

// LE CA D'UN DOSSIER SOLDÉ EST RECONNU.
//
// Le cas réel du 1er septembre 2026, qui a ouvert le chantier : acompte de
// 10,00 € puis solde de 19,90 €, encaissés le même jour. Le Z annonçait
// « Ventes 0,00 € · Acomptes 29,90 € ».
func TestLeCADUnDossierSoldeEstReconnu(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)
	dossierAcompteSolde(t, app, session, jour, jour)

	totaux := genererZ(t, app, caisse.Id, jour)

	// Ligne 1 — le solde, et lui seul : il facture le RESTE à payer, pas le
	// total de la commande. La part déjà versée en acompte n'y entre pas, sans
	// quoi la ligne 1 cesserait d'être « ce qui est encaissé aujourd'hui ».
	if totaux.TotalTTC != 19.90 {
		t.Fatalf("ligne 1 = %.2f € TTC au lieu de 19,90 : le CA du dossier soldé "+
			"n'est reconnu nulle part", totaux.TotalTTC)
	}
	if totaux.TotalHT != 16.59 {
		t.Fatalf("total_ht = %.2f au lieu de 16,59", totaux.TotalHT)
	}
	if totaux.TotalTVA != 3.31 {
		t.Fatalf("total_tva = %.2f au lieu de 3,31 : la TVA du solde n'est "+
			"déclarée ni ici ni dans deposits_vat", totaux.TotalTVA)
	}

	// L'invariant que le contrat protège depuis le 23 août 2026.
	if roundAmount(totaux.TotalHT+totaux.TotalTVA) != totaux.TotalTTC {
		t.Fatalf("HT %.2f + TVA %.2f ≠ TTC %.2f", totaux.TotalHT, totaux.TotalTVA,
			totaux.TotalTTC)
	}

	// L'acompte n'a pas bougé : ligne 3, TTC seul, TVA dans son bloc.
	if totaux.CollectedDepositsTTC != 10.00 {
		t.Fatalf("ligne 3 = %.2f au lieu de 10,00 (l'acompte seul)",
			totaux.CollectedDepositsTTC)
	}
	if totaux.DepositsVAT != 1.67 {
		t.Fatalf("deposits_vat = %.2f au lieu de 1,67", totaux.DepositsVAT)
	}

	if totaux.SchemaVersion != 8 {
		t.Fatalf("schema_version = %d au lieu de 8", totaux.SchemaVersion)
	}
}

// … ET IL N'EST RECONNU QU'UNE FOIS.
//
// Les trois documents du dossier peuvent porter is_paid = true, et deposit.go
// en produit trois pour UN seul encaissement possible. Les sommer compterait
// l'argent deux fois — mesuré à l'époque, 7 parentes et 2 523,70 €.
func TestLeCADUnDossierSoldeNEstReconnuQuUneFois(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)
	parente, _, _ := dossierAcompteSolde(t, app, session, jour, jour)

	// La parente est encaissée elle aussi : le piège exact. Elle doit rester
	// hors des quatre lignes tant qu'un solde existe.
	parente.Set("is_paid", true)
	parente.Set("paid_at", jour+" 11:00:00.000Z")
	parente.Set("payment_method", "cb")
	parente.Set("payment_method_label", "Carte bancaire")
	if err := app.Dao().SaveRecord(parente); err != nil {
		t.Fatalf("écriture de la parente: %v", err)
	}

	totaux := genererZ(t, app, caisse.Id, jour)

	// 10,00 d'acompte + 19,90 de solde. La parente n'ajoute pas ses 29,90.
	if totaux.CollectedTTC != 29.90 {
		t.Fatalf("collected_ttc = %.2f au lieu de 29,90 : la parente a été "+
			"comptée en plus de son acompte et de son solde", totaux.CollectedTTC)
	}
	if totaux.TotalTTC != 19.90 {
		t.Fatalf("ligne 1 = %.2f au lieu de 19,90 : la parente y est entrée en "+
			"plus du solde", totaux.TotalTTC)
	}
	// La TVA du dossier, déclarée une fois et une seule : 1,67 à l'acompte,
	// 3,31 au solde — soit les 4,98 de la parente, au centime. C'est ce qui
	// rend le modèle sûr : le prorata de deposit.go:455-459 ne perd rien et ne
	// double rien.
	if roundAmount(totaux.DepositsVAT+totaux.TotalTVA) != 4.98 {
		t.Fatalf("TVA déclarée %.2f + %.2f ≠ 4,98 : le dossier n'est pas couvert "+
			"exactement une fois", totaux.DepositsVAT, totaux.TotalTVA)
	}
}

// UN SOLDE ÉMIS AVANT SON ENCAISSEMENT RESTE UN RÈGLEMENT DE CRÉANCE.
//
// Le solde emprunte le MÊME test de date que les factures ordinaires : il n'a
// pas de traitement à part. Émis la veille, encaissé aujourd'hui, il est en
// ligne 2 — TTC seul, comme toute créance : sa TVA relève de la période de son
// émission, la verser dans total_tva la rattacherait au mauvais mois.
func TestUnSoldeEmisLaVeilleEstUnReglementDeCreance(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)

	veille := jourAvant(t, jour)
	parente := creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest,
		"is_pos_ticket": false, "is_paid": false, "status": "validated",
		"invoice_type": "invoice", "number": "FAC-801",
		"date":     veille + " 09:00:00.000Z",
		"total_ht": 100.00, "total_tva": 20.00, "total_ttc": 120.00,
	})
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest,
		"is_pos_ticket": false, "is_paid": false, "status": "validated",
		"invoice_type": "deposit", "number": "ACC-801",
		"original_invoice_id": parente.Id,
		"date":                veille + " 09:30:00.000Z",
		"total_ht":            25.00, "total_tva": 5.00, "total_ttc": 30.00,
	})
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": false, "is_paid": true, "status": "validated",
		"invoice_type": "invoice", "number": "FAC-802",
		"original_invoice_id": parente.Id,
		"date":                veille + " 17:00:00.000Z",
		"paid_at":             jour + " 11:00:00.000Z",
		"total_ht":            75.00, "total_tva": 15.00, "total_ttc": 90.00,
		"payment_method": "cb", "payment_method_label": "Carte bancaire",
	})

	totaux := genererZ(t, app, caisse.Id, jour)

	if totaux.CollectedFromReceivablesTTC != 90.00 {
		t.Fatalf("ligne 2 = %.2f au lieu de 90,00 : un solde émis la veille n'est "+
			"pas une vente du jour", totaux.CollectedFromReceivablesTTC)
	}
	if totaux.TotalTVA != 0 {
		t.Fatalf("total_tva = %.2f au lieu de 0 : la TVA d'une créance a été "+
			"rattachée au mauvais mois", totaux.TotalTVA)
	}
	if totaux.CollectedTTC != 90.00 {
		t.Fatalf("collected_ttc = %.2f au lieu de 90,00", totaux.CollectedTTC)
	}
}

// jourAvant rend la journée précédant celle passée, au format "2006-01-02".
func jourAvant(t *testing.T, jour string) string {
	t.Helper()
	d, err := time.Parse("2006-01-02", jour)
	if err != nil {
		t.Fatalf("journée illisible %q: %v", jour, err)
	}
	return d.AddDate(0, 0, -1).Format("2006-01-02")
}
