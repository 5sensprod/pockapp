// backend/reports/z_rattachement.go
//
// RATTACHER À SON RAPPORT Z UNE SESSION FERMÉE QUE LA CLÔTURE A MANQUÉE.
//
// ── LE CAS QUE CE CODE TRAITE, ET LUI SEUL ────────────────────────────────
// Une session est fermée, elle n'est dans aucun Z, et la journée de sa
// fermeture en porte DÉJÀ un. `z-clotures` la déclare alors « BLOQUÉE » et
// passe son chemin : GenerateRapportZ rend le rapport existant sans rien y
// ajouter (cash_reports.go:1286). L'argent de la session reste donc hors
// clôture indéfiniment, et le journal des ventes le signale sans fin.
//
// Mesuré le 24 août 2026 : 2 sessions dans ce cas, dont une seule porte des
// tickets (140,67 €). Ce sont les deux dernières du bandeau ambre.
//
// ── CE QUE RATTACHER VEUT DIRE, ET CE QUE ÇA NE VEUT PAS DIRE ─────────────
// On n'émet AUCUN document : le Z du jour existe, il est numéroté, et son
// numéro ne bouge pas. On corrige son DÉCOUPAGE — la liste `session_ids` — pour
// qu'il porte la session qu'il aurait portée si la clôture avait attendu. Puis
// `z-repair -apply` recalcule ses valeurs et rechaîne les hash, par aggregateZ,
// c'est-à-dire par le seul chemin d'agrégation qui existe. Ici, pas une seule
// règle de calcul n'est écrite : ce fichier ne fait que déplacer un identifiant.
//
// C'est la seule issue non destructrice. Supprimer les sessions romprait la
// chaîne de hachage des tickets qu'elles portent (séquences en milieu de
// chaîne) et effacerait les remises en banque ; les supprimer SEULES
// orphelinerait leurs tickets, que le journal compte par leur date : le bandeau
// s'éteindrait, l'argent resterait dehors.
//
// ⚠️ Rattacher modifie un document fiscal scellé. Simulation d'abord,
// PocketApp fermé, sauvegarde faite — et `z-repair -apply` ENSUITE, sans quoi
// le Z porterait une session que ses totaux ignorent.

package reports

