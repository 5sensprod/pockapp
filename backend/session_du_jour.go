// backend/session_du_jour.go
//
// LA SESSION IMPLICITE DU JOUR — étape E-1 de la sortie des sessions
// (frontend/modules/cash/PocketCash-docs/07-sortir-des-sessions.md).
//
// ── POURQUOI ──────────────────────────────────────────────────────────────
// Décision du propriétaire, 29 août 2026 : les sessions de caisse sortent de
// l'usage. Une seule caisse, deux postes, et le nom de l'utilisateur connecté
// dit qui a encaissé. Personne n'ouvre ni ne ferme plus une session à la main.
//
// La collection RESTE, et ses enregistrements aussi : recalculerRapport
// (backend/reports/z_repair.go) relit `session_ids` et ÉCHOUE si une session
// manque. Effacer les cash_sessions rendrait les 60 rapports Z irréparables —
// plus de vérification par recalcul, plus de correction. On cesse d'en créer à
// la main ; on n'en efface jamais aucune.
//
// ── LA PORTE QUE CE FICHIER FERME ─────────────────────────────────────────
// CreateCashMovementIfEspeces cherchait une session ouverte et ABANDONNAIT EN
// SILENCE s'il n'en trouvait pas (« cash_movement ignoré : aucune session
// ouverte »). Un encaissement espèces reçu hors session n'était pas orphelin :
// il était PERDU — aucun mouvement écrit, le tiroir ne le voyait jamais
// (04-refonte-du-z.md §2, 05-…-journal-especes.md §6 question B). Plus aucun
// encaissement ne peut désormais se retrouver sans session.
//
// ── LE PIÈGE DE closed_at, ET IL EST SUBTIL ───────────────────────────────
// GenerateRapportZ ne prend que les sessions dont le `closed_at` tombe DANS LA
// JOURNÉE du rapport (cash_reports.go:1490-1496). Une session de la veille
// fermée à l'instant du premier encaissement du lendemain porterait donc un
// `closed_at` du LENDEMAIN, et le Z de la veille ne la verrait plus : ses
// tickets sortiraient de toute clôture, sans erreur. La clôture par passage de
// journée pose donc `closed_at` à la FIN DE LA JOURNÉE de la session, jamais à
// l'heure courante. Un gardien le vérifie.

package backend

import (
	"fmt"
	"log"
	"time"

	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend/reports"
)

// SessionDuJour rend la session de caisse de la journée en cours, en la créant
// si elle n'existe pas encore. C'est le SEUL chemin d'ouverture : tout ce qui
// encaisse passe par ici, et rien n'ouvre plus une session autrement.
//
// utilisateurID est l'utilisateur du premier encaissement : c'est lui qui
// devient `opened_by`, et c'est son nom que les écrans affichent là où ils
// disaient « session ».
//
// cashRegisterID peut être vide : la caisse est alors résolue par la société.
func SessionDuJour(dao *daos.Dao, ownerCompany, cashRegisterID, utilisateurID string) (*models.Record, error) {
	return sessionDuJourA(dao, ownerCompany, cashRegisterID, utilisateurID, time.Now())
}

// sessionDuJourA porte la règle, à une date injectée. SessionDuJour est sa seule
// forme publique ; la date se passe pour que les gardiens puissent franchir
// minuit sans attendre demain.
func sessionDuJourA(
	dao *daos.Dao,
	ownerCompany, cashRegisterID, utilisateurID string,
	maintenant time.Time,
) (*models.Record, error) {
	if ownerCompany == "" {
		return nil, fmt.Errorf("owner_company requis pour ouvrir la session du jour")
	}

	jour := maintenant.Format("2006-01-02")

	// ─── 1. Une session est-elle déjà ouverte ? ─────────────────────────────
	ouverte := sessionOuverte(dao, ownerCompany)
	if ouverte != nil {
		if jourLocalDe(ouverte.GetString("opened_at")) == jour {
			return ouverte, nil // la session du jour existe déjà
		}
		// Elle est d'une journée passée : le passage à une nouvelle journée la
		// ferme. Sans comptage — le comptage du tiroir est devenu un geste
		// facultatif et distinct (E-3).
		if err := fermerAuPassageDeJournee(dao, ouverte); err != nil {
			return nil, err
		}
	}

	// ─── 2. La créer ────────────────────────────────────────────────────────
	if cashRegisterID == "" {
		caisse := caisseDeLaSociete(dao, ownerCompany)
		if caisse == nil {
			return nil, fmt.Errorf("aucune caisse active pour la société %s", ownerCompany)
		}
		cashRegisterID = caisse.Id
	}

	col, err := dao.FindCollectionByNameOrId("cash_sessions")
	if err != nil {
		return nil, fmt.Errorf("collection cash_sessions introuvable: %w", err)
	}

	rec := models.NewRecord(col)
	rec.Set("owner_company", ownerCompany)
	rec.Set("cash_register", cashRegisterID)
	rec.Set("status", "open")
	// ⚠️ EN UTC, comme tout ce que PocketBase écrit — `created`, `paid_at`, les
	// dates des mouvements. Écrire l'heure LOCALE suffixée d'un « Z » la fait
	// passer pour de l'UTC : mesuré le 29 août 2026 sur la première session
	// implicite de production, `opened_at` à 11:26:24Z pour un ticket créé à
	// 09:26:24Z — deux heures d'écart inventées. Sans conséquence en pleine
	// journée, mais entre minuit et 2 h la journée stockée aurait été la
	// suivante. La JOURNÉE, elle, reste locale : c'est la journée commerciale.
	rec.Set("opened_at", maintenant.UTC().Format("2006-01-02 15:04:05.000Z"))
	if utilisateurID != "" {
		rec.Set("opened_by", utilisateurID)
	}

	// Le fonds reporté (E-2) : le dernier tiroir COMPTÉ, augmenté des flux
	// écoulés depuis — jamais une saisie. Le calcul vit dans
	// backend/reports/fonds_reporte.go et lit le journal des espèces, chemin
	// unique du tiroir : il n'est pas réécrit ici.
	//
	// Une erreur de lecture ne doit pas empêcher d'encaisser : on ouvre alors la
	// session à fonds nul, ce qui est le comportement d'avant E-2 pour 32 des 65
	// sessions, et le journal des espèces rendra l'anomalie visible.
	fonds, err := reports.FondsReporte(dao, ownerCompany, jour)
	if err != nil {
		log.Printf("⚠️ fonds reporté indisponible pour le %s (%v) — session ouverte à 0", jour, err)
		fonds = 0
	}
	rec.Set("opening_float", fonds)

	if err := dao.SaveRecord(rec); err != nil {
		return nil, fmt.Errorf("ouverture de la session du jour: %w", err)
	}

	log.Printf("✅ Session du jour ouverte automatiquement (%s, caisse %s, fonds reporté %.2f€)", jour, cashRegisterID, fonds)
	return rec, nil
}

