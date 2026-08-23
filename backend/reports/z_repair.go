package reports

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

// ============================================================================
// RÉPARATION DES RAPPORTS Z DÉJÀ ÉMIS
// ============================================================================
//
// Recalcule les totaux de chaque rapport Z depuis les documents sources, puis
// reconstruit la chaîne de hachage. Le DÉCOUPAGE N'EST PAS TOUCHÉ : chaque Z
// garde exactement les sessions qu'il portait (`session_ids`) et sa date. Seules
// ses VALEURS sont refaites.
//
// Corrige d'un même geste les deux anomalies mesurées le 22 août 2026 :
//   - les tickets POS comptés deux fois (régression du 20 mai, Z-022 → Z-045) ;
//   - les factures B2B jamais agrégées (avant le 20 mai) ou encaissées après la
//     génération du Z — le recalcul se fait sur l'état actuel des documents.
//
// L'agrégation passe par aggregateZ, la même fonction que GenerateRapportZ :
// l'historique réparé et les Z futurs suivent donc les mêmes règles, par
// construction et non par recopie.

// ZRepairEntry est le sort d'un rapport dans la réparation.
type ZRepairEntry struct {
	ID             string
	Number         string
	Date           string
	SequenceNumber int

	AncienHT, AncienTVA, AncienTTC    float64
	NouveauHT, NouveauTVA, NouveauTTC float64
	AncienNbTickets, NouveauNbTickets int

	// Le rejeu sous schema_version = 2 ne change pas seulement des valeurs : il
	// change ce que les valeurs VEULENT DIRE. AncienTTC est un total mêlé —
	// ventes du jour ET règlements de créances ; NouveauTTC ne porte plus que la
	// ligne 1. Les comparer directement ferait passer pour une perte ce qui n'est
	// qu'un déplacement. C'est NouveauEncaisse qu'il faut confronter à AncienTTC.
	AncienVersion, NouveauVersion int
	NouveauEncaisse               float64
	NouveauVentesDuJour           float64
	NouveauCreances               float64
	NouveauAcomptes               float64
	NouveauRemboursements         float64

	AncienHash, NouveauHash string

	// ValeursChangees : les totaux eux-mêmes diffèrent — c'est la vraie
	// correction. Change : le hash diffère, ce qui arrive aussi par simple effet
	// de chaîne quand un rapport ANTÉRIEUR a bougé. Les deux sont distincts, et
	// c'est le premier qui intéresse le lecteur.
	ValeursChangees bool
	// Enrichi : l'argent est identique, seuls des champs absents à l'époque
	// apparaissent (by_customer_type, net_ttc… ajoutés après coup). Ce n'est pas
	// une correction comptable.
	Enrichi bool
	Change  bool
	Erreur  string
}

// EcartTTC est la correction apportée au total TTC (négatif = le Z annonçait trop).
func (e ZRepairEntry) EcartTTC() float64 { return roundAmount(e.NouveauTTC - e.AncienTTC) }

// EcartEncaisse confronte l'ARGENT : ce que le rapport annonçait en tête, et ce
// que le nouveau total encaissé annonce. C'est le seul écart qui se lise comme
// une correction comptable ; l'écart sur total_ttc, lui, mesure surtout un
// changement de définition.
func (e ZRepairEntry) EcartEncaisse() float64 {
	return roundAmount(e.NouveauEncaisse - e.AncienTTC)
}

// LignesEquilibrees vérifie l'invariant du contrat sur ce rapport : le total
// encaissé est la somme de ses quatre lignes, ni plus ni moins.
func (e ZRepairEntry) LignesEquilibrees() bool {
	somme := e.NouveauVentesDuJour + e.NouveauCreances + e.NouveauAcomptes - e.NouveauRemboursements
	return math.Abs(roundAmount(somme)-e.NouveauEncaisse) <= 0.005
}

// ZRepairReport est le bilan d'ensemble.
type ZRepairReport struct {
	Applique bool
	Entries  []ZRepairEntry
}

// Modifies rend les seuls rapports dont les valeurs changent.
func (r *ZRepairReport) Modifies() []ZRepairEntry {
	var out []ZRepairEntry
	for _, e := range r.Entries {
		if e.Change {
			out = append(out, e)
		}
	}
	return out
}

