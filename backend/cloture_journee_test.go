// backend/cloture_journee_test.go
//
// Gardiens de la clôture de journée — défaut du 31 août 2026.
//
// Ce jour-là, la journée s'est terminée SANS son rapport Z : la session
// 6746j18fjydlegi est restée `open` avec un `counted_cash_total` de 350 €, et
// son unique ticket (TIK-2026-000855, 2,90 €) est resté hors de toute clôture.
// La cause était côté React (CloseSessionDialog lisait un état périmé et
// appelait le comptage au lieu de la clôture), mais le correctif a déplacé
// l'émission du Z dans la route de clôture, et posé la règle « une journée
// clôturée ne se rouvre pas ». Ces deux règles vivent ici.

package backend

import (
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend/reports"
)

// creerZDeTest scelle un rapport Z minimal pour une caisse et une journée.
// Il ne sert qu'à donner à JourneeEstCloturee quelque chose à trouver : rien
// n'est agrégé ici, aggregateZ reste le seul chemin de calcul.
func creerZDeTest(t *testing.T, app *pocketbase.PocketBase, caisseID, jour, numero string) *models.Record {
	t.Helper()

	col, err := app.Dao().FindCollectionByNameOrId("z_reports")
	if err != nil {
		t.Fatalf("collection z_reports: %v", err)
	}
	rec := models.NewRecord(col)
	rec.Set("owner_company", "co1")
	rec.Set("cash_register", caisseID)
	rec.Set("date", jour+" 00:00:00.000Z")
	rec.Set("number", numero)
	if err := app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("création du Z de test: %v", err)
	}
	return rec
}

// La journée qui porte un Z se reconnaît, et celle d'à côté n'en hérite pas.
//
// C'est ce prédicat que « Commencer la journée » interroge pour refuser de
// rouvrir (backend/routes/cash_routes.go). S'il rendait vrai pour le lendemain,
// la caisse ne pourrait plus jamais ouvrir ; s'il rendait faux pour le jour du
// Z, la journée se rouvrirait et ses tickets sortiraient de la clôture.
func TestUneJourneeAvecZEstCloutureeEtLeLendemainNeLEstPas(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	caisse := creerCaisse(t, app, "co1")

	creerZDeTest(t, app, caisse.Id, "2026-08-31", "Z-2026-000066")

	numero, cloturee := JourneeEstCloturee(app.Dao(), caisse.Id, "2026-08-31")
	if !cloturee {
		t.Fatalf("le 31 août porte Z-2026-000066 et n'est pas vu comme clôturé")
	}
	if numero != "Z-2026-000066" {
		t.Fatalf("numéro rendu %q, attendu Z-2026-000066", numero)
	}

	// Exigence 4 : une nouvelle journée s'ouvre à partir du LENDEMAIN du Z.
	if _, cloturee := JourneeEstCloturee(app.Dao(), caisse.Id, "2026-09-01"); cloturee {
		t.Fatalf("le 1er septembre est déclaré clôturé alors qu'il n'a aucun Z : " +
			"la caisse ne pourrait plus jamais ouvrir")
	}

	// Et le Z d'une caisse ne clôture pas la journée d'une autre.
	autre := creerCaisse(t, app, "co2")
	if _, cloturee := JourneeEstCloturee(app.Dao(), autre.Id, "2026-08-31"); cloturee {
		t.Fatalf("le Z d'une caisse est compté pour une autre")
	}
}

// LE FILET N'EST PAS REPRIS PAR LA RÈGLE DE NON-RÉOUVERTURE.
//
// Arbitrage du 31 août 2026 : « une journée clôturée ne se rouvre pas » vise le
// GESTE DÉLIBÉRÉ — POST /api/cash/session/open. sessionDuJourA, lui, sert
// CreateCashMovementIfEspeces : un encaissement espèces qui ne trouve pas de
// session est PERDU, sans erreur et sans trace (voir l'en-tête de
// session_du_jour.go). Mieux vaut une journée que le journal des ventes
// signale « à clôturer » qu'un euro sans trace.
func TestLeFiletOuvreQuandMemeUneSessionSurUneJourneeCloturee(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	caisse := creerCaisse(t, app, "co1")

	creerZDeTest(t, app, caisse.Id, "2026-08-31", "Z-2026-000066")

	tard := time.Date(2026, 8, 31, 21, 0, 0, 0, time.Local)
	session, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user1", tard)
	if err != nil {
		t.Fatalf("le filet a refusé d'ouvrir une session sur une journée clôturée : %v — "+
			"un encaissement espèces serait perdu en silence", err)
	}
	if session == nil || session.Id == "" {
		t.Fatalf("le filet n'a rendu aucune session")
	}
	if session.GetString("status") != "open" {
		t.Fatalf("session rendue avec le statut %q", session.GetString("status"))
	}
}