// fermerAuPassageDeJournee clôt une session restée ouverte d'une journée
// antérieure.
//
// `closed_at` vaut la fin de la journée où la session a été OUVERTE, et non
// l'heure courante : c'est ce qui permet au Z de cette journée-là de la voir
// (voir l'en-tête du fichier). `counted_cash_total` n'est pas touché — une
// session fermée sans comptage se lit comme telle, et aggregateZ sait déjà le
// faire (cash_reports.go).
func fermerAuPassageDeJournee(dao *daos.Dao, session *models.Record) error {
	jour := jourLocalDe(session.GetString("opened_at"))
	if jour == "" {
		// Sans date d'ouverture lisible, on ne sait pas à quelle journée la
		// rattacher : on ne devine pas, on refuse d'écrire.
		return fmt.Errorf("session %s : opened_at illisible, fermeture impossible", session.Id)
	}

	session.Set("status", "closed")
	session.Set("closed_at", jour+" 23:59:59.000Z")

	if err := dao.SaveRecord(session); err != nil {
		return fmt.Errorf("fermeture de la session %s au passage de journée: %w", session.Id, err)
	}

	log.Printf("✅ Session %s fermée au passage de journée (clôturée au %s 23:59:59)", session.Id, jour)
	return nil
}

// sessionOuverte rend la session ouverte d'une société, ou nil.
func sessionOuverte(dao *daos.Dao, ownerCompany string) *models.Record {
	filter := fmt.Sprintf("owner_company = '%s' && status = 'open'", ownerCompany)
	session, err := dao.FindFirstRecordByFilter("cash_sessions", filter)
	if err != nil || session == nil {
		return nil
	}
	return session
}

// caisseDeLaSociete rend la caisse active de la société. Il n'y en a qu'une —
// « une seule caisse, deux postes », décision du 29 août 2026 — mais on la
// résout plutôt que de la supposer.
func caisseDeLaSociete(dao *daos.Dao, ownerCompany string) *models.Record {
	filter := fmt.Sprintf("owner_company = '%s' && is_active = true", ownerCompany)
	caisse, err := dao.FindFirstRecordByFilter("cash_registers", filter)
	if err != nil || caisse == nil {
		return nil
	}
	return caisse
}

// jourDeLaDate rend la journée telle qu'elle est ÉCRITE dans la donnée, sans
// conversion. Utilisée là où l'on compare à une autre chaîne de la même échelle.
func jourDeLaDate(brut string) string {
	if len(brut) < 10 {
		return ""
	}
	return brut[:10]
}

// jourLocalDe rend la JOURNÉE COMMERCIALE d'un instant stocké en UTC.
//
// Une caisse ne raisonne pas en UTC : « aujourd'hui » est la journée du
// commerçant. Un encaissement du 29 août à 00 h 30 (heure de Paris) est stocké
// « 2026-08-28 22:30:00Z » ; lire ses dix premiers caractères le rattacherait au
// 28 et ferait rouvrir une session pour rien.
func jourLocalDe(brut string) string {
	for _, forme := range []string{
		"2006-01-02 15:04:05.000Z",
		"2006-01-02 15:04:05Z",
		"2006-01-02T15:04:05.000Z",
		"2006-01-02T15:04:05Z07:00",
	} {
		if t, err := time.Parse(forme, brut); err == nil {
			return t.Local().Format("2006-01-02")
		}
	}
	// Date illisible : on retombe sur ce qui est écrit, plutôt que de rendre
	// vide et de provoquer une fermeture impossible.
	return jourDeLaDate(brut)
}
