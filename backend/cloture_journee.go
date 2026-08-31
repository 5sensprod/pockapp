// backend/cloture_journee.go
//
// LA CLÔTURE DE LA JOURNÉE — fermer la session ET émettre son Z, d'un geste.
//
// ── LE DÉFAUT QUI A CONDUIT ICI (31 août 2026) ────────────────────────────
// La journée du 31 août s'est terminée sans rapport Z : session
// 6746j18fjydlegi laissée `open` avec un `counted_cash_total` de 350 €, son
// unique ticket (TIK-2026-000855, 2,90 €) hors de toute clôture, et le journal
// des ventes affichant « 1 ticket à clôturer » indéfiniment.
//
// La cause immédiate était côté React — CloseSessionDialog lisait un état
// périmé et appelait le comptage au lieu de la clôture. Mais la cause de fond
// était l'architecture du flux : POST /api/cash/session/:id/close se contentait
// de FERMER, et le Z n'était émis que si le navigateur atteignait ensuite
// /cash/rapport-z avec `autoGenerate`, déclenchant GET /api/cash/reports/z —
// un GET qui scelle un document fiscal, au terme d'une chaîne d'effets React.
// Une navigation interrompue, un onglet fermé, un rendu manqué : session close,
// Z jamais émis, et rien qui le signale.
//
// Depuis, les deux écritures sont ICI, dans cet ordre, et le front n'en
// déclenche plus qu'une seule.
//
// ── CE QUE CE FICHIER NE FAIT PAS ─────────────────────────────────────────
// Aucune agrégation. GenerateRapportZ, donc aggregateZ et z_lignes.go, restent
// le seul chemin de calcul — une seconde implémentation des mêmes règles est
// exactement ce qui a produit la régression du 20 mai 2026.

package backend

import (
	"fmt"
	"log"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend/reports"
)

// ErreurCloture distingue un refus AVANT écriture (la clôture n'a rien changé,
// l'appelant doit répondre 400) d'une panne technique.
type ErreurCloture struct {
	Message string
	Refus   bool
}

func (e *ErreurCloture) Error() string { return e.Message }

func refus(format string, a ...any) *ErreurCloture {
	return &ErreurCloture{Message: fmt.Sprintf(format, a...), Refus: true}
}

// ResultatCloture est ce que la clôture rend : la session fermée, la journée
// qu'elle couvre, et le rapport émis.
type ResultatCloture struct {
	Session *models.Record
	Jour    string
	Rapport *reports.RapportZ
}

// CloturerLaJournee ferme une session et émet le rapport Z de sa journée.
//
// `comptage` est le tiroir compté ; il reste facultatif (0 = non compté).
// `utilisateurID` devient `closed_by`.
//
// Un Z à 0 est légitime — décision du propriétaire, 31 août 2026 : une journée
// sans vente se clôture comme les autres. La protection du 29 août visait
// `z-clotures`, qui BALAIE le passé sans qu'on désigne rien ; ici quelqu'un a
// cliqué « Clôturer la journée ».
func CloturerLaJournee(
	app *pocketbase.PocketBase,
	sessionID string,
	comptage float64,
	utilisateurID string,
) (*ResultatCloture, error) {
	return cloturerLaJourneeA(app, sessionID, comptage, utilisateurID, time.Now())
}

// cloturerLaJourneeA porte la règle, à un instant injecté — même procédé que
// sessionDuJourA : les gardiens doivent pouvoir clôturer une journée passée
// sans attendre demain.
func cloturerLaJourneeA(
	app *pocketbase.PocketBase,
	sessionID string,
	comptage float64,
	utilisateurID string,
	maintenant time.Time,
) (*ResultatCloture, error) {
	dao := app.Dao()

	session, err := dao.FindRecordById("cash_sessions", sessionID)
	if err != nil {
		return nil, refus("Session introuvable")
	}
	if session.GetString("status") != "open" {
		return nil, refus("Session déjà fermée")
	}

	caisseID := session.GetString("cash_register")

	// La JOURNÉE COMMERCIALE de la session, jamais « aujourd'hui ». Une session
	// de la veille close ce matin doit porter un `closed_at` de la veille :
	// GenerateRapportZ ne retient que les sessions dont le `closed_at` tombe
	// DANS la journée du rapport (cash_reports.go), et un `closed_at` du
	// lendemain la ferait sortir de toute clôture SANS ERREUR.
	jour := jourLocalDe(session.GetString("opened_at"))
	if jour == "" {
		return nil, fmt.Errorf("session %s : opened_at illisible, clôture impossible", sessionID)
	}

	// ─── Deux refus AVANT toute écriture ────────────────────────────────────
	//
	// Un Z est numéroté, haché, et part chez le comptable : on ne ferme pas une
	// session pour découvrir ensuite qu'elle ne pourra jamais y entrer.

	if numero, cloturee := JourneeEstCloturee(dao, caisseID, jour); cloturee {
		return nil, refus(
			"La journée du %s est déjà clôturée par le rapport %s : un Z est verrouillé et ne peut plus recevoir de session.",
			jour, numero,
		)
	}

	autres, _ := dao.FindRecordsByFilter(
		"cash_sessions",
		fmt.Sprintf("cash_register = '%s' && status = 'open' && id != '%s'", caisseID, session.Id),
		"", 0, 0,
	)
	if len(autres) > 0 {
		return nil, refus(
			"%d autre(s) session(s) encore ouverte(s) sur cette caisse : le Z les regrouperait toutes, la clôture attend leur fermeture.",
			len(autres),
		)
	}

	// ─── 1. Fermer ──────────────────────────────────────────────────────────
	if jour == maintenant.Format("2006-01-02") {
		session.Set("closed_at", maintenant.UTC().Format("2006-01-02 15:04:05.000Z"))
	} else {
		// Même règle que fermerAuPassageDeJournee : la fin de SA journée.
		session.Set("closed_at", jour+" 23:59:59.000Z")
	}
	session.Set("status", "closed")
	if comptage > 0 {
		session.Set("counted_cash_total", comptage)
	}
	if utilisateurID != "" {
		session.Set("closed_by", utilisateurID)
	}
	if err := dao.SaveRecord(session); err != nil {
		return nil, fmt.Errorf("fermeture de la session %s: %w", sessionID, err)
	}

	// ─── 2. Émettre le Z ────────────────────────────────────────────────────
	rapport, err := reports.GenerateRapportZ(app, caisseID, jour)
	if err != nil {
		// La session est fermée, le Z ne s'est pas fait. On ne la rouvre pas —
		// elle peut déjà être citée ailleurs — mais on le DIT : le journal des
		// ventes la montrera « à clôturer », et `z-clotures -jour` sait la
		// sceller. Le silence est ce qui a coûté la journée du 31 août.
		log.Printf("❌ Clôture %s : session fermée mais Z non émis pour le %s : %v", sessionID, jour, err)
		return nil, fmt.Errorf("session fermée, mais le rapport Z du %s n'a pas pu être émis : %w", jour, err)
	}

	log.Printf("✅ Clôture du %s : session %s fermée, rapport %s émis", jour, sessionID, rapport.Number)

	// Relire : GenerateRapportZ a posé `z_report_id` sur la session, et c'est ce
	// champ que le journal des ventes lit pour dire « clôturée »
	// (backend/reports/journal.go).
	if frais, err := dao.FindRecordById("cash_sessions", sessionID); err == nil {
		session = frais
	}

	return &ResultatCloture{Session: session, Jour: jour, Rapport: rapport}, nil
}
