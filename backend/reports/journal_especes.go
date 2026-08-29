// backend/reports/journal_especes.go
//
// LE JOURNAL DES ESPÈCES — « ce qui est entré et sorti du tiroir ».
//
// ── POURQUOI IL EXISTE ────────────────────────────────────────────────────
// Le 27 août 2026, le rapprochement espèces est sorti du rapport Z : un apport
// de fonds n'est ni une vente ni un encaissement de vente, et le Z est un
// document fiscal (05-le-z-v3-et-le-journal-especes.md). Les trois chiffres
// `total_cash_*` restent calculés et stockés, mais plus personne ne les montre
// hors du comptage du tiroir. Ce journal est ce qui recueille cette matière.
//
// ── POURQUOI PAR JOURNÉE, ET NON PAR SESSION ──────────────────────────────
// Arbitré le 27 août (§6 question B, réponse B). Même raison que le journal des
// ventes : une journée est ce que le commerçant reconnaît, une session peut
// s'étendre sur plusieurs jours. Le solde d'ouverture d'une journée est donc
// l'`opening_float` de la PREMIÈRE session ouverte ce jour-là — un solde lu,
// jamais reconstruit.
//
// ── LE PIÈGE, ET IL A DÉJÀ COÛTÉ ──────────────────────────────────────────
// Le fonds d'ouverture est un SOLDE, les mouvements sont des FLUX. Le présenter
// comme une entrée compterait chaque jour comme un apport l'argent qui était
// déjà dans le tiroir la veille. Deux sessions dont le fonds saisi était déjà
// net de la remise en banque ont produit des espèces attendues à −154,04 € et
// −170,24 € (04-refonte-du-z.md, §7) : un tiroir négatif n'existe pas, et ce
// journal doit rendre l'anomalie visible sans la créer.
//
// ── CE QU'IL LIT ──────────────────────────────────────────────────────────
// TOUS les mouvements du tiroir, pas seulement les libres : espèces des ventes
// comprises. C'est la seule vue qui reconstitue le tiroir —
//
//	fonds d'ouverture + espèces des ventes + apports
//	                  − sorties − remises − remboursements = ce qui doit y être
//
// Mesuré le 27 août 2026 sur la base de production : 193 mouvements, dont 170
// liés à une vente (10 728,01 € entrés, 500,40 € sortis) et 23 libres, nets de
// −8 486,14 €, dont 79 % en nombre sont des remises en banque.

package reports

import (
	"fmt"
	"sort"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
)

// MouvementEspeces est une ligne du journal.
type MouvementEspeces struct {
	ID     string `json:"id"`
	Type   string `json:"type"`   // cash_in, cash_out, refund_out, safe_drop, adjustment
	Nature string `json:"nature"` // "vente" ou "tiroir"
	Sens   int    `json:"sens"`   // +1 entrée, −1 sortie

	// Montant est TOUJOURS positif ; c'est Sens qui dit le côté. Un montant
	// signé se prête trop bien à une addition distraite.
	Montant  float64 `json:"montant"`
	Motif    string  `json:"motif,omitempty"`
	Document string  `json:"document,omitempty"` // numéro de la pièce liée
	Auteur   string  `json:"auteur,omitempty"`
	Heure    string  `json:"heure,omitempty"`

	instant time.Time
}

// JourneeEspeces est une journée de tiroir.
type JourneeEspeces struct {
	Date string `json:"date"`

	// SoldeOuverture est l'opening_float de la première session ouverte ce
	// jour-là. Zéro quand aucune session ne s'est ouverte : le tiroir n'a pas
	// été ouvert, ce n'est pas un fonds nul — d'où OuvertureConnue.
	SoldeOuverture   float64 `json:"solde_ouverture"`
	OuvertureConnue  bool    `json:"ouverture_connue"`
	EspecesDesVentes float64 `json:"especes_des_ventes"`
	Apports          float64 `json:"apports"`
	Sorties          float64 `json:"sorties"`
	Remboursements   float64 `json:"remboursements"`
	RemisesEnBanque  float64 `json:"remises_en_banque"`

	// SoldeTheorique = ouverture + ventes + apports − sorties − remises
	//                  − remboursements.
	SoldeTheorique float64 `json:"solde_theorique"`

	// Comptage réel du tiroir, quand une session s'est fermée ce jour-là.
	Compte        float64 `json:"compte"`
	ComptageConnu bool    `json:"comptage_connu"`
	Ecart         float64 `json:"ecart"`

	NbMouvements int                `json:"nb_mouvements"`
	Mouvements   []MouvementEspeces `json:"mouvements"`
}

// TotauxEspeces cumule la période affichée.
type TotauxEspeces struct {
	EspecesDesVentes float64 `json:"especes_des_ventes"`
	Apports          float64 `json:"apports"`
	Sorties          float64 `json:"sorties"`
	Remboursements   float64 `json:"remboursements"`
	RemisesEnBanque  float64 `json:"remises_en_banque"`
	NbMouvements     int     `json:"nb_mouvements"`
	NbJours          int     `json:"nb_jours"`
}

