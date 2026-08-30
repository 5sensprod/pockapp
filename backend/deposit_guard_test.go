// backend/deposit_guard_test.go
// Gardiens de la faille §10 Q3 (01-audit-detail-facture.md) : CreateDepositInvoice
// ne lisait NI is_paid NI l'existence d'une facture de solde, et asseyait sa
// disponibilité sur le champ dénormalisé `deposits_total_ttc`.
//
// Le rempart était côté client (invoice.types.ts:431), contournable par un
// appel direct à POST /api/invoices/deposit. Le document produit est numéroté
// en série continue, verrouillé, haché dans la chaîne ISCA globale et peut
// déclencher un mouvement de caisse : il n'est pas rattrapable après coup.

package backend

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

// ─────────────────────────────────────────────────────────────────────────────
// 1. Une facture déjà réglée n'accepte plus d'acompte.
//
// Cas mesuré à l'audit : 1 200 € encaissés après 360 € d'acomptes.
// L'ancien calcul donnait balanceAvailable = 840 € et laissait passer.
// ─────────────────────────────────────────────────────────────────────────────
func TestPasDAcompteSurUneFactureDejaReglee(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	parente := creerFactureParente(t, app, 1200)
	parente.Set("is_paid", true)
	parente.Set("deposits_total_ttc", 360.0)
	parente.Set("balance_due", 840.0)
	enregistrer(t, app, parente)

	_, err := CreateDepositInvoice(app.Dao(), DepositInput{
		OwnerCompany: "co1",
		ParentID:     parente.Id,
		Percentage:   30,
	}, "user1")

	if err == nil {
		t.Fatal("un acompte a été créé sur une facture déjà réglée")
	}
	if !strings.Contains(err.Error(), "déjà réglée") {
		t.Fatalf("refus attendu pour cause de règlement, obtenu : %v", err)
	}
	verifierAucunAcompte(t, app, parente.Id)
}

