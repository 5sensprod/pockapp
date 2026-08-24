// backend/reports/z_renumerotation.go
//
// REMETTRE LES RAPPORTS Z DANS L'ORDRE DE LEURS DATES.
//
// ── POURQUOI ──────────────────────────────────────────────────────────────
// Le 24 août 2026, quatorze clôtures manquantes ont été émises d'un coup pour
// des journées allant de janvier à août. Elles ont reçu les numéros 47 à 60,
// à la suite des rapports existants : la séquence ne suit donc plus les dates.
// Z-2026-000060 couvre le 21 août, Z-2026-000046 le 23 — le premier porte un
// numéro plus élevé et une date plus ancienne.
//
// La séquence d'un Z est censée être la suite CHRONOLOGIQUE des clôtures d'une
// caisse : c'est par elle qu'on vérifie qu'aucune ne manque. Des dates qui
// descendent quand les numéros montent ressemblent à une altération, alors que
// ce n'est qu'une clôture tardive.
//
// ── CE QUE ÇA N'EFFACE PAS ────────────────────────────────────────────────
// `generated_at` n'est pas touché. Un rapport émis le 24 août pour une journée
// de février continue de le dire, et c'est précisément ce qu'un contrôleur veut
// voir. Renuméroter réordonne la séquence ; ça ne prétend pas que la clôture a
// eu lieu à temps.
//
// ── L'ORDRE DES OPÉRATIONS, ET IL N'EST PAS NÉGOCIABLE ────────────────────
// `number` est UNIQUE au schéma. Réattribuer les numéros en place les ferait
// entrer en collision — donner le n°46 à un rapport pendant que l'ancien n°46
// le porte encore. D'où deux passes : tous les rapports prennent d'abord un
// numéro temporaire, puis leur numéro définitif.
//
// ⚠️ Le hash couvre `number` et `sequence_number`. Renuméroter INVALIDE donc
// toute la chaîne, et `z-repair -apply` doit suivre immédiatement pour la
// reconstruire. Entre les deux, les rapports sont incohérents.

package reports

import (
	"fmt"
	"sort"

	"github.com/pocketbase/pocketbase"
)

// RenumerotationEntry est le sort d'un rapport dans la renumérotation.
type RenumerotationEntry struct {
	ID           string
	Date         string
	AncienNumero string
	AncienRang   int
	NouveauNum   string
	NouveauRang  int
	Erreur       string
}

// Change dit si le rapport reçoit un numéro différent.
func (e RenumerotationEntry) Change() bool { return e.AncienNumero != e.NouveauNum }

// RenumeroterZParDate réattribue les numéros dans l'ordre des dates, par
// entreprise et par exercice — la même partition que getNextZSequence.
//
// apply = false : simulation, aucune écriture.
func RenumeroterZParDate(
	app *pocketbase.PocketBase,
	apply bool,
) ([]RenumerotationEntry, error) {
	dao := app.Dao()

	rapports, err := dao.FindRecordsByFilter("z_reports", "id != ''", "date", 0, 0)
	if err != nil {
		return nil, fmt.Errorf("chargement des rapports Z: %w", err)
	}

	sort.SliceStable(rapports, func(i, j int) bool {
		a, b := rapports[i], rapports[j]
		if a.GetString("owner_company") != b.GetString("owner_company") {
			return a.GetString("owner_company") < b.GetString("owner_company")
		}
		if a.GetInt("fiscal_year") != b.GetInt("fiscal_year") {
			return a.GetInt("fiscal_year") < b.GetInt("fiscal_year")
		}
		if jourDe(a.GetString("date")) != jourDe(b.GetString("date")) {
			return jourDe(a.GetString("date")) < jourDe(b.GetString("date"))
		}
		// Deux Z le même jour ne devraient pas exister — GenerateRapportZ le
		// refuse. Si le cas se présente, l'ordre d'émission tranche.
		return a.GetInt("sequence_number") < b.GetInt("sequence_number")
	})

	rangs := make(map[string]int) // owner_company|fiscal_year → dernier rang
	entrees := make([]RenumerotationEntry, 0, len(rapports))

	for _, rec := range rapports {
		fiscalYear := rec.GetInt("fiscal_year")
		cle := fmt.Sprintf("%s|%d", rec.GetString("owner_company"), fiscalYear)
		rangs[cle]++
		rang := rangs[cle]

		entrees = append(entrees, RenumerotationEntry{
			ID:           rec.Id,
			Date:         jourDe(rec.GetString("date")),
			AncienNumero: rec.GetString("number"),
			AncienRang:   rec.GetInt("sequence_number"),
			NouveauNum:   fmt.Sprintf("Z-%d-%0*d", fiscalYear, NumberPadding, rang),
			NouveauRang:  rang,
		})
	}

	if !apply {
		return entrees, nil
	}

	// ── Passe 1 : des numéros temporaires, pour desserrer l'unicité ─────────
	for i, rec := range rapports {
		if !entrees[i].Change() {
			continue
		}
		rec.Set("number", "TMP-"+rec.Id)
		if err := dao.SaveRecord(rec); err != nil {
			entrees[i].Erreur = fmt.Sprintf("passe temporaire: %v", err)
		}
	}

	// ── Passe 2 : les numéros définitifs ────────────────────────────────────
	for i, rec := range rapports {
		if entrees[i].Erreur != "" {
			continue
		}
		rec.Set("number", entrees[i].NouveauNum)
		rec.Set("sequence_number", entrees[i].NouveauRang)
		if err := dao.SaveRecord(rec); err != nil {
			entrees[i].Erreur = fmt.Sprintf("attribution: %v", err)
		}
	}

	return entrees, nil
}
