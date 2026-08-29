// backend/reports/fonds_reporte.go
//
// LE FONDS REPORTÉ — étape E-2 de la sortie des sessions
// (frontend/modules/cash/PocketCash-docs/07-sortir-des-sessions.md).
//
// ── CE QU'IL REMPLACE ─────────────────────────────────────────────────────
// La saisie manuelle du fonds de caisse. Elle n'apportait aucune information —
// mesuré le 29 août 2026 sur la base de production, le fonds saisi EST déjà le
// tiroir compté de la session précédente : 285,40 puis 263,01 se recopient
// exactement d'une session à l'autre. Elle apportait en revanche ses fautes :
// 0,50 € de frappe le 21/08 (198,20 saisi pour 198,70 compté), 32 fonds à zéro
// sur 65 alors que le tiroir précédent n'était pas vide, et surtout les deux
// tiroirs NÉGATIFS de −154,04 € et −170,24 € du 04-refonte-du-z.md §7, où le
// fonds saisi était déjà net d'une remise en banque que le mouvement
// retranchait une seconde fois.
//
// ── LA RÈGLE, ARBITRÉE PAR LE PROPRIÉTAIRE LE 29 AOÛT 2026 ────────────────
// « Le tiroir COMPTÉ, sinon le THÉORIQUE. »
//
// On part du dernier point SÛR — le dernier comptage réel du tiroir —, puis on
// lui ajoute les flux des journées écoulées depuis. Si aucune session n'a
// jamais été comptée, le point de départ est zéro et le report est purement
// théorique.
//
// Pourquoi pas « toujours le théorique » : un écart constaté le soir (compté
// 227,68 pour un théorique de 230) se reporterait indéfiniment au lieu d'être
// soldé le jour où il a été mesuré.
// Pourquoi pas « toujours le compté » : 23 sessions sur 65 n'ont AUCUN
// comptage — le fonds tomberait à zéro ces jours-là, c'est-à-dire exactement le
// défaut qu'on répare.
//
// ── UN SEUL CALCUL DE TIROIR ──────────────────────────────────────────────
// Les flux ne sont PAS recalculés ici : ils sont lus dans le journal des
// espèces (JournalDesEspecesDao), qui est le chemin unique du tiroir depuis le
// 28 août 2026. Réécrire les signes de cash_in / cash_out / safe_drop serait
// une seconde implémentation des mêmes règles — c'est ce qui a produit trois
// mois de Z faux le 20 mai 2026.

package reports

import (
	"fmt"
	"time"

	"github.com/pocketbase/pocketbase/daos"
)

// FondsReporte rend le fonds de caisse d'une journée : ce qui doit se trouver
// dans le tiroir au matin, avant le premier encaissement.
//
// Il n'est JAMAIS négatif : un tiroir négatif n'existe pas (04-refonte-du-z.md
// §7). Un calcul qui en produirait un signale une anomalie de données en amont,
// pas un fonds — on rend alors zéro plutôt que de propager l'absurdité dans une
// session neuve.
func FondsReporte(dao *daos.Dao, ownerCompany string, jour string) (float64, error) {
	if ownerCompany == "" {
		return 0, fmt.Errorf("owner_company requis")
	}
	if _, err := time.Parse("2006-01-02", jour); err != nil {
		return 0, fmt.Errorf("journée illisible %q: %w", jour, err)
	}

	// ─── 1. Le dernier point sûr : le dernier tiroir COMPTÉ ─────────────────
	ancrage, jourDAncrage := dernierComptageAvant(dao, ownerCompany, jour)

	// ─── 2. Les flux écoulés depuis, lus dans le journal des espèces ────────
	//
	// On cumule les journées STRICTEMENT postérieures au comptage et
	// strictement antérieures à `jour` : le comptage contient déjà tout ce qui
	// s'est passé dans sa propre journée, et `jour` n'a pas encore commencé.
	//
	// Limite connue et assumée : un mouvement enregistré le jour du comptage
	// mais APRÈS la fermeture n'est pas repris. Le cas suppose qu'on encaisse
	// après avoir compté le tiroir et fermé la journée ; il n'est pas nul, mais
	// le journal des espèces le montre, et le comptage du lendemain le solde.
	debut := lendemainDe(jourDAncrage)
	fin := veilleDe(jour)

	if jourDAncrage == "" {
		// Aucun comptage n'a jamais eu lieu : on prend tout ce que le tiroir a
		// connu. Le report est alors purement théorique, ce que la règle prévoit.
		debut = "1970-01-01"
	}

	if debut <= fin {
		jours, _, err := JournalDesEspecesDao(dao, ownerCompany, debut, fin)
		if err != nil {
			return 0, fmt.Errorf("lecture du journal des espèces: %w", err)
		}
		for _, j := range jours {
			// Les FLUX seulement. Le SoldeOuverture de ces journées n'entre
			// jamais : c'est un solde, et l'ajouter compterait comme un apport
			// l'argent qui était déjà dans le tiroir — le piège nommé en tête de
			// journal_especes.go.
			ancrage += j.EspecesDesVentes + j.Apports -
				j.Sorties - j.RemisesEnBanque - j.Remboursements
		}
	}

	ancrage = roundAmount(ancrage)
	if ancrage < 0 {
		return 0, nil
	}
	return ancrage, nil
}

// dernierComptageAvant rend le dernier comptage réel du tiroir strictement
// antérieur à `jour`, et la journée où il a été fait.
//
// Un comptage à zéro n'est pas un tiroir vide : c'est une session fermée sans
// compter — 23 sessions sur 65 sont dans ce cas, et le journal des espèces fait
// déjà la même lecture (`ComptageConnu`). On remonte donc jusqu'à en trouver un
// vrai, plutôt que de reporter un zéro qui n'a jamais été mesuré.
func dernierComptageAvant(dao *daos.Dao, ownerCompany string, jour string) (float64, string) {
	sessions, err := dao.FindRecordsByFilter(
		"cash_sessions",
		fmt.Sprintf(
			"owner_company = '%s' && status = 'closed' && closed_at != '' && closed_at < '%s'",
			ownerCompany, jour+" 00:00:00",
		),
		"-closed_at", 0, 0,
	)
	if err != nil {
		return 0, ""
	}

	for _, sess := range sessions {
		if compte := sess.GetFloat("counted_cash_total"); compte != 0 {
			return compte, jourDe(sess.GetString("closed_at"))
		}
	}
	return 0, ""
}

func lendemainDe(jour string) string {
	t, err := time.Parse("2006-01-02", jour)
	if err != nil {
		return jour
	}
	return t.AddDate(0, 0, 1).Format("2006-01-02")
}

func veilleDe(jour string) string {
	t, err := time.Parse("2006-01-02", jour)
	if err != nil {
		return jour
	}
	return t.AddDate(0, 0, -1).Format("2006-01-02")
}
