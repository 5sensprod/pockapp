// backend/reports/z_manquants.go
//
// ÉMETTRE LES RAPPORTS Z QUI N'ONT JAMAIS ÉTÉ FAITS.
//
// Mesuré le 24 août 2026 : 17 sessions de caisse ont été fermées sans jamais
// produire de Z — 8 505,77 € de tickets dans aucune clôture. C'est, au centime,
// tout ce qui reste hors clôture une fois le Z passé à sa période (contrôle de
// couverture : journal 97 216,85 € contre 88 711,08 € couverts par les 46 Z).
//
// ── CE QUE CE CODE N'INVENTE PAS ──────────────────────────────────────────
// Rien n'est fractionné, rien n'est redécoupé, aucune date n'est réécrite. Un Z
// est émis pour chaque JOURNÉE DE FERMETURE portant des sessions non clôturées,
// exactement comme si la clôture avait été faite ce soir-là. Deux sessions
// fermées le même jour donnent un seul Z, comme le veut GenerateRapportZ.
//
// ── L'EFFET DE BORD À CONNAÎTRE ───────────────────────────────────────────
// Depuis que le Z couvre la période écoulée depuis la clôture précédente,
// INSÉRER un Z dans le passé raccourcit la période du Z suivant : l'argent hors
// caisse se redistribue entre les deux. Le total ne bouge pas, sa répartition
// si. C'est pourquoi il faut REJOUER tous les rapports après cette émission —
// `z-repair` s'en charge, et c'est la même fonction de bornes qui tranche.
//
// ⚠️ Émettre un Z est irréversible : c'est un document fiscal, numéroté et
// haché. Simulation d'abord, application fermée, sauvegarde faite.

package reports

import (
	"fmt"
	"sort"

	"github.com/pocketbase/pocketbase"
)

// CloturaManquante est une journée de fermeture sans rapport Z.
type ClotureManquante struct {
	Date         string
	CashRegister string
	NbSessions   int
	NbTickets    int
	TTC          float64

	ZExistant string // non vide : la journée porte déjà un Z, émission impossible
	ZGenere   string
	Erreur    string
}

// GenererCloturesManquantes émet un Z par journée de fermeture non clôturée.
//
// apply = false : simulation, aucune écriture.
func GenererCloturesManquantes(
	app *pocketbase.PocketBase,
	ownerCompany string,
	apply bool,
) ([]ClotureManquante, error) {
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

	// Regrouper par caisse et par journée de FERMETURE : c'est le découpage que
	// GenerateRapportZ applique, et il n'est pas question d'en inventer un autre.
	type cle struct{ caisse, jour string }
	parJour := make(map[cle]*ClotureManquante)
	ordre := make([]cle, 0, len(sessions))

	for _, s := range sessions {
		k := cle{s.GetString("cash_register"), jourDe(s.GetString("closed_at"))}
		if k.jour == "" {
			continue
		}
		entree, vu := parJour[k]
		if !vu {
			entree = &ClotureManquante{Date: k.jour, CashRegister: k.caisse}
			parJour[k] = entree
			ordre = append(ordre, k)
		}
		entree.NbSessions++

		invoices, _ := dao.FindRecordsByFilter(
			"invoices",
			fmt.Sprintf("session = '%s' && status != 'draft'", s.Id),
			"", 0, 0,
		)
		for _, inv := range invoices {
			if inv.GetString("invoice_type") == "credit_note" {
				continue
			}
			entree.NbTickets++
			entree.TTC += inv.GetFloat("total_ttc")
		}
	}

	// Chronologique : chaque Z émis devient la borne basse du suivant. Les
	// émettre dans le désordre produirait des périodes qui se chevauchent.
	sort.Slice(ordre, func(i, j int) bool { return ordre[i].jour < ordre[j].jour })

	sortie := make([]ClotureManquante, 0, len(ordre))
	for _, k := range ordre {
		entree := parJour[k]
		entree.TTC = roundAmount(entree.TTC)

		if existant, _ := dao.FindFirstRecordByFilter(
			"z_reports",
			fmt.Sprintf("cash_register = '%s' && date ~ '%s'", k.caisse, k.jour),
		); existant != nil {
			// La journée porte déjà un Z : GenerateRapportZ rendrait ce rapport
			// sans rien y ajouter. On ne force pas un document scellé depuis ici.
			entree.ZExistant = existant.GetString("number")
			sortie = append(sortie, *entree)
			continue
		}

		if !apply {
			entree.ZGenere = "(simulation)"
			sortie = append(sortie, *entree)
			continue
		}

		rapport, err := GenerateRapportZ(app, k.caisse, k.jour)
		if err != nil {
			entree.Erreur = err.Error()
		} else {
			entree.ZGenere = rapport.Number
		}
		sortie = append(sortie, *entree)
	}

	return sortie, nil
}