// estMouvementDeVente dit si un mouvement matérialise les espèces d'une vente,
// par opposition à un mouvement de tiroir.
//
// Critère : `related_invoice` OU `meta.invoice_id` / `meta.invoice_number` —
// arbitré le 27 août 2026 (§6 question D). Les trois critères possibles
// donnaient le même résultat sur les données d'alors, ce qui rendait le choix
// gratuit à ce moment-là et coûteux plus tard : il est donc fixé ici, à un seul
// endroit, et c'est ce journal qui le porte.
func estMouvementDeVente(mov *models.Record) bool {
	if mov.GetString("related_invoice") != "" {
		return true
	}
	meta := getMetaMap(mov)
	if meta == nil {
		return false
	}
	for _, cle := range []string{"invoice_id", "invoice_number"} {
		if v, present := meta[cle]; present {
			if s, estChaine := v.(string); estChaine && s != "" {
				return true
			}
		}
	}
	return false
}

// JournalDesEspeces rend une journée par jour de la période, de la plus récente
// à la plus ancienne, plus le cumul.
func JournalDesEspeces(
	app *pocketbase.PocketBase,
	ownerCompany string,
	du string,
	au string,
) ([]JourneeEspeces, TotauxEspeces, error) {
	return JournalDesEspecesDao(app.Dao(), ownerCompany, du, au)
}