// RepairZReports recalcule tous les rapports Z d'une base.
//
// apply = false : simulation, aucune écriture — c'est le défaut, et c'est ce
// qu'il faut lancer d'abord. apply = true : réécrit les rapports modifiés.
//
// ⚠️ En écriture, l'application doit être FERMÉE : PocketBase ne partage pas sa
// connexion d'écriture, et une base ouverte ailleurs ferait échouer ou traînerait
// les mises à jour.
func RepairZReports(app *pocketbase.PocketBase, apply bool) (*ZRepairReport, error) {
	dao := app.Dao()

	rapports, err := dao.FindRecordsByFilter("z_reports", "id != ''", "sequence_number", 0, 0)
	if err != nil {
		return nil, fmt.Errorf("chargement des rapports Z: %w", err)
	}

	// La chaîne de hachage se reconstruit dans l'ordre des séquences, par
	// entreprise et exercice — même partition que getNextZSequence.
	sort.SliceStable(rapports, func(i, j int) bool {
		if rapports[i].GetString("owner_company") != rapports[j].GetString("owner_company") {
			return rapports[i].GetString("owner_company") < rapports[j].GetString("owner_company")
		}
		if rapports[i].GetInt("fiscal_year") != rapports[j].GetInt("fiscal_year") {
			return rapports[i].GetInt("fiscal_year") < rapports[j].GetInt("fiscal_year")
		}
		return rapports[i].GetInt("sequence_number") < rapports[j].GetInt("sequence_number")
	})

	bilan := &ZRepairReport{Applique: apply}
	hashPrecedent := make(map[string]string) // clé: owner_company|fiscal_year

	for _, rec := range rapports {
		entry := ZRepairEntry{
			ID:              rec.Id,
			Number:          rec.GetString("number"),
			Date:            rec.GetString("date"),
			SequenceNumber:  rec.GetInt("sequence_number"),
			AncienHT:        rec.GetFloat("total_ht"),
			AncienTVA:       rec.GetFloat("total_tva"),
			AncienTTC:       rec.GetFloat("total_ttc"),
			AncienNbTickets: rec.GetInt("invoice_count"),
			AncienHash:      rec.GetString("hash"),
			// Un rapport d'avant le contrat ne porte pas la colonne : GetInt rend
			// 0, qu'on lit comme la version 1 — la règle d'origine.
			AncienVersion: versionDeSchema(rec),
		}

		ownerCompany := rec.GetString("owner_company")
		fiscalYear := rec.GetInt("fiscal_year")
		clePartition := fmt.Sprintf("%s|%d", ownerCompany, fiscalYear)

		precedent, vu := hashPrecedent[clePartition]
		if !vu {
			precedent = GENESIS_HASH_Z
		}

		nouveau, err := recalculerRapport(app, rec, ownerCompany, precedent)
		if err != nil {
			entry.Erreur = err.Error()
			bilan.Entries = append(bilan.Entries, entry)
			// La chaîne ne peut pas continuer sur un maillon manquant.
			hashPrecedent[clePartition] = entry.AncienHash
			continue
		}

		entry.NouveauHT = nouveau.DailyTotals.TotalHT
		entry.NouveauTVA = nouveau.DailyTotals.TotalTVA
		entry.NouveauTTC = nouveau.DailyTotals.TotalTTC
		entry.NouveauNbTickets = nouveau.DailyTotals.InvoiceCount
		entry.NouveauVersion = nouveau.DailyTotals.SchemaVersion
		entry.NouveauEncaisse = nouveau.DailyTotals.CollectedTTC
		entry.NouveauVentesDuJour = nouveau.DailyTotals.TotalTTC
		entry.NouveauCreances = nouveau.DailyTotals.CollectedFromReceivablesTTC
		entry.NouveauAcomptes = nouveau.DailyTotals.CollectedDepositsTTC
		entry.NouveauRemboursements = nouveau.DailyTotals.RefundsTTC
		entry.NouveauHash = nouveau.Hash
		entry.Change = entry.NouveauHash != entry.AncienHash
		entry.ValeursChangees = montantsDifferents(rec, nouveau)
		entry.Enrichi = !entry.ValeursChangees && totauxDifferents(rec, nouveau)

		hashPrecedent[clePartition] = nouveau.Hash

		if apply && entry.Change {
			if err := ecrireRapport(app, rec, nouveau); err != nil {
				entry.Erreur = fmt.Sprintf("écriture: %v", err)
			}
		}

		bilan.Entries = append(bilan.Entries, entry)
	}

	return bilan, nil
}

