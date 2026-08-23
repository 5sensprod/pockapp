// backend/reports/journal.go
//
// LE JOURNAL DES VENTES — « où j'en suis de mon chiffre d'affaires ».
//
// ── POURQUOI IL NE S'APPUIE PAS SUR LES RAPPORTS Z ────────────────────────
// C'est le piège évident, et il est mesuré : le Z n'existe qu'APRÈS clôture,
// et **69 % de l'argent hors caisse tombe des journées sans aucun Z** — 163
// encaissements, 46 010,34 € contre 65 encaissements et 20 517,98 € les jours
// avec Z (04-refonte-du-z.md, §2). Un journal alimenté par les z_reports
// laisserait le commerçant aussi aveugle qu'avant, la moitié des jours.
// Il lit donc les documents eux-mêmes, jour par jour.
//
// ── POURQUOI IL EST ICI, EN GO, ET PAS DANS L'ÉCRAN ───────────────────────
// Il parle la même langue que le Z — les quatre lignes du contrat — et il doit
// donc suivre EXACTEMENT les mêmes règles : exclusion nommée des conversions de
// ticket, anti-doublon parente / acompte / solde, avoirs d'annulation écartés.
// Réécrire ces règles en TypeScript serait une seconde implémentation des mêmes
// règles, c'est-à-dire très précisément ce qui a produit la régression du
// 20 mai 2026. Le classificateur (z_lignes.go) est donc partagé, tel quel, et
// l'écran ne fait qu'afficher.
//
// ── CE QUI DIFFÈRE DU Z, ET C'EST VOULU ───────────────────────────────────
// La SÉLECTION, pas les règles. Le Z prend les tickets par leur SESSION — il
// répond à « que couvre cette clôture ». Le journal les prend par leur JOUR —
// il répond à « que s'est-il passé ce jour-là ». Les deux coïncident sauf si
// une session franchit minuit, auquel cas le journal range le ticket à sa date
// et le Z à sa session. Aucun des deux n'a tort : ils ne répondent pas à la
// même question.
//
// Aucune écriture, aucune sortie réseau : lecture seule sur le PocketBase local.

package reports