// creerTicket écrit un ticket de caisse rattaché à une session. 2,90 €, comme
// celui qui a servi à reproduire le défaut du 31 août 2026.
func creerTicket(t *testing.T, app *pocketbase.PocketBase, session *models.Record, jour, numero string, ttc float64) *models.Record {
	t.Helper()

	col, err := app.Dao().FindCollectionByNameOrId("invoices")
	if err != nil {
		t.Fatalf("collection invoices: %v", err)
	}
	rec := models.NewRecord(col)
	rec.Set("owner_company", "co1")
	rec.Set("session", session.Id)
	rec.Set("is_pos_ticket", true)
	rec.Set("is_paid", true)
	rec.Set("status", "validated")
	rec.Set("invoice_type", "invoice")
	rec.Set("number", numero)
	rec.Set("date", jour+" 10:00:00.000Z")
	rec.Set("paid_at", jour+" 10:00:00.000Z")
	rec.Set("total_ht", ttc/1.2)
	rec.Set("total_tva", ttc-ttc/1.2)
	rec.Set("total_ttc", ttc)
	rec.Set("payment_method", "especes")
	rec.Set("payment_method_label", "especes")
	if err := app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("ticket %s: %v", numero, err)
	}
	return rec
}

// LE REJEU DU SCÉNARIO, DE BOUT EN BOUT.
//
// Ouvrir la journée, encaisser un ticket de 2,90 €, clôturer. C'est la séquence
// exacte du 31 août 2026, et elle passe par le MÊME code que le bouton :
// CloturerLaJournee, dont POST /api/cash/session/:id/close n'est qu'une
// enveloppe.
//
// Quatre vérifications, une par exigence :
//  1. le Z est émis, numéroté et haché ;
//  2. le journal des ventes ne signale plus de ticket à clôturer ;
//  3. la journée ne se rouvre pas le même jour ;
//  4. la journée suivante s'ouvre normalement.
func TestLaClotureDeLaJourneeEmetSonZEtLaJourneeNeSeRouvrePas(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	caisse := creerCaisse(t, app, "co1")

	// La journée du test est HIER : le rejeu devient indépendant de l'heure
	// d'exécution, et la clôture emprunte la branche « fin de SA journée ».
	hier := time.Now().AddDate(0, 0, -1)
	jour := hier.Format("2006-01-02")
	ouverture := time.Date(hier.Year(), hier.Month(), hier.Day(), 9, 30, 0, 0, time.Local)

	// ─── 1. Commencer la journée ────────────────────────────────────────────
	session, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user1", ouverture)
	if err != nil {
		t.Fatalf("ouverture de la journée: %v", err)
	}

	// ─── 2. Encaisser le ticket de 2,90 € ───────────────────────────────────
	creerTicket(t, app, session, jour, "TIK-2026-000855", 2.90)

	// Avant clôture, le journal le signale : c'est le badge « 1 ticket à
	// clôturer » vu à l'écran le 31 août.
	jours, _, err := reports.JournalDesVentes(app, "co1", jour, jour)
	if err != nil {
		t.Fatalf("journal avant clôture: %v", err)
	}
	if len(jours) != 1 || jours[0].TicketsHorsZ != 1 {
		t.Fatalf("avant clôture, le journal devrait signaler 1 ticket à clôturer : %+v", jours)
	}

	// ─── 3. Clôturer la journée ─────────────────────────────────────────────
	resultat, err := cloturerLaJourneeA(app, session.Id, 350, "user1", hier)
	if err != nil {
		t.Fatalf("clôture: %v", err)
	}

	// EXIGENCE 1 — le Z est émis, numéroté, haché, et il porte le ticket.
	if resultat.Rapport == nil || resultat.Rapport.Number == "" {
		t.Fatalf("la clôture n'a émis aucun rapport Z")
	}
	if resultat.Rapport.DailyTotals.TotalTTC != 2.90 {
		t.Fatalf("le Z porte %.2f € au lieu de 2,90 €", resultat.Rapport.DailyTotals.TotalTTC)
	}
	if resultat.Rapport.DailyTotals.PosTicketCount != 1 {
		t.Fatalf("le Z compte %d ticket(s) au lieu de 1", resultat.Rapport.DailyTotals.PosTicketCount)
	}
	if resultat.Rapport.Hash == "" {
		t.Fatalf("le Z n'est pas haché")
	}

	// La session est close, rattachée au Z, et son closed_at tombe DANS sa
	// journée — sans quoi le Z ne la reverrait plus au recalcul.
	relue, err := app.Dao().FindRecordById("cash_sessions", session.Id)
	if err != nil {
		t.Fatalf("relecture de la session: %v", err)
	}
	if relue.GetString("status") != "closed" {
		t.Fatalf("la session est restée %q", relue.GetString("status"))
	}
	if relue.GetString("z_report_id") == "" {
		t.Fatalf("la session n'est rattachée à aucun Z : le journal la dira encore à clôturer")
	}
	if jourDeLaDate(relue.GetString("closed_at")) != jour {
		t.Fatalf("closed_at = %q, hors de la journée %s du rapport",
			relue.GetString("closed_at"), jour)
	}
	if relue.GetFloat("counted_cash_total") != 350 {
		t.Fatalf("le comptage du tiroir n'a pas été enregistré")
	}

	// EXIGENCE 2 — le journal des ventes ne signale plus rien.
	jours, _, err = reports.JournalDesVentes(app, "co1", jour, jour)
	if err != nil {
		t.Fatalf("journal après clôture: %v", err)
	}
	if len(jours) != 1 {
		t.Fatalf("%d journée(s) au journal, attendu 1", len(jours))
	}
	if jours[0].TicketsHorsZ != 0 {
		t.Fatalf("le journal signale encore %d ticket(s) à clôturer après la clôture",
			jours[0].TicketsHorsZ)
	}

	// EXIGENCE 3 — la journée ne se rouvre pas le même jour.
	if _, cloturee := JourneeEstCloturee(app.Dao(), caisse.Id, jour); !cloturee {
		t.Fatalf("la journée clôturée n'est pas reconnue : « Commencer la journée » la rouvrirait")
	}
	// Et une seconde clôture est refusée AVANT toute écriture.
	seconde, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user1", ouverture.Add(time.Hour))
	if err != nil {
		t.Fatalf("le filet a refusé d'ouvrir: %v", err)
	}
	if _, err := cloturerLaJourneeA(app, seconde.Id, 0, "user1", hier); err == nil {
		t.Fatalf("une seconde clôture de la même journée a été acceptée : un Z de trop aurait été scellé")
	}
	encoreOuverte, _ := app.Dao().FindRecordById("cash_sessions", seconde.Id)
	if encoreOuverte.GetString("status") != "open" {
		t.Fatalf("le refus a tout de même fermé la session : le refus doit précéder l'écriture")
	}

	// EXIGENCE 4 — la journée suivante s'ouvre normalement.
	demain := hier.AddDate(0, 0, 1).Format("2006-01-02")
	if _, cloturee := JourneeEstCloturee(app.Dao(), caisse.Id, demain); cloturee {
		t.Fatalf("le lendemain du Z est déclaré clôturé : la caisse ne rouvrirait jamais")
	}
}

