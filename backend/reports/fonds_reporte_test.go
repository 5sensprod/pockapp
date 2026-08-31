// backend/reports/fonds_reporte_test.go
// Gardiens de l'étape E-2 — le fonds reporté.

package reports

import (
	"testing"
	"time"
)

// Le fonds d'un jour est le tiroir COMPTÉ de la veille — arbitrage du
// propriétaire, 29 août 2026. C'est déjà ce qui se fait à la main : 285,40
// compté le soir, 285,40 reporté le lendemain. Ce que le report supprime, c'est
// la faute de frappe (198,20 saisi pour 198,70 compté, mesuré le 21/08/2026).
func TestLeFondsDuJourEstLeTiroirCompteDeLaVeille(t *testing.T) {
	app := nouvelleAppDeTest(t)

	caisse := creerEnregistrement(t, app, "cash_registers", map[string]any{
		"owner_company": societeDeTest, "code": "C1", "name": "Comptoir",
	})
	veille := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	aujourdhui := time.Now().Format("2006-01-02")

	creerEnregistrement(t, app, "cash_sessions", map[string]any{
		"owner_company": societeDeTest, "cash_register": caisse.Id,
		"status":    "closed",
		"opened_at": veille + " 08:00:00.000Z", "closed_at": veille + " 19:00:00.000Z",
		"opening_float": 100.0, "counted_cash_total": 285.40,
	})

	fonds, err := FondsReporte(app.Dao(), societeDeTest, aujourdhui)
	if err != nil {
		t.Fatalf("fonds reporté: %v", err)
	}
	if fonds != 285.40 {
		t.Fatalf("fonds = %.2f, attendu 285,40 — le tiroir compté de la veille", fonds)
	}
}

// Un fonds reporté n'est JAMAIS un apport : le solde d'ouverture d'un jour doit
// égaler le solde de clôture du précédent, sans que l'argent déjà présent
// n'entre une seconde fois dans les flux.
//
// C'est le piège nommé en tête de journal_especes.go : le fonds est un SOLDE,
// les mouvements sont des FLUX. Les confondre ferait entrer chaque jour, comme
// un apport, l'argent qui était déjà dans le tiroir la veille.
func TestLeFondsReporteNEstJamaisCompteCommeUnApport(t *testing.T) {
	app := nouvelleAppDeTest(t)

	caisse := creerEnregistrement(t, app, "cash_registers", map[string]any{
		"owner_company": societeDeTest, "code": "C1", "name": "Comptoir",
	})
	// ⚠️ LES JOURNÉES SE COMPTENT EN UTC ICI, ET C'EST OBLIGATOIRE.
	//
	// Les cash_movements de ce test portent le `created` de PocketBase, écrit
	// en UTC, et le journal des espèces les range par les dix premiers
	// caractères de ce champ (journal_especes.go:231). Entre minuit et 2 h
	// heure de Paris, l'UTC est encore la veille : des journées calculées en
	// local rangeaient les mouvements hors de la fenêtre demandée, et le test
	// échouait — mesuré le 1er septembre 2026 à 00 h 03, sur un code inchangé.
	// La règle testée, elle, n'a rien à voir avec les fuseaux.
	maintenant := time.Now().UTC()
	veille := maintenant.AddDate(0, 0, -1).Format("2006-01-02")
	aujourdhui := maintenant.Format("2006-01-02")
	demain := maintenant.AddDate(0, 0, 1).Format("2006-01-02")

	// La veille : tiroir compté à 200,00 €. C'est le dernier point sûr.
	creerEnregistrement(t, app, "cash_sessions", map[string]any{
		"owner_company": societeDeTest, "cash_register": caisse.Id,
		"status":    "closed",
		"opened_at": veille + " 08:00:00.000Z", "closed_at": veille + " 19:00:00.000Z",
		"opening_float": 150.0, "counted_cash_total": 200.00,
	})

	// Aujourd'hui : session NON comptée, 50 € de ventes espèces et 30 € de
	// remise en banque. Solde théorique de clôture : 200 + 50 − 30 = 220.
	//
	// Les mouvements portent le `created` de l'instant : on demande donc le
	// fonds de DEMAIN, seul moyen d'observer une journée de flux complète.
	sessionVeille := creerEnregistrement(t, app, "cash_sessions", map[string]any{
		"owner_company": societeDeTest, "cash_register": caisse.Id,
		"status":    "closed",
		"opened_at": aujourdhui + " 08:00:00.000Z", "closed_at": aujourdhui + " 19:00:00.000Z",
		"opening_float": 200.0, "counted_cash_total": 0.0,
	})
	facture := creerEnregistrement(t, app, "invoices", map[string]any{
		"owner_company": societeDeTest, "session": sessionVeille.Id,
		"is_pos_ticket": true, "status": "issued", "invoice_type": "invoice",
		"number": "TCK-100", "date": aujourdhui + " 10:00:00.000Z",
		"total_ht": 41.67, "total_tva": 8.33, "total_ttc": 50.00,
		"payment_method": "especes", "payment_method_label": "especes",
	})
	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest, "session": sessionVeille.Id,
		"movement_type": "cash_in", "amount": 50.00,
		"related_invoice": facture.Id, "reason": "vente",
	})
	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest, "session": sessionVeille.Id,
		"movement_type": "safe_drop", "amount": 30.00, "reason": "pour la banque",
	})

	fonds, err := FondsReporte(app.Dao(), societeDeTest, demain)
	if err != nil {
		t.Fatalf("fonds reporté: %v", err)
	}

	// 220 et non 420 : le fonds de la veille (200) ne se rajoute pas au dernier
	// comptage, il EST ce dernier comptage. Une addition naïve du
	// `SoldeOuverture` de chaque journée du journal donnerait 420.
	if fonds != 220.00 {
		t.Fatalf("fonds = %.2f, attendu 220,00 (200 compté + 50 de ventes − 30 de remise). "+
			"420 signifierait que le fonds de la veille a été compté comme un apport", fonds)
	}
}