import (
	"fmt"
	"sort"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

// JournalDocument est une ligne du détail d'une journée.
type JournalDocument struct {
	ID     string  `json:"id"`
	Number string  `json:"number"`
	Nature string  `json:"nature"` // ticket, facture, acompte, solde, avoir
	Ligne  string  `json:"ligne"`  // le libellé de la ligne du contrat
	TTC    float64 `json:"ttc"`
	Moyen  string  `json:"moyen"`
	Client string  `json:"client,omitempty"`
	Heure  string  `json:"heure,omitempty"`
}

// JournalJour est une journée : le total encaissé, ses quatre lignes, et le
// détail des documents qui les composent.
//
// VentesHT et VentesTVA ne concernent QUE la ligne 1 — c'est la seule qui porte
// du chiffre d'affaires. Les trois autres n'ont pas de base HT, et c'est ce qui
// les rend inadditionnables avec elle.
type JournalJour struct {
	Date string `json:"date"` // "2006-01-02"

	VentesDuJour   float64 `json:"ventes_du_jour"`
	Creances       float64 `json:"creances"`
	Acomptes       float64 `json:"acomptes"`
	Remboursements float64 `json:"remboursements"`
	Encaisse       float64 `json:"encaisse"`

	VentesHT  float64 `json:"ventes_ht"`
	VentesTVA float64 `json:"ventes_tva"`

	NbDocuments int                `json:"nb_documents"`
	ParMoyen    map[string]float64 `json:"par_moyen"`

	// ZNumbers dit si la journée a été clôturée, et par quel(s) rapport(s).
	// Une journée sans Z n'est pas une anomalie : c'est le cas courant pour
	// l'argent hors caisse.
	ZNumbers []string `json:"z_numbers"`

	Documents []JournalDocument `json:"documents"`
}

// JournalTotaux cumule la période affichée.
type JournalTotaux struct {
	VentesDuJour   float64 `json:"ventes_du_jour"`
	Creances       float64 `json:"creances"`
	Acomptes       float64 `json:"acomptes"`
	Remboursements float64 `json:"remboursements"`
	Encaisse       float64 `json:"encaisse"`
	VentesHT       float64 `json:"ventes_ht"`
	VentesTVA      float64 `json:"ventes_tva"`
	NbDocuments    int     `json:"nb_documents"`
	NbJours        int     `json:"nb_jours"`
}

// JournalDesVentes rend une journée par jour de la période, de la plus récente
// à la plus ancienne, plus le cumul.
//
// `du` et `au` sont inclusifs, au format "2006-01-02".
func JournalDesVentes(
	app *pocketbase.PocketBase,
	ownerCompany string,
	du string,
	au string,
) ([]JournalJour, JournalTotaux, error) {
	debut, err := time.Parse("2006-01-02", du)
	if err != nil {
		return nil, JournalTotaux{}, fmt.Errorf("date de début invalide %q: %w", du, err)
	}
	fin, err := time.Parse("2006-01-02", au)
	if err != nil {
		return nil, JournalTotaux{}, fmt.Errorf("date de fin invalide %q: %w", au, err)
	}
	if fin.Before(debut) {
		return nil, JournalTotaux{}, fmt.Errorf("la date de fin précède la date de début")
	}

	borneBasse := debut.Format("2006-01-02")
	borneHaute := fin.Add(24 * time.Hour).Format("2006-01-02")

	dao := app.Dao()
	jours := make(map[string]*JournalJour)
	obtenir := func(jour string) *JournalJour {
		if j, ok := jours[jour]; ok {
			return j
		}
		j := &JournalJour{Date: jour, ParMoyen: make(map[string]float64)}
		jours[jour] = j
		return j
	}

	// Le classificateur porte les règles du contrat. Sa journée de référence est
	// posée document par document (classerAuJour) : sur une période, chaque
	// facture se compare à SA journée, pas à une seule.
	classificateur := nouveauClassificateur(app, "")

	nomClient := make(map[string]string)
	client := func(id string) string {
		if id == "" {
			return ""
		}
		if n, ok := nomClient[id]; ok {
			return n
		}
		n := ""
		if c, err := dao.FindRecordById("customers", id); err == nil && c != nil {
			n = c.GetString("company_name")
			if n == "" {
				n = fmt.Sprintf("%s %s", c.GetString("firstname"), c.GetString("lastname"))
			}
		}
		nomClient[id] = n
		return n
	}

	ajouter := func(jour string, ligne LigneZ, montant float64, inv *models.Record, nature string) {
		j := obtenir(jour)
		moyen := libelleMoyenPaiement(inv)

		switch ligne {
		case LigneVentesDuJour:
			j.VentesDuJour += montant
			j.VentesHT += inv.GetFloat("total_ht")
			j.VentesTVA += inv.GetFloat("total_tva")
			j.ParMoyen[moyen] += montant
		case LigneCreances:
			j.Creances += montant
			j.ParMoyen[moyen] += montant
		case LigneAcomptes:
			j.Acomptes += montant
			j.ParMoyen[moyen] += montant
		case LigneRemboursements:
			j.Remboursements += montant
			rm := inv.GetString("refund_method")
			if rm == "" {
				rm = moyen
			}
			moyen = rm
			j.ParMoyen[rm] -= montant
		default:
			return
		}

		j.NbDocuments++
		j.Documents = append(j.Documents, JournalDocument{
			ID:     inv.Id,
			Number: inv.GetString("number"),
			Nature: nature,
			Ligne:  ligne.String(),
			TTC:    roundAmount(montant),
			Moyen:  moyen,
			Client: client(inv.GetString("customer")),
			Heure:  heureDe(inv),
		})
	}

	// ─── 1. Tickets de caisse et leurs avoirs, par leur date ────────────────
	tickets, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf(
			"owner_company = '%s' && is_pos_ticket = true && status != 'draft' && date >= '%s' && date < '%s'",
			ownerCompany, borneBasse, borneHaute,
		),
		"date", 0, 0,
	)
	if err != nil {
		return nil, JournalTotaux{}, fmt.Errorf("chargement des tickets: %w", err)
	}
	for _, inv := range tickets {
		jour := jourDe(inv.GetString("date"))
		if inv.GetString("invoice_type") == "credit_note" {
			ajouter(jour, LigneRemboursements, abs(inv.GetFloat("total_ttc")), inv, "avoir")
			continue
		}
		ajouter(jour, LigneVentesDuJour, inv.GetFloat("total_ttc"), inv, "ticket")
	}

	// ─── 2. Documents hors caisse encaissés, par leur paid_at ───────────────
	horsCaisse, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf(
			"owner_company = '%s' && is_pos_ticket = false && is_paid = true && status != 'draft' && (invoice_type = 'invoice' || invoice_type = 'deposit') && paid_at >= '%s' && paid_at < '%s'",
			ownerCompany, borneBasse, borneHaute,
		),
		"paid_at", 0, 0,
	)
	if err != nil {
		return nil, JournalTotaux{}, fmt.Errorf("chargement des factures: %w", err)
	}
	for _, inv := range horsCaisse {
		jour := jourDe(inv.GetString("paid_at"))
		ligne, montant := classificateur.classerAuJour(inv, jour)
		if ligne == LigneAucune {
			// Conversion de ticket, ou parente dont le solde est facturé.
			continue
		}
		ajouter(jour, ligne, montant, inv, natureDe(inv))
	}

	// ─── 3. Avoirs hors caisse, par leur date d'émission ────────────────────
	avoirs, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf(
			"owner_company = '%s' && is_pos_ticket = false && invoice_type = 'credit_note' && status != 'draft' && date >= '%s' && date < '%s'",
			ownerCompany, borneBasse, borneHaute,
		),
		"date", 0, 0,
	)
	if err == nil {
		for _, inv := range avoirs {
			jour := jourDe(inv.GetString("date"))
			ligne, montant := classificateur.classerAuJour(inv, jour)
			if ligne == LigneAucune {
				// Avoir sans moyen de remboursement : une annulation, aucun
				// argent n'est sorti du tiroir.
				continue
			}
			ajouter(jour, ligne, montant, inv, "avoir")
		}
	}

	// ─── 4. Quelles journées ont été clôturées ──────────────────────────────
	zs, err := dao.FindRecordsByFilter(
		"z_reports",
		fmt.Sprintf(
			"owner_company = '%s' && date >= '%s' && date < '%s'",
			ownerCompany, borneBasse, borneHaute,
		),
		"date", 0, 0,
	)
	if err == nil {
		for _, z := range zs {
			jour := jourDe(z.GetString("date"))
			if jour == "" {
				continue
			}
			j := obtenir(jour)
			j.ZNumbers = append(j.ZNumbers, z.GetString("number"))
		}
	}

	// ─── 5. Arrondis, totaux, tri ───────────────────────────────────────────
	var totaux JournalTotaux
	sortie := make([]JournalJour, 0, len(jours))
	for _, j := range jours {
		j.VentesDuJour = roundAmount(j.VentesDuJour)
		j.Creances = roundAmount(j.Creances)
		j.Acomptes = roundAmount(j.Acomptes)
		j.Remboursements = roundAmount(j.Remboursements)
		j.VentesHT = roundAmount(j.VentesHT)
		j.VentesTVA = roundAmount(j.VentesTVA)
		j.Encaisse = roundAmount(
			j.VentesDuJour + j.Creances + j.Acomptes - j.Remboursements,
		)
		for k, v := range j.ParMoyen {
			j.ParMoyen[k] = roundAmount(v)
		}

		totaux.VentesDuJour += j.VentesDuJour
		totaux.Creances += j.Creances
		totaux.Acomptes += j.Acomptes
		totaux.Remboursements += j.Remboursements
		totaux.Encaisse += j.Encaisse
		totaux.VentesHT += j.VentesHT
		totaux.VentesTVA += j.VentesTVA
		totaux.NbDocuments += j.NbDocuments

		sortie = append(sortie, *j)
	}

	// La plus récente en tête : c'est la journée sur laquelle porte la question
	// « où j'en suis ».
	sort.Slice(sortie, func(i, k int) bool { return sortie[i].Date > sortie[k].Date })

	totaux.NbJours = len(sortie)
	totaux.VentesDuJour = roundAmount(totaux.VentesDuJour)
	totaux.Creances = roundAmount(totaux.Creances)
	totaux.Acomptes = roundAmount(totaux.Acomptes)
	totaux.Remboursements = roundAmount(totaux.Remboursements)
	totaux.Encaisse = roundAmount(totaux.Encaisse)
	totaux.VentesHT = roundAmount(totaux.VentesHT)
	totaux.VentesTVA = roundAmount(totaux.VentesTVA)

	return sortie, totaux, nil
}

// natureDe nomme un document hors caisse pour l'affichage. La facture de solde
// se distingue de la facture ordinaire par son rattachement à une parente.
func natureDe(inv *models.Record) string {
	switch inv.GetString("invoice_type") {
	case "deposit":
		return "acompte"
	case "credit_note":
		return "avoir"
	}
	if inv.GetString("original_invoice_id") != "" {
		return "solde"
	}
	return "facture"
}

func heureDe(inv *models.Record) string {
	for _, champ := range []string{"paid_at", "date", "created"} {
		if t := parsePocketBaseDate(inv.GetString(champ)); !t.IsZero() {
			if t.Hour() == 0 && t.Minute() == 0 {
				continue // une date sans heure ne dit rien
			}
			return t.Format("15:04")
		}
	}
	return ""
}
