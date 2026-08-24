// backend/reports/session_fonds.go
//
// CORRIGER LE FONDS D'OUVERTURE D'UNE SESSION DE CAISSE.
//
// ── LE CAS MESURÉ, ET CE QU'IL RÉVÈLE ─────────────────────────────────────
// Deux sessions de juin 2026 ont été ouvertes pour la seule saisie d'une remise
// en banque, quelques secondes après la clôture de la session précédente :
//
//	fdyc… clôturée 03/06 07:40, tiroir compté 447,96 €
//	d1vx… ouverte   03/06 07:44, fonds saisi 145,96 €, sortie 300 € à 07:45
//	bllz… clôturée 06/06 18:25:00, tiroir compté 429,56 €
//	6kih… ouverte   06/06 18:25:27, fonds saisi 129,76 €, sortie 300 € à 18:25
//
// Dans les deux cas, le fonds saisi est le tiroir APRÈS la remise, alors que le
// mouvement de 300 € la retranche une seconde fois : « fonds + entrées −
// sorties » (04-refonte-du-z.md, §1) tombe à −154,04 € et −170,24 €. Un tiroir
// négatif n'existe pas ; c'est la saisie qui est fausse, pas la règle.
//
// La correction est donc le FONDS, jamais le mouvement : la remise en banque a
// réellement eu lieu, elle doit rester tracée. Et le fonds juste est le tiroir
// COMPTÉ à la clôture précédente — un chiffre mesuré, pas déduit. En reposant
// ce chiffre-là plutôt que « fonds saisi + 300 », l'écart résiduel reste
// visible : au 03/06, 2,00 € manquent entre les deux sessions, et les masquer
// serait choisir un rapprochement flatteur plutôt que vrai.
//
// ── L'ORDRE DES GESTES, QUI N'EST PAS NÉGOCIABLE ──────────────────────────
//  1. corriger le fonds (ici), tant que la session n'est dans aucun Z ;
//  2. `z-rattacher -apply` : la session entre dans le Z de sa journée ;
//  3. `z-repair -apply` : les valeurs et la chaîne de hachage se refont.
//
// D'où le refus catégorique ci-dessous dès qu'une session porte déjà un
// `z_report_id` : son fonds est scellé dans un document fiscal, et le changer
// sans rejeu laisserait le rapport en désaccord avec sa propre session.

package reports

import (
	"fmt"

	"github.com/pocketbase/pocketbase"
)

// CorrectionFonds est le sort d'une session dont on corrige le fonds.
type CorrectionFonds struct {
	SessionID string
	OuverteLe string
	FermeeLe  string

	AncienFonds, NouveauFonds float64

	// Le rapprochement de la session, avant et après. « Après » n'est pas un
	// second calcul des règles : les espèces attendues sont « fonds + entrées −
	// sorties », le fonds est le seul terme qui bouge, l'écart suit à
	// l'identique. Le chiffre du RAPPORT, lui, sera donné par z-rattacher.
	AncienAttendu, NouvelAttendu float64
	Compte                       float64
	AncienEcart, NouvelEcart     float64

	// NonCompte : le tiroir n'a jamais ete compte a la fermeture.
	NonCompte bool

	Applique bool
}

// CorrigerFondsDOuverture repose le fonds d'ouverture d'une session.
//
// apply = false : simulation, aucune écriture — c'est le défaut.
func CorrigerFondsDOuverture(
	app *pocketbase.PocketBase,
	sessionID string,
	nouveauFonds float64,
	apply bool,
) (*CorrectionFonds, error) {
	dao := app.Dao()

	session, err := dao.FindRecordById("cash_sessions", sessionID)
	if err != nil || session == nil {
		return nil, fmt.Errorf("session introuvable: %s", sessionID)
	}

	// ⚠️ Une session déjà clôturée par un Z porte un fonds scellé dans un
	// document fiscal. Corriger le fonds AVANT le rattachement, jamais après.
	if z := session.GetString("z_report_id"); z != "" {
		return nil, fmt.Errorf(
			"la session est déjà dans un rapport Z (%s) : son fonds est scellé, "+
				"corriger le fonds avant le rattachement, pas après", z)
	}

	// Le rapprochement se lit par GenerateRapportX — le rapport de session, qui
	// partage le classificateur du Z. Aucune règle n'est réécrite ici.
	x, err := GenerateRapportX(app, sessionID)
	if err != nil {
		return nil, fmt.Errorf("rapport X de la session: %w", err)
	}

	c := &CorrectionFonds{
		SessionID:     sessionID,
		OuverteLe:     session.GetString("opened_at"),
		FermeeLe:      session.GetString("closed_at"),
		AncienFonds:   session.GetFloat("opening_float"),
		NouveauFonds:  roundAmount(nouveauFonds),
		AncienAttendu: x.ExpectedCash.Total,
		Compte:        session.GetFloat("counted_cash_total"),
	}
	ecart := roundAmount(c.NouveauFonds - c.AncienFonds)
	c.NouvelAttendu = roundAmount(c.AncienAttendu + ecart)
	// Un comptage à zéro n'est pas un tiroir vide, c'est un tiroir jamais
	// compté : aggregateZ pose alors compté = attendu et un écart nul
	// (cash_reports.go:1035). Annoncer ici un écart que le rapport ne montrera
	// pas ferait décider sur un chiffre qui n'existe nulle part.
	c.NonCompte = c.Compte == 0
	if c.NonCompte {
		c.AncienEcart, c.NouvelEcart = 0, 0
	} else {
		c.AncienEcart = roundAmount(c.Compte - c.AncienAttendu)
		c.NouvelEcart = roundAmount(c.Compte - c.NouvelAttendu)
	}

	if apply {
		session.Set("opening_float", c.NouveauFonds)
		if err := dao.SaveRecord(session); err != nil {
			return nil, fmt.Errorf("écriture: %w", err)
		}
		c.Applique = true
	}

	return c, nil
}