// Variante sans aucun acompte préalable : deposits_total_ttc valant 0,
// l'ancien code autorisait un acompte de 100 % sur une facture soldée.
func TestPasDAcompteSurUneFactureRegleeSansAcomptePrealable(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	parente := creerFactureParente(t, app, 1200)
	parente.Set("is_paid", true)
	enregistrer(t, app, parente)

	if _, err := CreateDepositInvoice(app.Dao(), DepositInput{
		OwnerCompany: "co1", ParentID: parente.Id, Percentage: 100,
	}, "user1"); err == nil {
		t.Fatal("acompte de 100 % accepté sur une facture réglée sans acompte préalable")
	}
	verifierAucunAcompte(t, app, parente.Id)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Un dossier dont la facture de solde est émise est clos.
// ─────────────────────────────────────────────────────────────────────────────
func TestPasDAcompteQuandUneFactureDeSoldeExiste(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	parente := creerFactureParente(t, app, 1000)

	solde := nouvelleFacture(t, app, map[string]any{
		"number": "FAC-2026-000042", "invoice_type": "invoice",
		"status": "validated", "total_ttc": 700.0, "total_ht": 700.0,
		"original_invoice_id": parente.Id,
	})

	_, err := CreateDepositInvoice(app.Dao(), DepositInput{
		OwnerCompany: "co1", ParentID: parente.Id, Amount: 100,
	}, "user1")

	if err == nil {
		t.Fatal("un acompte a été créé alors qu'une facture de solde existe")
	}
	if !strings.Contains(err.Error(), solde.GetString("number")) {
		t.Fatalf("le refus devrait nommer la facture de solde, obtenu : %v", err)
	}
	verifierAucunAcompte(t, app, parente.Id)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Cas nominal — le correctif ne ferme pas la porte aux acomptes légitimes.
// ─────────────────────────────────────────────────────────────────────────────
func TestAcompteAccepteSurUneFactureValideeNonPayee(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	parente := creerFactureParente(t, app, 1000)

	res, err := CreateDepositInvoice(app.Dao(), DepositInput{
		OwnerCompany: "co1", ParentID: parente.Id, Percentage: 30,
	}, "user1")
	if err != nil {
		t.Fatalf("acompte légitime refusé : %v", err)
	}
	if got := res.Deposit.GetFloat("total_ttc"); got != 300 {
		t.Fatalf("acompte de %.2f€, attendu 300.00€", got)
	}
	if res.Deposit.GetString("invoice_type") != "deposit" {
		t.Fatalf("invoice_type = %q", res.Deposit.GetString("invoice_type"))
	}
	if res.Deposit.GetString("hash") == "" {
		t.Fatal("acompte créé sans hash — la chaîne ISCA est rompue")
	}
	if got := res.ParentUpdated.GetFloat("balance_due"); got != 700 {
		t.Fatalf("balance_due parente = %.2f€, attendu 700.00€", got)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Un acompte remboursé ne consomme pas de solde disponible.
//
// Le chemin d'avoir réellement appelé par le front (deposit_routes.go:372-377)
// soustrait brutalement de `deposits_total_ttc` et laisse l'acompte
// `is_paid = true` avec `has_credit_note = true`. La disponibilité s'assied
// donc sur computeNetDepositsTotal, qui déduit les avoirs liés.
// ─────────────────────────────────────────────────────────────────────────────
func TestUnAcompteRembourseNeConsommePasDeSolde(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	parente := creerFactureParente(t, app, 1000)

	// Un acompte de 400 €, encaissé puis intégralement remboursé par un avoir.
	acompte := nouvelleFacture(t, app, map[string]any{
		"number": "ACC-2026-000001", "invoice_type": "deposit",
		"status": "validated", "is_paid": true, "has_credit_note": true,
		"total_ttc": 400.0, "total_ht": 400.0,
		"original_invoice_id": parente.Id,
	})
	nouvelleFacture(t, app, map[string]any{
		"number": "AVO-2026-000001", "invoice_type": "credit_note",
		"status": "validated", "total_ttc": -400.0, "total_ht": -400.0,
		"original_invoice_id": acompte.Id,
	})

	// La parente porte encore la trace dénormalisée : c'est précisément ce
	// champ qu'on n'utilise plus pour juger de la disponibilité.
	parente.Set("deposits_total_ttc", 400.0)
	parente.Set("balance_due", 600.0)
	enregistrer(t, app, parente)

	// 1000 € doivent redevenir disponibles, pas 600 €.
	res, err := CreateDepositInvoice(app.Dao(), DepositInput{
		OwnerCompany: "co1", ParentID: parente.Id, Amount: 900,
	}, "user1")
	if err != nil {
		t.Fatalf("acompte de 900€ refusé alors que l'acompte de 400€ est remboursé : %v", err)
	}
	if got := res.Deposit.GetFloat("total_ttc"); got != 900 {
		t.Fatalf("acompte de %.2f€, attendu 900.00€", got)
	}
}

// TestUnAcompteEmisNonEncaisseConsommeDuSolde garde la règle inverse de la
// précédente : un acompte ÉMIS mais pas encore réglé retient le solde qu'il
// promet. C'est un document numéroté, scellé et haché ; laisser empiler des
// acomptes impayés dont la somme dépasse la facture produirait des documents
// irréversibles sans contrepartie possible.
//
// Ce gardien existe parce que la correction de la faille « acompte sur facture
// soldée » a d'abord assis la disponibilité sur les acomptes ENCAISSÉS seuls,
// ce qui ouvrait exactement cette porte.
func TestUnAcompteEmisNonEncaisseConsommeDuSolde(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	parente := creerFactureParente(t, app, 1000)

	// Un acompte de 700 €, émis, jamais encaissé, sans avoir.
	nouvelleFacture(t, app, map[string]any{
		"number": "ACC-2026-000001", "invoice_type": "deposit",
		"status": "validated", "is_paid": false, "has_credit_note": false,
		"total_ttc": 700.0, "total_ht": 700.0,
		"original_invoice_id": parente.Id,
	})

	// Il ne reste que 300 € : un second acompte de 500 € doit être refusé.
	if _, err := CreateDepositInvoice(app.Dao(), DepositInput{
		OwnerCompany: "co1", ParentID: parente.Id, Amount: 500,
	}, "user1"); err == nil {
		t.Fatal("un acompte de 500€ a été accepté alors que 700€ sont déjà engagés sur 1000€")
	}
	// Le refus ne doit avoir écrit aucun second document.
	acomptes, err := app.Dao().FindRecordsByFilter("invoices",
		"invoice_type = 'deposit' && original_invoice_id = '"+parente.Id+"'", "", 0, 0)
	if err != nil {
		t.Fatalf("relecture des acomptes: %v", err)
	}
	if len(acomptes) != 1 {
		t.Fatalf("%d acompte(s) en base, attendu 1 : un document a été écrit malgré le refus", len(acomptes))
	}

	// Et un acompte de 250 €, qui tient dans le solde restant, doit passer.
	if _, err := CreateDepositInvoice(app.Dao(), DepositInput{
		OwnerCompany: "co1", ParentID: parente.Id, Amount: 250,
	}, "user1"); err != nil {
		t.Fatalf("acompte de 250€ refusé alors que 300€ restent disponibles : %v", err)
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// creerFactureParente crée une facture B2B validée, non payée, au TTC donné.
func creerFactureParente(t *testing.T, app *pocketbase.PocketBase, ttc float64) *models.Record {
	t.Helper()
	return nouvelleFacture(t, app, map[string]any{
		"number": "FAC-2026-000001", "invoice_type": "invoice",
		"status": "validated", "is_paid": false, "is_pos_ticket": false,
		"total_ttc": ttc, "total_ht": ttc, "total_tva": 0.0,
		"sequence_number": 1, "fiscal_year": 2026,
		"items": []any{map[string]any{
			"name": "Prestation", "quantity": 1,
			"unit_price_ht": ttc, "tva_rate": 0, "total_ht": ttc, "total_ttc": ttc,
		}},
	})
}

func nouvelleFacture(t *testing.T, app *pocketbase.PocketBase, champs map[string]any) *models.Record {
	t.Helper()
	col, err := app.Dao().FindCollectionByNameOrId("invoices")
	if err != nil {
		t.Fatalf("collection invoices: %v", err)
	}
	rec := models.NewRecord(col)
	rec.Set("owner_company", "co1")
	for k, v := range champs {
		rec.Set(k, v)
	}
	rec.Set("_skip_hook_processing", true)
	if err := app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("création facture %v: %v", champs["number"], err)
	}
	return rec
}

func enregistrer(t *testing.T, app *pocketbase.PocketBase, rec *models.Record) {
	t.Helper()
	rec.Set("_skip_hook_processing", true)
	if err := app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("enregistrement: %v", err)
	}
}

// verifierAucunAcompte garantit que le refus a bien eu lieu AVANT toute
// écriture : un acompte est verrouillé, numéroté en série continue et haché.
func verifierAucunAcompte(t *testing.T, app *pocketbase.PocketBase, parentID string) {
	t.Helper()
	acomptes, err := app.Dao().FindRecordsByFilter("invoices",
		"invoice_type = 'deposit' && original_invoice_id = '"+parentID+"'", "", 0, 0)
	if err != nil {
		t.Fatalf("relecture des acomptes: %v", err)
	}
	if len(acomptes) != 0 {
		t.Fatalf("%d acompte(s) écrit(s) malgré le refus", len(acomptes))
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTURE DE SOLDE — les gardes que seul le client posait
//
// Constaté en production locale le 30 août 2026 : une facture PAYÉE portant
// encore balance_due > 0 a laissé générer une facture de solde de 20 €. Le
// document était numéroté, scellé et chaîné ; il a fallu facture-supprimer
// pour le retirer. canCreateBalanceInvoice testait bien is_paid — côté client
// seulement, et la route est joignable par tout utilisateur authentifié.
// ═══════════════════════════════════════════════════════════════════════════

func TestPasDeFactureDeSoldeSurUneFactureDejaReglee(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	parente := creerFactureParente(t, app, 1000)

	nouvelleFacture(t, app, map[string]any{
		"number": "ACC-2026-000001", "invoice_type": "deposit",
		"status": "validated", "is_paid": true,
		"total_ttc": 700.0, "total_ht": 700.0,
		"original_invoice_id": parente.Id,
	})

	// L'état exact rencontré : payée, et un solde résiduel dans le champ.
	parente.Set("is_paid", true)
	parente.Set("deposits_total_ttc", 700.0)
	parente.Set("balance_due", 300.0)
	enregistrer(t, app, parente)

	if _, err := CreateBalanceInvoice(app.Dao(), parente.Id, "user1"); err == nil {
		t.Fatal("une facture de solde a été générée sur une facture déjà réglée")
	}
	verifierAucuneFactureDeSolde(t, app, parente.Id)
}

func TestPasDeFactureDeSoldeSurUnTicketDeCaisse(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	ticket := creerFactureParente(t, app, 1000)
	ticket.Set("is_pos_ticket", true)
	enregistrer(t, app, ticket)

	nouvelleFacture(t, app, map[string]any{
		"number": "ACC-2026-000001", "invoice_type": "deposit",
		"status": "validated", "is_paid": true,
		"total_ttc": 400.0, "total_ht": 400.0,
		"original_invoice_id": ticket.Id,
	})

	if _, err := CreateBalanceInvoice(app.Dao(), ticket.Id, "user1"); err == nil {
		t.Fatal("une facture de solde a été générée depuis un ticket de caisse")
	}
}

func TestUneFactureDeSoldeNeSeResoldePas(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	parente := creerFactureParente(t, app, 1000)

	solde := nouvelleFacture(t, app, map[string]any{
		"number": "FAC-2026-000002", "invoice_type": "invoice",
		"status": "validated", "is_paid": false,
		"total_ttc": 300.0, "total_ht": 300.0,
		"original_invoice_id": parente.Id,
	})

	if _, err := CreateBalanceInvoice(app.Dao(), solde.Id, "user1"); err == nil {
		t.Fatal("une facture de solde a été générée depuis une facture de solde")
	}
}

// Un acompte remboursé ne doit ni produire de ligne déductive, ni entrer dans
// le solde. Sans quoi le document ne s'additionne plus : sa ligne retire un
// argent qui est ressorti, pendant que deposits_total_ttc, lui, a déjà été
// décrémenté par la route d'avoir.
func TestUnAcompteRembourseNEntrePasDansLaFactureDeSolde(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	parente := creerFactureParente(t, app, 1000)

	nouvelleFacture(t, app, map[string]any{
		"number": "ACC-2026-000001", "invoice_type": "deposit",
		"status": "validated", "is_paid": true, "has_credit_note": false,
		"total_ttc": 300.0, "total_ht": 300.0,
		"original_invoice_id": parente.Id,
	})
	nouvelleFacture(t, app, map[string]any{
		"number": "ACC-2026-000002", "invoice_type": "deposit",
		"status": "validated", "is_paid": true, "has_credit_note": true,
		"total_ttc": 200.0, "total_ht": 200.0,
		"original_invoice_id": parente.Id,
	})

	// Le champ dénormalisé porte volontairement une valeur incohérente :
	// c'est celle qu'un avoir sur acompte y laisse.
	parente.Set("deposits_total_ttc", 300.0)
	enregistrer(t, app, parente)

	res, err := CreateBalanceInvoice(app.Dao(), parente.Id, "user1")
	if err != nil {
		t.Fatalf("facture de solde refusée à tort : %v", err)
	}

	// 1000 − 300 (le seul acompte non remboursé) = 700.
	if got := res.BalanceInvoice.GetFloat("total_ttc"); got != 700 {
		t.Fatalf("solde de %.2f€, attendu 700.00€", got)
	}

	// Et une seule ligne déductive, pour l'acompte non remboursé.
	// Le champ `items` revient sérialisé : on le relit en texte plutôt que de
	// parier sur son type Go.
	brut, err := json.Marshal(res.BalanceInvoice.Get("items"))
	if err != nil {
		t.Fatalf("lecture des items: %v", err)
	}
	texte := string(brut)
	if !strings.Contains(texte, "ACC-2026-000001") {
		t.Fatalf("aucune ligne déductive pour l'acompte encaissé — items: %s", texte)
	}
	if strings.Contains(texte, "ACC-2026-000002") {
		t.Fatalf("l'acompte REMBOURSÉ a produit une ligne déductive — items: %s", texte)
	}
}

func verifierAucuneFactureDeSolde(t *testing.T, app *pocketbase.PocketBase, parentID string) {
	t.Helper()
	soldes, err := app.Dao().FindRecordsByFilter("invoices",
		"invoice_type = 'invoice' && original_invoice_id = '"+parentID+"'", "", 0, 0)
	if err != nil {
		t.Fatalf("relecture des factures de solde: %v", err)
	}
	if len(soldes) != 0 {
		t.Fatalf("%d facture(s) de solde écrite(s) malgré le refus", len(soldes))
	}
}