// recalculerRapport rejoue l'agrégation d'un rapport existant, à découpage et
// identité inchangés.
func recalculerRapport(
	app *pocketbase.PocketBase,
	rec *models.Record,
	ownerCompany string,
	previousHash string,
) (*RapportZ, error) {
	dao := app.Dao()

	// Le découpage est celui du rapport : ses sessions, sa date. On ne le
	// recalcule pas, on le relit.
	sessionIDs := rec.GetStringSlice("session_ids")
	sessions := make([]*models.Record, 0, len(sessionIDs))
	for _, id := range sessionIDs {
		s, err := dao.FindRecordById("cash_sessions", id)
		if err != nil {
			// Une session disparue est une anomalie, pas un cas nominal.
			return nil, fmt.Errorf("session %s introuvable", id)
		}
		sessions = append(sessions, s)
	}
	sort.SliceStable(sessions, func(i, j int) bool {
		return sessions[i].GetString("closed_at") < sessions[j].GetString("closed_at")
	})

	jour := rec.GetString("date")
	if len(jour) < 10 {
		return nil, fmt.Errorf("date illisible: %q", jour)
	}
	jour = jour[:10]
	debut, err := time.Parse("2006-01-02", jour)
	if err != nil {
		return nil, fmt.Errorf("date invalide %q: %w", jour, err)
	}
	dateStartStr := debut.Format("2006-01-02") + " 00:00:00"
	dateEndStr := debut.Add(24*time.Hour).Format("2006-01-02") + " 00:00:00"

	agg, err := aggregateZ(app, sessions, ownerCompany, dateStartStr, dateEndStr)
	if err != nil {
		return nil, err
	}

	caisse, err := dao.FindRecordById("cash_registers", rec.GetString("cash_register"))
	if err != nil {
		return nil, fmt.Errorf("caisse introuvable: %w", err)
	}

	rapport := &RapportZ{
		ReportType: "z",
		// ⚠️ generated_at entre dans le hash, et il faut LA valeur d'origine, pas
		// time.Now() — sinon deux réparations successives donneraient deux hash
		// différents pour des chiffres identiques.
		//
		// Elle se lit dans `full_report`, PAS dans la colonne `generated_at` : le
		// hash d'origine a été calculé sur un time.Time en heure LOCALE
		// (« 2026-01-07T19:09:28+01:00 »), tandis que la colonne stocke l'UTC
		// (« 2026-01-07 18:09:28.037Z »). Repartir de la colonne décalerait le
		// hash d'une heure et ferait passer pour modifiés des rapports intacts.
		GeneratedAt:  generatedAtDOrigine(rec),
		Number:       rec.GetString("number"),
		SequenceNum:  rec.GetInt("sequence_number"),
		PreviousHash: previousHash,
		CashRegister: CashRegisterInfo{
			ID:   caisse.Id,
			Code: caisse.GetString("code"),
			Name: caisse.GetString("name"),
		},
		Date:        rec.GetString("date"),
		FiscalYear:  rec.GetInt("fiscal_year"),
		Sessions:    agg.Sessions,
		DailyTotals: agg.DailyTotals,
		Note:        rec.GetString("note"),
		IsLocked:    true,
		ZReportId:   rec.Id,
	}

	hash, err := computeZReportHash(rapport)
	if err != nil {
		return nil, fmt.Errorf("calcul du hash: %w", err)
	}
	rapport.Hash = hash

	return rapport, nil
}

// ecrireRapport réécrit les colonnes calculées d'un rapport.
// N'y touchent PAS : number, date, fiscal_year, sequence_number, session_ids,
// generated_at, owner_company, cash_register — l'identité du document.
func ecrireRapport(app *pocketbase.PocketBase, rec *models.Record, r *RapportZ) error {
	t := r.DailyTotals

	rec.Set("sessions_count", t.SessionsCount)
	rec.Set("invoice_count", t.InvoiceCount)
	rec.Set("total_ht", t.TotalHT)
	rec.Set("total_tva", t.TotalTVA)
	rec.Set("total_ttc", t.TotalTTC)
	rec.Set("vat_breakdown", t.VATByRate)
	rec.Set("totals_by_method", t.ByMethod)
	rec.Set("total_cash_expected", t.TotalCashExpected)
	rec.Set("total_cash_counted", t.TotalCashCounted)
	rec.Set("total_cash_difference", t.TotalCashDifference)
	rec.Set("total_discounts", t.TotalDiscounts)
	rec.Set("credit_notes_count", t.CreditNotesCount)
	rec.Set("credit_notes_total", t.CreditNotesTotal)
	// Ticket Z-8 — les colonnes du contrat « un total, quatre lignes ». Sans
	// elles, le rejeu écrirait un hash qui SCELLE les collected_* dans des
	// colonnes restées vides : le rapport ne pourrait plus se vérifier lui-même.
	rec.Set("schema_version", t.SchemaVersion)
	rec.Set("collected_ttc", t.CollectedTTC)
	rec.Set("collected_by_method", t.CollectedByMethod)
	rec.Set("collected_from_receivables_ttc", t.CollectedFromReceivablesTTC)
	rec.Set("collected_deposits_ttc", t.CollectedDepositsTTC)
	rec.Set("refunds_ttc", t.RefundsTTC)
	rec.Set("hash", r.Hash)
	rec.Set("previous_hash", r.PreviousHash)

	complet, err := json.Marshal(r)
	if err != nil {
		return fmt.Errorf("sérialisation: %w", err)
	}
	rec.Set("full_report", string(complet))

	return app.Dao().SaveRecord(rec)
}

