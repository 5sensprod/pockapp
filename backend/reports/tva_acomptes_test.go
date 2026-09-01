// backend/reports/tva_acomptes_test.go
//
// Gardiens du contrat schema_version 7 — la TVA des acomptes.
//
// Elle devient exigible à l'ENCAISSEMENT de l'acompte (CGI art. 269-2-a bis,
// livraisons de biens, depuis le 1er janvier 2023). Le Z la déclare donc au
// jour de l'acompte, dans un bloc à part, et JAMAIS dans total_tva.

package reports

import (
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

// acompteEncaisse écrit un acompte payé, rattaché à une parente.
func acompteEncaisse(
	t *testing.T,
	app *pocketbase.PocketBase,
	session *models.Record,
	jour, numero, parentID string,
	ht, tva, ttc float64,
) *models.Record {
	t.Helper()
	return creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": false, "is_paid": true, "status": "validated",
		"invoice_type": "deposit", "number": numero,
		"original_invoice_id": parentID,
		"date":                jour + " 10:00:00.000Z",
		"paid_at":             jour + " 10:00:00.000Z",
		"total_ht":            ht, "total_tva": tva, "total_ttc": ttc,
		"payment_method": "especes", "payment_method_label": "especes",
	})
}

// LA TVA D'UN ACOMPTE EST DÉCLARÉE, ET ELLE RESTE HORS DE total_tva.
//
// Les chiffres sont ceux du dossier réel du 31 août 2026 : ticket de 2,90 € et
// acompte ACC-2026-000021 de 20,00 € (16,66 HT / 3,34 TVA) sur la parente
// FAC-2026-000287.
func TestLaTVADUnAcompteEstDeclareeMaisPasDansTotalTVA(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)

	// Le ticket du jour — la ligne 1, et la seule à porter une base HT.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": true, "is_paid": true, "status": "validated",
		"invoice_type": "invoice", "number": "TIK-2026-000855",
		"date": jour + " 10:00:00.000Z", "paid_at": jour + " 10:00:00.000Z",
		"total_ht": 2.42, "total_tva": 0.48, "total_ttc": 2.90,
		"payment_method": "especes", "payment_method_label": "especes",
	})

	parente := creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest,
		"is_pos_ticket": false, "is_paid": false, "status": "validated",
		"invoice_type": "invoice", "number": "FAC-2026-000287",
		"date":     jour + " 09:00:00.000Z",
		"total_ht": 21.58, "total_tva": 4.32, "total_ttc": 25.90,
	})
	acompteEncaisse(t, app, session, jour, "ACC-2026-000021", parente.Id,
		16.66, 3.34, 20.00)

	totaux := genererZ(t, app, caisse.Id, jour)

	// Le triplet de la ligne 1 reste cohérent : c'est l'invariant que verser la
	// TVA de l'acompte dans total_tva aurait rompu (2,42 + 3,82 ≠ 2,90).
	if roundAmount(totaux.TotalHT+totaux.TotalTVA) != totaux.TotalTTC {
		t.Fatalf("HT %.2f + TVA %.2f ≠ TTC %.2f : la ligne 1 n'est plus cohérente",
			totaux.TotalHT, totaux.TotalTVA, totaux.TotalTTC)
	}
	if totaux.TotalTVA != 0.48 {
		t.Fatalf("total_tva = %.2f au lieu de 0,48 : la TVA de l'acompte s'y est glissée",
			totaux.TotalTVA)
	}

	// L'acompte est bien encaissé, en TTC, sur la ligne 3.
	if totaux.CollectedDepositsTTC != 20.00 {
		t.Fatalf("ligne 3 = %.2f au lieu de 20,00", totaux.CollectedDepositsTTC)
	}

	// Et sa TVA est déclarée, dans son bloc.
	if totaux.DepositsVAT != 3.34 {
		t.Fatalf("deposits_vat = %.2f au lieu de 3,34 : la TVA exigible à "+
			"l'encaissement de l'acompte n'est déclarée nulle part", totaux.DepositsVAT)
	}
	detail, vu := totaux.DepositsVATByRate["20.1"]
	if !vu {
		// 3,34 / 16,66 = 20,05 % — le prorata d'un acompte ne retombe pas
		// exactement sur le taux nominal. On vérifie la ventilation, pas une
		// arithmétique de taux que le document ne porte pas.
		for _, d := range totaux.DepositsVATByRate {
			detail = d
			vu = true
		}
	}
	if !vu || detail.VATAmount != 3.34 || detail.BaseHT != 16.66 {
		t.Fatalf("ventilation par taux absente ou fausse : %+v", totaux.DepositsVATByRate)
	}

	// Le contrat de la TVA des acomptes est né en 7 ; il tient toujours sous 8,
	// qui n'a déplacé que la facture de solde. SEUIL, jamais égalité.
	if totaux.SchemaVersion < 7 {
		t.Fatalf("schema_version = %d, en deçà de 7", totaux.SchemaVersion)
	}
}