// UNE JOURNÉE SANS VENTE SE CLÔTURE COMME LES AUTRES, ET SON Z VAUT 0.
//
// Décision du propriétaire, 31 août 2026 : « on peut faire un Z à 0, ça
// existe ». La protection du 29 août visait `z-clotures`, qui BALAIE le passé
// sans qu'on désigne rien — d'où son drapeau `-jour`. Ici quelqu'un a cliqué
// « Clôturer la journée » : le geste désigne la journée.
func TestUneJourneeSansVenteProduitUnZAZero(t *testing.T) {
	app := nouvelleAppDeTestCaisse(t)
	caisse := creerCaisse(t, app, "co1")

	hier := time.Now().AddDate(0, 0, -1)
	jour := hier.Format("2006-01-02")
	ouverture := time.Date(hier.Year(), hier.Month(), hier.Day(), 9, 0, 0, 0, time.Local)

	session, err := sessionDuJourA(app.Dao(), "co1", caisse.Id, "user1", ouverture)
	if err != nil {
		t.Fatalf("ouverture: %v", err)
	}

	resultat, err := cloturerLaJourneeA(app, session.Id, 0, "user1", hier)
	if err != nil {
		t.Fatalf("clôture d'une journée sans vente refusée: %v", err)
	}
	if resultat.Rapport.Number == "" {
		t.Fatalf("aucun Z émis pour une journée sans vente")
	}
	if resultat.Rapport.DailyTotals.TotalTTC != 0 {
		t.Fatalf("le Z d'une journée sans vente porte %.2f €", resultat.Rapport.DailyTotals.TotalTTC)
	}
	if _, cloturee := JourneeEstCloturee(app.Dao(), caisse.Id, jour); !cloturee {
		t.Fatalf("la journée n'est pas clôturée alors que son Z est émis")
	}
}