// JournalDesEspecesDao porte le calcul. Elle ne prend qu'un dao pour que le
// paquet `backend` puisse l'appeler depuis SessionDuJour, qui n'a pas d'app
// sous la main (session_du_jour.go, E-2) : le fonds reporté est un solde de ce
// journal, et il n'en existe qu'un seul calcul.
func JournalDesEspecesDao(
	dao *daos.Dao,
	ownerCompany string,
	du string,
	au string,
) ([]JourneeEspeces, TotauxEspeces, error) {
	borneBasse := du + " 00:00:00"
	finDeJournee, err := time.Parse("2006-01-02", au)
	if err != nil {
		return nil, TotauxEspeces{}, fmt.Errorf("date de fin illisible: %w", err)
	}
	borneHaute := finDeJournee.AddDate(0, 0, 1).Format("2006-01-02") + " 00:00:00"

	journees := make(map[string]*JourneeEspeces)
	obtenir := func(jour string) *JourneeEspeces {
		if j, ok := journees[jour]; ok {
			return j
		}
		j := &JourneeEspeces{Date: jour, Mouvements: make([]MouvementEspeces, 0)}
		journees[jour] = j
		return j
	}

	// ─── 1. Les sessions : fonds d'ouverture et comptage ────────────────────
	//
	// Le fonds est rattaché au jour de l'OUVERTURE, le comptage au jour de la
	// FERMETURE. Une session ouverte le 17 et fermée le 30 — 42 sessions sur 65
	// sont dans ce cas (journal.go) — donne donc son fonds au 17 et son comptage
	// au 30, ce qui est la vérité du tiroir dans les deux cas.
	sessions, err := dao.FindRecordsByFilter(
		"cash_sessions",
		fmt.Sprintf("owner_company = '%s'", ownerCompany),
		"opened_at", 0, 0,
	)
	if err != nil {
		return nil, TotauxEspeces{}, fmt.Errorf("chargement des sessions: %w", err)
	}

	premiereOuverture := make(map[string]string)
	for _, sess := range sessions {
		ouverture := sess.GetString("opened_at")
		if jour := jourDe(ouverture); jour >= du && jour <= au {
			j := obtenir(jour)
			if !j.OuvertureConnue || ouverture < premiereOuverture[jour] {
				j.SoldeOuverture = sess.GetFloat("opening_float")
				j.OuvertureConnue = true
				premiereOuverture[jour] = ouverture
			}
		}

		fermeture := sess.GetString("closed_at")
		if fermeture == "" {
			continue
		}
		if jour := jourDe(fermeture); jour >= du && jour <= au {
			// Un comptage à zéro n'est pas un tiroir vide : c'est une session
			// fermée sans compter. aggregateZ force alors l'écart à zéro
			// (cash_reports.go) ; ici on préfère ne rien affirmer.
			if compte := sess.GetFloat("counted_cash_total"); compte != 0 {
				j := obtenir(jour)
				j.Compte += compte
				j.ComptageConnu = true
			}
		}
	}

	// ─── 2. Les mouvements ──────────────────────────────────────────────────
	mouvements, err := dao.FindRecordsByFilter(
		"cash_movements",
		fmt.Sprintf(
			"owner_company = '%s' && created >= '%s' && created < '%s'",
			ownerCompany, borneBasse, borneHaute,
		),
		"created", 0, 0,
	)
	if err != nil {
		return nil, TotauxEspeces{}, fmt.Errorf("chargement des mouvements: %w", err)
	}

	nomAuteur := resolveurNomUtilisateur(dao)

	for _, mov := range mouvements {
		cree := mov.GetString("created")
		jour := jourDe(cree)
		if jour < du || jour > au {
			continue
		}
		j := obtenir(jour)

		montant := mov.GetFloat("amount")
		if montant < 0 {
			montant = -montant
		}
		typ := mov.GetString("movement_type")
		vente := estMouvementDeVente(mov)

		ligne := MouvementEspeces{
			ID:       mov.Id,
			Type:     typ,
			Montant:  roundAmount(montant),
			Motif:    mov.GetString("reason"),
			Document: numeroDeLaPieceLiee(dao, mov),
			Auteur:   nomAuteur(mov.GetString("created_by")),
			instant:  parsePocketBaseDate(cree),
		}
		if !ligne.instant.IsZero() {
			ligne.Heure = ligne.instant.Format("15:04")
		}
		if vente {
			ligne.Nature = "vente"
		} else {
			ligne.Nature = "tiroir"
		}

		// La ventilation suit EXACTEMENT le signe qu'applique aggregateZ à ses
		// espèces attendues (cash_reports.go) : cash_in et adjustment entrent,
		// cash_out, refund_out et safe_drop sortent. Deux signes différents pour
		// la même donnée, ce serait deux vérités sur le même tiroir.
		switch typ {
		case "cash_in", "adjustment":
			ligne.Sens = 1
			if vente {
				j.EspecesDesVentes += montant
			} else {
				j.Apports += montant
			}
		case "safe_drop":
			ligne.Sens = -1
			j.RemisesEnBanque += montant
		case "refund_out":
			ligne.Sens = -1
			j.Remboursements += montant
		case "cash_out":
			ligne.Sens = -1
			j.Sorties += montant
		default:
			// Un type inconnu n'entre dans aucun solde : mieux vaut une ligne
			// visible et non comptée qu'un solde faux en silence.
			ligne.Sens = 0
		}

		j.Mouvements = append(j.Mouvements, ligne)
		j.NbMouvements++
	}

	// ─── 3. Soldes, tri, cumul ──────────────────────────────────────────────
	jours := make([]JourneeEspeces, 0, len(journees))
	var totaux TotauxEspeces

	for _, j := range journees {
		j.SoldeTheorique = roundAmount(
			j.SoldeOuverture + j.EspecesDesVentes + j.Apports -
				j.Sorties - j.RemisesEnBanque - j.Remboursements,
		)
		j.SoldeOuverture = roundAmount(j.SoldeOuverture)
		j.EspecesDesVentes = roundAmount(j.EspecesDesVentes)
		j.Apports = roundAmount(j.Apports)
		j.Sorties = roundAmount(j.Sorties)
		j.RemisesEnBanque = roundAmount(j.RemisesEnBanque)
		j.Remboursements = roundAmount(j.Remboursements)
		j.Compte = roundAmount(j.Compte)
		if j.ComptageConnu {
			j.Ecart = roundAmount(j.Compte - j.SoldeTheorique)
		}

		sort.SliceStable(j.Mouvements, func(a, b int) bool {
			return j.Mouvements[a].instant.Before(j.Mouvements[b].instant)
		})

		totaux.EspecesDesVentes += j.EspecesDesVentes
		totaux.Apports += j.Apports
		totaux.Sorties += j.Sorties
		totaux.Remboursements += j.Remboursements
		totaux.RemisesEnBanque += j.RemisesEnBanque
		totaux.NbMouvements += j.NbMouvements

		jours = append(jours, *j)
	}

	sort.SliceStable(jours, func(a, b int) bool { return jours[a].Date > jours[b].Date })

	totaux.EspecesDesVentes = roundAmount(totaux.EspecesDesVentes)
	totaux.Apports = roundAmount(totaux.Apports)
	totaux.Sorties = roundAmount(totaux.Sorties)
	totaux.Remboursements = roundAmount(totaux.Remboursements)
	totaux.RemisesEnBanque = roundAmount(totaux.RemisesEnBanque)
	totaux.NbJours = len(jours)

	return jours, totaux, nil
}

// numeroDeLaPieceLiee rend le numéro du document qui a produit le mouvement,
// quand il y en a un. Le mouvement porte soit une relation, soit un numéro
// recopié dans `meta` : les deux sont lus.
func numeroDeLaPieceLiee(dao *daos.Dao, mov *models.Record) string {
	if meta := getMetaMap(mov); meta != nil {
		if v, present := meta["invoice_number"]; present {
			if s, estChaine := v.(string); estChaine && s != "" {
				return s
			}
		}
	}
	id := mov.GetString("related_invoice")
	if id == "" {
		return ""
	}
	inv, err := dao.FindRecordById("invoices", id)
	if err != nil || inv == nil {
		return ""
	}
	return inv.GetString("number")
}

// resolveurNomUtilisateur nomme l'auteur d'un mouvement, avec un cache : un même
// utilisateur revient sur toutes ses lignes. Même forme que resolveurNomClient
// (journal.go), et même raison d'être.
func resolveurNomUtilisateur(dao *daos.Dao) func(string) string {
	cache := make(map[string]string)

	return func(id string) string {
		if id == "" {
			return ""
		}
		if n, ok := cache[id]; ok {
			return n
		}
		n := getUserNameDao(dao, id)
		cache[id] = n
		return n
	}
}