// Un tiroir négatif n'existe pas (04-refonte-du-z.md §7) : deux sessions dont
// le fonds saisi était déjà net d'une remise ont produit des espèces attendues
// à −154,04 € et −170,24 €. Aucun fonds né de ce chemin ne doit pouvoir être
// négatif — on rend zéro et le journal des espèces montre l'anomalie, plutôt
// que de la propager dans une session neuve.
func TestAucunTiroirNegatifNeNaitDuReport(t *testing.T) {
	app := nouvelleAppDeTest(t)

	caisse := creerEnregistrement(t, app, "cash_registers", map[string]any{
		"owner_company": societeDeTest, "code": "C1", "name": "Comptoir",
	})
	aujourdhui := time.Now().Format("2006-01-02")
	demain := time.Now().AddDate(0, 0, 1).Format("2006-01-02")

	// La saisie fautive du 04-refonte-du-z.md §7 : un fonds déjà net de la
	// remise, et la remise qui retranche une seconde fois.
	session := creerEnregistrement(t, app, "cash_sessions", map[string]any{
		"owner_company": societeDeTest, "cash_register": caisse.Id,
		"status":    "closed",
		"opened_at": aujourdhui + " 07:44:00.000Z", "closed_at": aujourdhui + " 19:00:00.000Z",
		"opening_float": 145.96, "counted_cash_total": 0.0,
	})
	creerEnregistrement(t, app, "cash_movements", map[string]any{
		"owner_company": societeDeTest, "session": session.Id,
		"movement_type": "cash_out", "amount": 300.00, "reason": "remise en banque",
	})

	fonds, err := FondsReporte(app.Dao(), societeDeTest, demain)
	if err != nil {
		t.Fatalf("fonds reporté: %v", err)
	}
	if fonds < 0 {
		t.Fatalf("fonds = %.2f : un tiroir négatif n'existe pas", fonds)
	}
}

// Sans aucun comptage ni aucun mouvement, le fonds est zéro — et non une erreur.
// La toute première journée d'exploitation est dans ce cas, et elle doit pouvoir
// encaisser.
func TestSansHistoriqueLeFondsEstNul(t *testing.T) {
	app := nouvelleAppDeTest(t)

	fonds, err := FondsReporte(app.Dao(), societeDeTest, time.Now().Format("2006-01-02"))
	if err != nil {
		t.Fatalf("fonds reporté: %v", err)
	}
	if fonds != 0 {
		t.Fatalf("fonds = %.2f, attendu 0 sans aucun historique", fonds)
	}
}