// UN ACOMPTE REMBOURSÉ RETIRE SA TVA.
//
// Sans cela, une TVA encaissée puis rendue resterait déclarée.
func TestUnAcompteRembourseRetireSaTVA(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)

	parente := creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest,
		"is_pos_ticket": false, "is_paid": false, "status": "validated",
		"invoice_type": "invoice", "number": "FAC-900",
		"date":     jour + " 09:00:00.000Z",
		"total_ht": 100.00, "total_tva": 20.00, "total_ttc": 120.00,
	})
	acompte := acompteEncaisse(t, app, session, jour, "ACC-900", parente.Id,
		25.00, 5.00, 30.00)

	// L'avoir qui le rembourse, le même jour.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": false, "status": "validated",
		"invoice_type": "credit_note", "number": "AVO-900",
		"original_invoice_id": acompte.Id,
		"date":                jour + " 16:00:00.000Z",
		"paid_at":             jour + " 16:00:00.000Z",
		"total_ht":            -25.00, "total_tva": -5.00, "total_ttc": -30.00,
		"refund_method": "especes", "payment_method": "especes",
	})

	totaux := genererZ(t, app, caisse.Id, jour)

	if totaux.DepositsVAT != 0 {
		t.Fatalf("deposits_vat = %.2f : la TVA d'un acompte remboursé le même "+
			"jour reste déclarée", totaux.DepositsVAT)
	}
}

// LA FACTURE DE SOLDE N'AJOUTE AUCUNE TVA D'ACOMPTE.
//
// Elle porte déjà une TVA NETTE des acomptes (deposit.go:455-459). La compter
// ici déclarerait deux fois la même TVA — la question posée le 1er septembre
// 2026, et la raison du périmètre « acomptes seuls ».
func TestLaFactureDeSoldeNAjoutePasDeTVADAcompte(t *testing.T) {
	app := nouvelleAppDeTest(t)
	caisse, session, jour := caisseEtSessionDuJour(t, app)

	parente := creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest,
		"is_pos_ticket": false, "is_paid": false, "status": "validated",
		"invoice_type": "invoice", "number": "FAC-901",
		"date":     jour + " 09:00:00.000Z",
		"total_ht": 100.00, "total_tva": 20.00, "total_ttc": 120.00,
	})
	acompteEncaisse(t, app, session, jour, "ACC-901", parente.Id, 25.00, 5.00, 30.00)

	// La facture de solde : 90 € TTC, soit 75 HT et 15 de TVA — le RESTE, déjà
	// net de l'acompte. Depuis le contrat 8 elle entre en LIGNE 1, avec son HT
	// et sa TVA ; ce qu'elle n'alimente pas, c'est `deposits_vat`.
	creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"is_pos_ticket": false, "is_paid": true, "status": "validated",
		"invoice_type": "invoice", "number": "FAC-902",
		"original_invoice_id": parente.Id,
		"date":                jour + " 17:00:00.000Z",
		"paid_at":             jour + " 17:00:00.000Z",
		"total_ht":            75.00, "total_tva": 15.00, "total_ttc": 90.00,
		"payment_method": "cb", "payment_method_label": "Carte bancaire",
	})

	totaux := genererZ(t, app, caisse.Id, jour)

	if totaux.DepositsVAT != 5.00 {
		t.Fatalf("deposits_vat = %.2f au lieu de 5,00 : la facture de solde a "+
			"ajouté sa propre TVA, déjà nette des acomptes — elle serait "+
			"déclarée deux fois", totaux.DepositsVAT)
	}
	// Contrat 8 : la ligne 3 ne porte plus que l'acompte. Le solde est parti en
	// ligne 1, et sa TVA avec lui — d'où 5,00 en `deposits_vat` et 15,00 en
	// `total_tva` : les 20,00 € du dossier, déclarés une fois chacun.
	if totaux.CollectedDepositsTTC != 30.00 {
		t.Fatalf("ligne 3 = %.2f au lieu de 30,00 : le solde y est resté alors "+
			"qu'il facture une livraison (contrat 8)", totaux.CollectedDepositsTTC)
	}
	if totaux.TotalTVA != 15.00 {
		t.Fatalf("total_tva = %.2f au lieu de 15,00 : la TVA du solde n'est pas "+
			"déclarée", totaux.TotalTVA)
	}
	if roundAmount(totaux.DepositsVAT+totaux.TotalTVA) != 20.00 {
		t.Fatalf("TVA déclarée %.2f + %.2f ≠ 20,00 : le dossier n'est pas couvert "+
			"exactement une fois", totaux.DepositsVAT, totaux.TotalTVA)
	}
}
