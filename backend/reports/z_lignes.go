// backend/reports/z_lignes.go
// Ticket Z-2/Z-3/Z-4 — le classement d'un document dans les quatre lignes du Z.
//
// Contrat : frontend/modules/cash/PocketCash-docs/04-refonte-du-z.md, §1 et §2.
//
//	ENCAISSÉ AUJOURD'HUI
//	  1. Ventes du jour ............ tickets de la session + factures hors caisse
//	                                 émises ET payées le même jour. SEULE ligne
//	                                 qui porte du HT et de la TVA.
//	  2. Règlements de factures antérieures ... TTC seul
//	  3. Acomptes ............................. TTC seul
//	  4. Remboursements ....................... TTC seul, en déduction
//
// Les lignes 2 à 4 sont en TTC seul, et c'est délibéré : une grandeur sans base
// HT ne peut pas se confondre avec du chiffre d'affaires, ni s'y additionner par
// accident. La ligne 2 devra peut-être un jour porter sa propre TVA sur la part
// « prestation de services » (§3, décision 3, ticket N-1) : elle est donc
// représentée par une structure, pas par un simple float, pour qu'on puisse lui
// ajouter cette TVA sans redessiner le calcul.

package reports

import (
	"fmt"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

// LigneZ désigne l'une des quatre lignes du Z, ou l'absence de ligne.
type LigneZ int

const (
	// LigneAucune : le document n'entre nulle part. Deux cas seulement, tous
	// deux nommés (§2) : la conversion ticket → facture, et la facture parente
	// dont le solde a été facturé.
	LigneAucune LigneZ = iota
	// LigneVentesDuJour est la ligne 1, le seul chiffre d'affaires du Z.
	LigneVentesDuJour
	// LigneCreances est la ligne 2 : encaissement d'une facture émise avant.
	LigneCreances
	// LigneAcomptes est la ligne 3 : acomptes, factures de solde, et parentes
	// amputées de leurs acomptes.
	LigneAcomptes
	// LigneRemboursements est la ligne 4, en déduction.
	LigneRemboursements
)

func (l LigneZ) String() string {
	switch l {
	case LigneVentesDuJour:
		return "ventes du jour"
	case LigneCreances:
		return "règlements de factures antérieures"
	case LigneAcomptes:
		return "acomptes"
	case LigneRemboursements:
		return "remboursements"
	default:
		return "hors lignes"
	}
}

// LigneTTC porte une des lignes 2 à 4 : un compteur et un montant TTC.
//
// Pas de HT, pas de TVA : c'est ce qui rend une addition accidentelle avec la
// ligne 1 impossible. La structure existe — plutôt qu'un simple float — pour que
// le ticket N-1 puisse un jour lui ajouter la TVA exigible à l'encaissement sur
// la part « prestation de services », sans redessiner le calcul.
type LigneTTC struct {
	Count int     `json:"count"`
	TTC   float64 `json:"ttc"`
}

func (l *LigneTTC) ajouter(ttc float64) {
	l.Count++
	l.TTC += ttc
}

func (l *LigneTTC) arrondir() {
	l.TTC = roundAmount(l.TTC)
}

// classificateurZ range un document hors caisse dans sa ligne.
//
// Il ne fait aucune requête tant qu'on ne le lui demande pas, et met en cache ce
// qu'il résout : sur un Z chargé, les mêmes parentes reviennent.
type classificateurZ struct {
	app *pocketbase.PocketBase
	// jour est la journée du rapport, "2006-01-02". Un document hors caisse
	// émis ce jour-là et encaissé ce jour-là est une vente du jour (ligne 1) ;
	// émis avant, c'est un règlement de créance (ligne 2).
	jour string

	origines  map[string]*models.Record // original_invoice_id → document d'origine
	acomptes  map[string][]*models.Record
	soldes    map[string]bool
	dossierVu map[string]bool
}

func nouveauClassificateur(app *pocketbase.PocketBase, jour string) *classificateurZ {
	return &classificateurZ{
		app:       app,
		jour:      jour,
		origines:  make(map[string]*models.Record),
		acomptes:  make(map[string][]*models.Record),
		soldes:    make(map[string]bool),
		dossierVu: make(map[string]bool),
	}
}

// origine résout original_invoice_id. C'est un champ TEXTE, pas une relation :
// impossible de le déréférencer dans un filtre PocketBase, d'où cette requête à
// part — même contrainte et même résolution que frontend/lib/queries/closures.ts.
func (c *classificateurZ) origine(id string) *models.Record {
	if id == "" {
		return nil
	}
	if rec, vu := c.origines[id]; vu {
		return rec
	}
	rec, err := c.app.Dao().FindRecordById("invoices", id)
	if err != nil {
		rec = nil
	}
	c.origines[id] = rec
	return rec
}

// estConversionDeTicket dit si le document est une facture née d'un ticket de
// caisse. Son chiffre d'affaires est DÉJÀ dans le ticket, en ligne 1, et son
// règlement n'a pas eu lieu à la caisse ce jour-là : elle n'entre nulle part.
//
// C'est le remplacement du filtre `original_invoice_id vide` (ticket Z-3), qui
// disait vouloir exclure les conversions mais excluait AUSSI les acomptes et les
// factures de solde, par accident — les trois portent un original_invoice_id.
// L'exclusion est maintenant nommée : elle ne rejette que ce qui vient d'un
// ticket.
func (c *classificateurZ) estConversionDeTicket(inv *models.Record) bool {
	parentID := inv.GetString("original_invoice_id")
	if parentID == "" {
		return false
	}
	origine := c.origine(parentID)
	return origine != nil && origine.GetBool("is_pos_ticket")
}

// dossierAcompte charge les acomptes et l'éventuelle facture de solde rattachés
// à une facture parente.
func (c *classificateurZ) dossierAcompte(parentID string) (acomptes []*models.Record, aUnSolde bool) {
	if !c.dossierVu[parentID] {
		dao := c.app.Dao()
		acs, err := dao.FindRecordsByFilter(
			"invoices",
			fmt.Sprintf("invoice_type = 'deposit' && original_invoice_id = '%s' && status != 'draft'", parentID),
			"created", 0, 0,
		)
		if err == nil {
			c.acomptes[parentID] = acs
		}
		solde, err := dao.FindFirstRecordByFilter(
			"invoices",
			fmt.Sprintf("invoice_type = 'invoice' && original_invoice_id = '%s' && status != 'draft'", parentID),
		)
		c.soldes[parentID] = err == nil && solde != nil
		c.dossierVu[parentID] = true
	}
	return c.acomptes[parentID], c.soldes[parentID]
}

// classer rend la ligne d'un document HORS CAISSE déjà retenu par la requête du
// jour (payé ce jour pour les factures, émis ce jour pour les avoirs), et le
// montant TTC à porter sur cette ligne.
//
// Les tickets de caisse ne passent pas par ici : ils sont en ligne 1 par leur
// session, sans condition.
func (c *classificateurZ) classer(inv *models.Record) (LigneZ, float64) {
	return c.classerAuJour(inv, c.jour)
}

// classerAuJour est le même classement, mais pour une journée donnée plutôt que
// pour celle du classificateur.
//
// C'est ce qui permet au journal des ventes (journal.go) de traiter une PÉRIODE
// avec le même code, chaque document se comparant à sa propre journée. Les
// règles ne sont écrites qu'une fois : le Z, le X et le journal appellent tous
// cette fonction. Deux implémentations des mêmes règles sont exactement ce qui a
// produit la régression du 20 mai 2026.
func (c *classificateurZ) classerAuJour(inv *models.Record, jour string) (LigneZ, float64) {
	invType := inv.GetString("invoice_type")
	ttc := inv.GetFloat("total_ttc")

	// ── Ligne 4 — remboursements ────────────────────────────────────────────
	if invType == "credit_note" {
		// Un avoir sans moyen de remboursement est une ANNULATION : aucun argent
		// n'est sorti du tiroir. Le compter creuserait un trou fictif — mesuré,
		// 20 documents et 7 061,51 € dans ce cas (§2).
		if inv.GetString("refund_method") == "" && inv.GetString("payment_method") == "" {
			return LigneAucune, 0
		}
		return LigneRemboursements, abs(ttc)
	}

	if invType != "" && invType != "invoice" && invType != "deposit" {
		return LigneAucune, 0
	}

	// ── Ligne 3 — acomptes ──────────────────────────────────────────────────
	if invType == "deposit" {
		return LigneAcomptes, ttc
	}

	// À partir d'ici : invoice_type == "invoice" (ou vide, traité comme tel).
	if parentID := inv.GetString("original_invoice_id"); parentID != "" {
		if c.estConversionDeTicket(inv) {
			return LigneAucune, 0
		}
		// Une facture rattachée à une facture, ce n'est pas une conversion :
		// c'est une facture de SOLDE (deposit.go, CreateBalanceInvoice). Elle
		// porte le reste à payer d'un dossier d'acompte → ligne 3.
		return LigneAcomptes, ttc
	}

	// ── Règle anti-doublon parente / acompte / solde (§2) ───────────────────
	// Le modèle de deposit.go produit TROIS documents pour un seul encaissement
	// possible : la parente (total), les acomptes, la facture de solde. Les trois
	// peuvent porter is_paid = true. Les sommer compterait l'argent deux fois —
	// mesuré, 7 parentes dans ce cas, 2 523,70 €.
	if acomptes, aUnSolde := c.dossierAcompte(inv.Id); len(acomptes) > 0 {
		if aUnSolde {
			// 1. Un solde existe : la parente n'entre PAS. Ses acomptes et son
			//    solde portent le dossier, une seule fois. Vérifié sur cinq
			//    dossiers réels (§2).
			return LigneAucune, 0
		}
		// 2. Sinon la parente entre AMPUTÉE des acomptes déjà encaissés, et
		//    chaque acompte entre pour lui-même à sa propre date.
		var verses float64
		for _, ac := range acomptes {
			if ac.GetBool("is_paid") {
				verses += ac.GetFloat("total_ttc")
			}
		}
		reste := roundAmount(ttc - verses)
		if reste <= 0 {
			return LigneAucune, 0
		}
		// La parente d'un dossier d'acompte n'est pas une vente du jour (§2) :
		// ce qui est encaissé ici est le reliquat d'un dossier, pas une vente
		// de comptoir. Elle rejoint donc la ligne 3, avec ses acomptes.
		//
		// Le §2 du contrat disait « bloc 2 », qui recouvrait les lignes 2 à 4
		// sans les départager. Arbitré par le propriétaire le 24 août 2026 :
		// LIGNE 3. Le total encaissé est le même dans les deux cas — seul
		// change le libellé sous lequel le commerçant lit ce montant, et un
		// dossier d'acompte se lit d'un bloc, sur une seule ligne.
		return LigneAcomptes, reste
	}

	// ── Lignes 1 et 2 — la date d'émission tranche ──────────────────────────
	if jourDe(inv.GetString("date")) == jour {
		return LigneVentesDuJour, ttc
	}
	return LigneCreances, ttc
}

// jourDe rend la journée d'une date PocketBase, au format "2006-01-02".
func jourDe(brut string) string {
	if brut == "" {
		return ""
	}
	if t := parsePocketBaseDate(brut); !t.IsZero() {
		return t.Format("2006-01-02")
	}
	if len(brut) >= 10 {
		return brut[:10]
	}
	return ""
}