import (
	"fmt"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

// Rattachement est le sort d'une session orpheline.
type Rattachement struct {
	SessionID  string
	FermeeLe   string
	NbTickets  int
	TicketsTTC float64

	ZID     string
	ZNumero string

	// Avant / après, tels que le rejeu les écrira. Ce sont les chiffres sur
	// lesquels le propriétaire décide.
	AncienEncaisse, NouveauEncaisse                   float64
	AncienTTC, NouveauTTC                             float64
	AncienEspecesAttendues, NouvellesEspecesAttendues float64
	AncienEspecesComptees, NouvellesEspecesComptees   float64
	AncienEcartEspeces, NouvelEcartEspeces            float64
	AncienNbTickets, NouveauNbTickets                 int

	Applique bool
	Erreur   string
}

// EcartEncaisse est ce que le rattachement ajoute au total encaissé du Z.
func (r Rattachement) EcartEncaisse() float64 {
	return roundAmount(r.NouveauEncaisse - r.AncienEncaisse)
}

// EcartEspeces est ce qu'il ajoute aux espèces attendues — le chiffre que le
// commerçant confronte à son tiroir. Il peut être NÉGATIF : une session ouverte
// pour la seule remise en banque sort plus d'espèces qu'elle n'en a vu entrer.
func (r Rattachement) EcartEspeces() float64 {
	return roundAmount(r.NouvellesEspecesAttendues - r.AncienEspecesAttendues)
}

// RattacherSessionsOrphelines rattache au Z de leur journée les sessions
// fermées qu'aucun Z ne porte.
//
// apply = false : simulation, aucune écriture — c'est le défaut.
func RattacherSessionsOrphelines(
	app *pocketbase.PocketBase,
	ownerCompany string,
	apply bool,
) ([]Rattachement, error) {
	dao := app.Dao()

	sessions, err := dao.FindRecordsByFilter(
		"cash_sessions",
		fmt.Sprintf(
			"owner_company = '%s' && status = 'closed' && (z_report_id = '' || z_report_id = null)",
			ownerCompany,
		),
		"closed_at", 0, 0,
	)
	if err != nil {
		return nil, fmt.Errorf("chargement des sessions: %w", err)
	}

	sortie := make([]Rattachement, 0, len(sessions))

	for _, s := range sessions {
		jour := jourDe(s.GetString("closed_at"))
		if jour == "" {
			continue
		}
		caisse := s.GetString("cash_register")

		// Le Z doit être celui de la MÊME caisse et du MÊME jour de fermeture :
		// c'est le découpage de GenerateRapportZ, et on n'en invente pas un autre.
		z, _ := dao.FindFirstRecordByFilter(
			"z_reports",
			fmt.Sprintf("cash_register = '%s' && date ~ '%s'", caisse, jour),
		)
		if z == nil {
			// Pas de Z ce jour-là : ce n'est pas le cas de ce fichier, `z-clotures`
			// sait l'émettre.
			continue
		}

		r := Rattachement{
			SessionID: s.Id,
			FermeeLe:  jour,
			ZID:       z.Id,
			ZNumero:   z.GetString("number"),
		}
		r.NbTickets, r.TicketsTTC = ticketsDeLaSession(app, s.Id)

		ids := z.GetStringSlice("session_ids")
		if contient(ids, s.Id) {
			// Le Z la porte déjà : seul le lien retour manque sur la session.
			r.Erreur = "déjà dans session_ids — seul z_report_id manquait"
		}

		avant, err := recalculerRapport(app, z, ownerCompany, z.GetString("previous_hash"))
		if err != nil {
			r.Erreur = fmt.Sprintf("état actuel illisible: %v", err)
			sortie = append(sortie, r)
			continue
		}
		r.AncienEncaisse = avant.DailyTotals.CollectedTTC
		r.AncienTTC = avant.DailyTotals.TotalTTC
		r.AncienEspecesAttendues = avant.DailyTotals.TotalCashExpected
		r.AncienEspecesComptees = avant.DailyTotals.TotalCashCounted
		r.AncienEcartEspeces = avant.DailyTotals.TotalCashDifference
		r.AncienNbTickets = avant.DailyTotals.InvoiceCount

		// La simulation passe par la MÊME fonction que le rejeu : on lui donne un
		// exemplaire du rapport dont `session_ids` porte la session en plus, EN
		// MÉMOIRE, sans jamais l'enregistrer. Aucune règle n'est recalculée ici.
		apres, err := recalculerRapport(app, avecSession(z, ids, s.Id), ownerCompany,
			z.GetString("previous_hash"))
		if err != nil {
			r.Erreur = fmt.Sprintf("simulation impossible: %v", err)
			sortie = append(sortie, r)
			continue
		}
		r.NouveauEncaisse = apres.DailyTotals.CollectedTTC
		r.NouveauTTC = apres.DailyTotals.TotalTTC
		r.NouvellesEspecesAttendues = apres.DailyTotals.TotalCashExpected
		r.NouvellesEspecesComptees = apres.DailyTotals.TotalCashCounted
		r.NouvelEcartEspeces = apres.DailyTotals.TotalCashDifference
		r.NouveauNbTickets = apres.DailyTotals.InvoiceCount

		if apply {
			if err := ecrireRattachement(app, z, s, ids); err != nil {
				r.Erreur = fmt.Sprintf("écriture: %v", err)
			} else {
				r.Applique = true
			}
		}

		sortie = append(sortie, r)
	}

	return sortie, nil
}

// ecrireRattachement pose les deux moitiés du lien, et elles vont ensemble : le
// Z porte la session dans `session_ids`, la session porte le Z dans
// `z_report_id`. N'en écrire qu'une laisserait soit un rapport qui compte une
// session que rien ne dit close, soit une session close qu'aucun rapport ne
// compte — les deux moitiés du problème qu'on répare.
//
// Les VALEURS du rapport ne sont pas touchées ici : c'est `z-repair` qui les
// refait, par aggregateZ.
func ecrireRattachement(
	app *pocketbase.PocketBase,
	z *models.Record,
	session *models.Record,
	idsActuels []string,
) error {
	if !contient(idsActuels, session.Id) {
		z.Set("session_ids", append(append([]string{}, idsActuels...), session.Id))
		if err := app.Dao().SaveRecord(z); err != nil {
			return fmt.Errorf("rapport %s: %w", z.GetString("number"), err)
		}
	}
	session.Set("z_report_id", z.Id)
	if err := app.Dao().SaveRecord(session); err != nil {
		return fmt.Errorf("session %s: %w", session.Id, err)
	}
	return nil
}

// avecSession rend une COPIE du rapport dont session_ids porte la session en
// plus. L'original n'est pas touché : la simulation ne doit rien laisser
// derrière elle.
func avecSession(z *models.Record, ids []string, sessionID string) *models.Record {
	copie := models.NewRecord(z.Collection())
	copie.Load(z.ColumnValueMap())
	if !contient(ids, sessionID) {
		copie.Set("session_ids", append(append([]string{}, ids...), sessionID))
	}
	return copie
}

// ticketsDeLaSession compte ce que la session porte, avoirs exclus — même
// décompte que le journal des ventes.
func ticketsDeLaSession(app *pocketbase.PocketBase, sessionID string) (int, float64) {
	invoices, _ := app.Dao().FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("session = '%s' && status != 'draft'", sessionID),
		"", 0, 0,
	)
	var ttc float64
	nb := 0
	for _, inv := range invoices {
		if inv.GetString("invoice_type") == "credit_note" {
			continue
		}
		nb++
		ttc += inv.GetFloat("total_ttc")
	}
	return nb, roundAmount(ttc)
}

func contient(liste []string, val string) bool {
	for _, v := range liste {
		if v == val {
			return true
		}
	}
	return false
}