// generatedAtDOrigine rend l'horodatage de génération tel qu'il a servi au hash
// d'origine. Voir le commentaire de recalculerRapport : la colonne SQL a perdu le
// fuseau, le full_report l'a gardé.
func generatedAtDOrigine(rec *models.Record) time.Time {
	var enveloppe struct {
		GeneratedAt time.Time `json:"generated_at"`
	}
	brut := rec.GetString("full_report")
	if brut != "" {
		if err := json.Unmarshal([]byte(brut), &enveloppe); err == nil &&
			!enveloppe.GeneratedAt.IsZero() {
			return enveloppe.GeneratedAt
		}
	}
	return parsePocketBaseDate(rec.GetString("generated_at"))
}

// versionDeSchema lit la règle sous laquelle un rapport a été produit. Une
// colonne absente ou à zéro, c'est un rapport d'avant le contrat : version 1.
func versionDeSchema(rec *models.Record) int {
	if v := rec.GetInt("schema_version"); v > 0 {
		return v
	}
	return 1
}

// totauxDifferents compare les totaux recalculés à ceux que le rapport portait.
// Les maps sont sérialisées par encoding/json, qui trie les clés : la comparaison
// est donc stable.
func totauxDifferents(rec *models.Record, nouveau *RapportZ) bool {
	var ancien RapportZ
	brut := rec.GetString("full_report")
	if brut == "" {
		return true
	}
	if err := json.Unmarshal([]byte(brut), &ancien); err != nil {
		return true
	}

	a, err1 := json.Marshal(ancien.DailyTotals)
	b, err2 := json.Marshal(nouveau.DailyTotals)
	if err1 != nil || err2 != nil {
		return true
	}
	return string(a) != string(b)
}

// montantsDifferents ne compare que l'ARGENT : les totaux, les compteurs et les
// ventilations chiffrées. Il ignore les champs de structure ajoutés après coup,
// dont l'apparition n'est pas une correction comptable.
func montantsDifferents(rec *models.Record, nouveau *RapportZ) bool {
	var ancien RapportZ
	brut := rec.GetString("full_report")
	if brut == "" {
		return true
	}
	if err := json.Unmarshal([]byte(brut), &ancien); err != nil {
		return true
	}

	a, b := ancien.DailyTotals, nouveau.DailyTotals

	if a.InvoiceCount != b.InvoiceCount || a.SessionsCount != b.SessionsCount ||
		a.CreditNotesCount != b.CreditNotesCount {
		return true
	}
	for _, paire := range [][2]float64{
		{a.TotalHT, b.TotalHT}, {a.TotalTVA, b.TotalTVA}, {a.TotalTTC, b.TotalTTC},
		{a.CreditNotesTotal, b.CreditNotesTotal}, {a.TotalDiscounts, b.TotalDiscounts},
		{a.TotalCashExpected, b.TotalCashExpected},
		{a.TotalCashCounted, b.TotalCashCounted},
		{a.TotalCashDifference, b.TotalCashDifference},
	} {
		if math.Abs(paire[0]-paire[1]) > 0.005 {
			return true
		}
	}
	if montantsParCleDifferents(a.ByMethod, b.ByMethod) ||
		montantsParCleDifferents(a.RefundsByMethod, b.RefundsByMethod) {
		return true
	}
	if len(a.VATByRate) != len(b.VATByRate) {
		return true
	}
	for taux, da := range a.VATByRate {
		db, ok := b.VATByRate[taux]
		if !ok || math.Abs(da.BaseHT-db.BaseHT) > 0.005 ||
			math.Abs(da.VATAmount-db.VATAmount) > 0.005 {
			return true
		}
	}
	return false
}

func montantsParCleDifferents(a, b map[string]float64) bool {
	if len(a) != len(b) {
		return true
	}
	for k, va := range a {
		vb, ok := b[k]
		if !ok || math.Abs(va-vb) > 0.005 {
			return true
		}
	}
	return false
}
