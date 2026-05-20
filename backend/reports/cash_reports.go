// backend/reports/cash_reports.go
// 🔧 VERSION AMÉLIORÉE: TVA ventilée, hash NF525, protection doublons

package reports

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

// ============================================================================
// CONSTANTES
// ============================================================================

const (
	GENESIS_HASH_Z = "0000000000000000000000000000000000000000000000000000000000000000"
	NumberPadding  = 6
)

// ============================================================================
// HELPERS
// ============================================================================

func parsePocketBaseDate(dateStr string) time.Time {
	if dateStr == "" {
		return time.Time{}
	}

	formats := []string{
		"2006-01-02 15:04:05.000Z",
		"2006-01-02 15:04:05.000",
		"2006-01-02 15:04:05Z",
		"2006-01-02 15:04:05",
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05.000Z",
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05",
	}

	for _, format := range formats {
		if t, err := time.Parse(format, dateStr); err == nil {
			return t
		}
	}

	fmt.Printf("⚠️ Impossible de parser la date: %s\n", dateStr)
	return time.Time{}
}

func getUserName(app *pocketbase.PocketBase, userId string) string {
	if userId == "" {
		return ""
	}

	user, err := app.Dao().FindRecordById("users", userId)
	if err != nil {
		return userId
	}

	name := user.GetString("name")
	if name != "" {
		return name
	}

	email := user.GetString("email")
	if email != "" {
		return email
	}

	return userId
}

// ============================================================================
// STRUCTURES TVA
// ============================================================================

type VATDetail struct {
	Rate      float64 `json:"rate"`
	BaseHT    float64 `json:"base_ht"`
	VATAmount float64 `json:"vat_amount"`
	TotalTTC  float64 `json:"total_ttc"`
}

// ============================================================================
// RAPPORT X (inchangé, juste ajout TVA)
// ============================================================================

type RapportX struct {
	ReportType   string              `json:"report_type"`
	GeneratedAt  time.Time           `json:"generated_at"`
	Session      SessionInfo         `json:"session"`
	OpeningFloat float64             `json:"opening_float"`
	Sales        SalesSummaryX       `json:"sales"`
	Refunds      RefundsSummaryX     `json:"refunds"`
	Movements    MovementsSummaryX   `json:"movements"`
	ExpectedCash ExpectedCashSummary `json:"expected_cash"`
	Note         string              `json:"note"`
}

type SessionInfo struct {
	ID           string    `json:"id"`
	CashRegister string    `json:"cash_register"`
	OpenedAt     time.Time `json:"opened_at"`
	Status       string    `json:"status"`
}

type SalesSummaryX struct {
	InvoiceCount   int                             `json:"invoice_count"`
	TotalHT        float64                         `json:"total_ht"`
	TotalTVA       float64                         `json:"total_tva"`
	TotalTTC       float64                         `json:"total_ttc"`
	ByMethod       map[string]float64              `json:"by_method"`
	VATByRate      map[string]VATDetail            `json:"vat_by_rate"`
	NetByMethod    map[string]float64              `json:"net_by_method"`
	NetTTC         float64                         `json:"net_ttc"`
	ByCustomerType map[string]*CustomerTypeSummary `json:"by_customer_type"`
	DepositsCount  int                             `json:"deposits_count"`
	DepositsTTC    float64                         `json:"deposits_ttc"`
}

type MovementsSummary struct {
	CashIn   float64 `json:"cash_in"`
	CashOut  float64 `json:"cash_out"`
	SafeDrop float64 `json:"safe_drop"`
	Total    float64 `json:"total"`
}

type ExpectedCashSummary struct {
	OpeningFloat float64 `json:"opening_float"`
	SalesCash    float64 `json:"sales_cash"`
	Movements    float64 `json:"movements"`
	Total        float64 `json:"total"`
}

type RefundsSummaryX struct {
	CreditNotesCount int                `json:"credit_notes_count"`
	TotalTTC         float64            `json:"total_ttc"`
	ByMethod         map[string]float64 `json:"by_method"`
}

// CustomerTypeSummary ventile les ventes par type de client (e-reporting)
type CustomerTypeSummary struct {
	Count    int     `json:"count"`
	TotalHT  float64 `json:"total_ht"`
	TotalTVA float64 `json:"total_tva"`
	TotalTTC float64 `json:"total_ttc"`
}

// MovementDetail est un mouvement de caisse individuel (pour le journal ligne par ligne)
type MovementDetail struct {
	ID           string    `json:"id"`
	MovementType string    `json:"movement_type"`
	Amount       float64   `json:"amount"`
	Reason       string    `json:"reason"`
	CreatedAt    time.Time `json:"created_at"`
	RelatedDoc   string    `json:"related_doc,omitempty"`
	CreatedBy    string    `json:"created_by,omitempty"`
}

// MovementsSummaryX etend MovementsSummary avec le journal detaille
type MovementsSummaryX struct {
	CashIn   float64          `json:"cash_in"`
	CashOut  float64          `json:"cash_out"`
	SafeDrop float64          `json:"safe_drop"`
	Total    float64          `json:"total"`
	Details  []MovementDetail `json:"details"`
}

func GenerateRapportX(app *pocketbase.PocketBase, sessionID string) (*RapportX, error) {
	dao := app.Dao()

	session, err := dao.FindRecordById("cash_sessions", sessionID)
	if err != nil {
		return nil, fmt.Errorf("session introuvable: %w", err)
	}

	// Le X accepte les sessions ouvertes ET fermées (lecture à tout moment)
	sessionStatus := session.GetString("status")
	sessionOpenedAt := session.GetString("opened_at")

	// Borne de fin : closed_at si fermée, sinon maintenant
	sessionClosedAt := session.GetString("closed_at")
	endStr := sessionClosedAt
	if endStr == "" || sessionStatus == "open" {
		endStr = time.Now().UTC().Format("2006-01-02 15:04:05")
	}

	// ─── 1. Tickets POS de la session ───────────────────────────────────────────
	posInvoices, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("session = '%s' && is_pos_ticket = true && status != 'draft'", sessionID),
		"", 0, 0,
	)
	if err != nil {
		return nil, fmt.Errorf("erreur chargement tickets POS: %w", err)
	}

	// ─── 2. Factures B2B strictement dans la fenetre [opened_at, endStr] ─────────
	ownerCompany := ""
	if cashReg, err2 := dao.FindRecordById("cash_registers", session.GetString("cash_register")); err2 == nil {
		ownerCompany = cashReg.GetString("owner_company")
	}

	var b2bInvoices []*models.Record
	if ownerCompany != "" {
		// Factures et acomptes B2B encaisses dans la fenetre de session
		b2bFilter := fmt.Sprintf(
			"owner_company = '%s' && is_pos_ticket = false && is_paid = true && paid_at >= '%s' && paid_at <= '%s' && status != 'draft' && (invoice_type = 'invoice' || invoice_type = 'deposit') && original_invoice_id = ''",
			ownerCompany, sessionOpenedAt, endStr,
		)
		invoicesB2B, _ := dao.FindRecordsByFilter("invoices", b2bFilter, "paid_at", 0, 0)

		// Avoirs B2B emis dans la fenetre de session
		creditB2BFilter := fmt.Sprintf(
			"owner_company = '%s' && is_pos_ticket = false && invoice_type = 'credit_note' && created >= '%s' && created <= '%s' && status != 'draft'",
			ownerCompany, sessionOpenedAt, endStr,
		)
		creditsB2B, _ := dao.FindRecordsByFilter("invoices", creditB2BFilter, "created", 0, 0)

		b2bInvoices = append(invoicesB2B, creditsB2B...)
		fmt.Printf("Rapport X — B2B [%s → %s]: %d factures/acomptes, %d avoirs\n",
			sessionOpenedAt[:10], endStr[:10], len(invoicesB2B), len(creditsB2B))
	}

	// Fusionner POS + B2B
	allInvoices := append(posInvoices, b2bInvoices...)

	// --- SALES (invoices) ---
	var invoiceCount int
	var totalHT, totalTVA, totalTTC float64
	totalsByMethod := make(map[string]float64)
	vatByRate := make(map[string]VATDetail)
	var cashFromSales float64

	// --- REFUNDS (credit_notes) ---
	var creditNotesCount int
	var refundsTotalTTC float64
	refundsByMethod := make(map[string]float64)

	// Cache des customer_type pour eviter les requetes dupliquees
	customerTypeCache := make(map[string]string)
	getCustomerType := func(customerID string) string {
		if customerID == "" {
			return "individual"
		}
		if ct, ok := customerTypeCache[customerID]; ok {
			return ct
		}
		cust, err := dao.FindRecordById("customers", customerID)
		if err != nil || cust == nil {
			customerTypeCache[customerID] = "individual"
			return "individual"
		}
		ct := cust.GetString("customer_type")
		if ct == "" {
			ct = "individual"
		}
		customerTypeCache[customerID] = ct
		return ct
	}

	byCustomerType := make(map[string]*CustomerTypeSummary)
	ensureCustomerType := func(ct string) {
		if _, ok := byCustomerType[ct]; !ok {
			byCustomerType[ct] = &CustomerTypeSummary{}
		}
	}

	var depositsCount int
	var depositsTTC float64

	for _, inv := range allInvoices {
		invType := inv.GetString("invoice_type")
		ht := inv.GetFloat("total_ht")
		tva := inv.GetFloat("total_tva")
		ttc := inv.GetFloat("total_ttc")

		if invType == "credit_note" {
			creditNotesCount++
			amt := ttc
			if amt < 0 {
				amt = -amt
			}
			refundsTotalTTC += amt
			rm := inv.GetString("payment_method_label")
			if rm == "" {
				rm = inv.GetString("refund_method")
				if rm == "" {
					rm = "autre"
				}
			}
			refundsByMethod[rm] += amt
			continue
		}

		if invType != "" && invType != "invoice" && invType != "deposit" {
			continue
		}

		// Acomptes separes
		if invType == "deposit" {
			depositsCount++
			depositsTTC += ttc
		}

		invoiceCount++
		totalHT += ht
		totalTVA += tva
		totalTTC += ttc

		// Ventilation par customer_type
		custID := inv.GetString("customer")
		ct := getCustomerType(custID)
		// Tickets POS sans customer explicite → individual par defaut
		if inv.GetBool("is_pos_ticket") && custID == "" {
			ct = "individual"
		}
		ensureCustomerType(ct)
		byCustomerType[ct].Count++
		byCustomerType[ct].TotalHT += ht
		byCustomerType[ct].TotalTVA += tva
		byCustomerType[ct].TotalTTC += ttc

		method := inv.GetString("payment_method_label")
		if method == "" {
			method = inv.GetString("payment_method")
		}
		if method != "" {
			totalsByMethod[method] += ttc
			if method == "especes" {
				cashFromSales += ttc
			}
		}

		vatBreakdown := inv.Get("vat_breakdown")
		if isVATBreakdownValid(vatBreakdown) {
			aggregateVATBreakdown(vatBreakdown, vatByRate)
		} else {
			aggregateVATFromItems(inv.Get("items"), vatByRate)
		}
	}

	// Net by method = sales - refunds
	netByMethod := make(map[string]float64)
	for m, v := range totalsByMethod {
		netByMethod[m] = v
	}
	for m, r := range refundsByMethod {
		netByMethod[m] -= r
	}
	netTTC := roundAmount(totalTTC - refundsTotalTTC)

	// Arrondir byCustomerType
	for _, s := range byCustomerType {
		s.TotalHT = roundAmount(s.TotalHT)
		s.TotalTVA = roundAmount(s.TotalTVA)
		s.TotalTTC = roundAmount(s.TotalTTC)
	}

	// --- CASH MOVEMENTS (journal ligne par ligne) ---
	movements, err := dao.FindRecordsByFilter(
		"cash_movements",
		fmt.Sprintf("session = '%s'", sessionID),
		"created",
		0,
		0,
	)
	if err != nil {
		return nil, fmt.Errorf("erreur chargement mouvements: %w", err)
	}

	var cashIn, cashOut, safeDrop float64
	var movDetails []MovementDetail

	for _, mov := range movements {
		movType := mov.GetString("movement_type")
		amount := mov.GetFloat("amount")

		switch movType {
		case "cash_in":
			cashIn += amount
		case "cash_out":
			cashOut += amount
		case "refund_out":
			cashOut += amount
		case "safe_drop":
			safeDrop += amount
		}

		movDetails = append(movDetails, MovementDetail{
			ID:           mov.Id,
			MovementType: movType,
			Amount:       roundAmount(amount),
			Reason:       mov.GetString("reason"),
			CreatedAt:    parsePocketBaseDate(mov.GetString("created")),
			RelatedDoc:   mov.GetString("related_invoice"),
			CreatedBy:    mov.GetString("created_by"),
		})
	}

	movementsTotal := cashIn - cashOut - safeDrop
	openingFloat := session.GetFloat("opening_float")
	expectedCash := openingFloat + movementsTotal
	openedAt := parsePocketBaseDate(session.GetString("opened_at"))

	// Arrondi final
	totalHT = roundAmount(totalHT)
	totalTVA = roundAmount(totalTVA)
	totalTTC = roundAmount(totalTTC)
	refundsTotalTTC = roundAmount(refundsTotalTTC)
	cashIn = roundAmount(cashIn)
	cashOut = roundAmount(cashOut)
	safeDrop = roundAmount(safeDrop)
	movementsTotal = roundAmount(movementsTotal)
	expectedCash = roundAmount(expectedCash)
	cashFromSales = roundAmount(cashFromSales)
	openingFloat = roundAmount(openingFloat)
	depositsTTC = roundAmount(depositsTTC)

	for k, v := range totalsByMethod {
		totalsByMethod[k] = roundAmount(v)
	}
	for k, v := range refundsByMethod {
		refundsByMethod[k] = roundAmount(v)
	}
	for k, v := range netByMethod {
		netByMethod[k] = roundAmount(v)
	}
	for k, v := range vatByRate {
		v.BaseHT = roundAmount(v.BaseHT)
		v.VATAmount = roundAmount(v.VATAmount)
		v.TotalTTC = roundAmount(v.TotalTTC)
		vatByRate[k] = v
	}

	rapport := &RapportX{
		ReportType:  "x",
		GeneratedAt: time.Now(),
		Session: SessionInfo{
			ID:           session.Id,
			CashRegister: session.GetString("cash_register"),
			OpenedAt:     openedAt,
			Status:       sessionStatus,
		},
		OpeningFloat: openingFloat,
		Sales: SalesSummaryX{
			InvoiceCount:   invoiceCount,
			TotalHT:        totalHT,
			TotalTVA:       totalTVA,
			TotalTTC:       totalTTC,
			ByMethod:       totalsByMethod,
			VATByRate:      vatByRate,
			NetByMethod:    netByMethod,
			NetTTC:         netTTC,
			ByCustomerType: byCustomerType,
			DepositsCount:  depositsCount,
			DepositsTTC:    depositsTTC,
		},
		Refunds: RefundsSummaryX{
			CreditNotesCount: creditNotesCount,
			TotalTTC:         refundsTotalTTC,
			ByMethod:         refundsByMethod,
		},
		Movements: MovementsSummaryX{
			CashIn:   cashIn,
			CashOut:  cashOut,
			SafeDrop: safeDrop,
			Total:    movementsTotal,
			Details:  movDetails,
		},
		ExpectedCash: ExpectedCashSummary{
			OpeningFloat: openingFloat,
			SalesCash:    cashFromSales,
			Movements:    movementsTotal,
			Total:        expectedCash,
		},
		Note: "Lecture intermediaire - La caisse reste ouverte",
	}

	return rapport, nil
}

// abs helper (si tu ne l’as pas déjà dans ce fichier)
func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

// roundAmount arrondit proprement à 2 décimales pour éviter les .9999999998
func roundAmount(val float64) float64 {
	return math.Round(val*100) / 100
}

// ============================================================================
// loadB2BDocumentsForDay charge les factures B2B payées ET les avoirs B2B émis
// dans la journée. Ces documents n'ont PAS de session caisse.
//
// Factures/acomptes : filtrés par is_paid = true && paid_at dans la plage
// Avoirs B2B        : filtrés par date dans la plage (un avoir est émis, pas "payé")
// ============================================================================
func loadB2BInvoicesForDay(app *pocketbase.PocketBase, ownerCompany, dateStartStr, dateEndStr string) ([]*models.Record, error) {
	dao := app.Dao()

	// 1. Factures et acomptes B2B encaissés ce jour
	invoiceFilter := fmt.Sprintf(
		"owner_company = '%s' && is_pos_ticket = false && is_paid = true && paid_at >= '%s' && paid_at < '%s' && status != 'draft' && (invoice_type = 'invoice' || invoice_type = 'deposit') && original_invoice_id = ''",
		ownerCompany, dateStartStr, dateEndStr,
	)
	invoices, err := dao.FindRecordsByFilter("invoices", invoiceFilter, "paid_at", 0, 0)
	if err != nil {
		return nil, fmt.Errorf("erreur chargement factures B2B: %w", err)
	}

	// 2. Avoirs B2B émis ce jour (is_pos_ticket = false, invoice_type = credit_note)
	creditFilter := fmt.Sprintf(
		"owner_company = '%s' && is_pos_ticket = false && invoice_type = 'credit_note' && date >= '%s' && date < '%s' && status != 'draft'",
		ownerCompany, dateStartStr[:10], dateEndStr[:10],
	)
	credits, err := dao.FindRecordsByFilter("invoices", creditFilter, "date", 0, 0)
	if err != nil {
		// Non-fatal
		fmt.Printf("⚠️ Erreur chargement avoirs B2B (non-fatal): %v\n", err)
		credits = nil
	}

	all := append(invoices, credits...)
	fmt.Printf("💼 B2B jour %s: %d factures/acomptes encaissés, %d avoirs\n",
		dateStartStr[:10], len(invoices), len(credits))
	return all, nil
}

// aggregateInvoiceIntoTotals agrège une facture (POS ou B2B) dans les accumulateurs.
// Centralise la logique partagée entre le bloc session et le bloc B2B.
func aggregateInvoiceIntoTotals(
	inv *models.Record,
	totalHT, totalTVA, totalTTC *float64,
	totalsByMethod map[string]float64,
	globalVATByRate map[string]VATDetail,
	totalDiscounts *float64,
) {
	ht := inv.GetFloat("total_ht")
	tva := inv.GetFloat("total_tva")
	ttc := inv.GetFloat("total_ttc")

	*totalHT += ht
	*totalTVA += tva
	*totalTTC += ttc

	method := inv.GetString("payment_method_label")
	if method == "" {
		method = inv.GetString("payment_method")
	}
	if method != "" {
		totalsByMethod[method] += ttc
	}

	vatBreakdown := inv.Get("vat_breakdown")
	if isVATBreakdownValid(vatBreakdown) {
		aggregateVATBreakdown(vatBreakdown, globalVATByRate)
	} else {
		aggregateVATFromItems(inv.Get("items"), globalVATByRate)
	}

	cartDiscount := inv.GetFloat("cart_discount_ttc")
	lineDiscounts := inv.GetFloat("line_discounts_total_ttc")
	*totalDiscounts += cartDiscount + lineDiscounts
}

// ============================================================================
// RAPPORT Z - VERSION AMÉLIORÉE
// ============================================================================

type RapportZ struct {
	ReportType   string             `json:"report_type"`
	GeneratedAt  time.Time          `json:"generated_at"`
	Number       string             `json:"number"`          // 🆕 Z-2025-000001
	SequenceNum  int                `json:"sequence_number"` // 🆕
	Hash         string             `json:"hash"`            // 🆕
	PreviousHash string             `json:"previous_hash"`   // 🆕
	CashRegister CashRegisterInfo   `json:"cash_register"`
	Date         string             `json:"date"`
	FiscalYear   int                `json:"fiscal_year"` // 🆕
	Sessions     []SessionSummary   `json:"sessions"`
	DailyTotals  DailyTotalsSummary `json:"daily_totals"`
	Note         string             `json:"note"`
	IsLocked     bool               `json:"is_locked"`
	ZReportId    string             `json:"z_report_id"` // 🆕 ID en BDD
}

type CashRegisterInfo struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

type SessionSummary struct {
	ID                string               `json:"id"`
	OpenedAt          time.Time            `json:"opened_at"`
	ClosedAt          time.Time            `json:"closed_at"`
	OpenedBy          string               `json:"opened_by"`
	OpenedByName      string               `json:"opened_by_name"`
	ClosedBy          string               `json:"closed_by"`
	ClosedByName      string               `json:"closed_by_name"`
	InvoiceCount      int                  `json:"invoice_count"`
	TotalHT           float64              `json:"total_ht"`  // 🆕
	TotalTVA          float64              `json:"total_tva"` // 🆕
	TotalTTC          float64              `json:"total_ttc"`
	OpeningFloat      float64              `json:"opening_float"`
	ExpectedCashTotal float64              `json:"expected_cash_total"`
	CountedCashTotal  float64              `json:"counted_cash_total"`
	CashDifference    float64              `json:"cash_difference"`
	TotalsByMethod    map[string]float64   `json:"totals_by_method"`
	VATByRate         map[string]VATDetail `json:"vat_by_rate"` // 🆕
}

type DailyTotalsSummary struct {
	SessionsCount       int                             `json:"sessions_count"`
	InvoiceCount        int                             `json:"invoice_count"`
	TotalHT             float64                         `json:"total_ht"`
	TotalTVA            float64                         `json:"total_tva"`
	TotalTTC            float64                         `json:"total_ttc"`
	NetTTC              float64                         `json:"net_ttc"`
	ByMethod            map[string]float64              `json:"by_method"`
	VATByRate           map[string]VATDetail            `json:"vat_by_rate"`
	TotalCashExpected   float64                         `json:"total_cash_expected"`
	TotalCashCounted    float64                         `json:"total_cash_counted"`
	TotalCashDifference float64                         `json:"total_cash_difference"`
	TotalDiscounts      float64                         `json:"total_discounts"`
	CreditNotesCount    int                             `json:"credit_notes_count"`
	CreditNotesTotal    float64                         `json:"credit_notes_total"`
	RefundsByMethod     map[string]float64              `json:"refunds_by_method"`
	NetByMethod         map[string]float64              `json:"net_by_method"`
	ByCustomerType      map[string]*CustomerTypeSummary `json:"by_customer_type"`
}

// GenerateRapportZ génère ET sauvegarde un rapport Z
func GenerateRapportZ(app *pocketbase.PocketBase, cashRegisterID string, date string) (*RapportZ, error) {
	dao := app.Dao()

	// ═══════════════════════════════════════════════════════════════════════
	// 1. VÉRIFIER QU'UN RAPPORT Z N'EXISTE PAS DÉJÀ
	// ═══════════════════════════════════════════════════════════════════════

	existingFilter := fmt.Sprintf(
		"cash_register = '%s' && date ~ '%s'",
		cashRegisterID,
		date,
	)

	existingZ, _ := dao.FindFirstRecordByFilter("z_reports", existingFilter)
	if existingZ != nil {
		// Retourner le rapport existant au lieu de le régénérer
		fmt.Printf("📋 Rapport Z déjà existant pour cette date: %s\n", existingZ.GetString("number"))
		return loadExistingRapportZ(existingZ)
	}

	// ═══════════════════════════════════════════════════════════════════════
	// 2. CHARGER LA CAISSE
	// ═══════════════════════════════════════════════════════════════════════

	cashRegister, err := dao.FindRecordById("cash_registers", cashRegisterID)
	if err != nil {
		return nil, fmt.Errorf("caisse introuvable: %w", err)
	}

	ownerCompany := cashRegister.GetString("owner_company")

	// ═══════════════════════════════════════════════════════════════════════
	// 3. RÉCUPÉRER LES SESSIONS FERMÉES NON ENCORE UTILISÉES
	// ═══════════════════════════════════════════════════════════════════════

	dateStart, err := time.Parse("2006-01-02", date)
	if err != nil {
		return nil, fmt.Errorf("format de date invalide: %w", err)
	}
	dateEnd := dateStart.Add(24 * time.Hour)
	fiscalYear := dateStart.Year()

	dateStartStr := dateStart.Format("2006-01-02") + " 00:00:00"
	dateEndStr := dateEnd.Format("2006-01-02") + " 00:00:00"

	// 🔒 IMPORTANT: Ne prendre que les sessions sans z_report_id
	filter := fmt.Sprintf(
		"cash_register = '%s' && status = 'closed' && closed_at >= '%s' && closed_at < '%s' && (z_report_id = '' || z_report_id = null)",
		cashRegisterID,
		dateStartStr,
		dateEndStr,
	)

	fmt.Printf("\n🔍 Rapport Z - Filtre: %s\n", filter)

	sessions, err := dao.FindRecordsByFilter(
		"cash_sessions",
		filter,
		"closed_at",
		0,
		0,
	)

	if err != nil {
		fmt.Printf("❌ Erreur requête: %v\n", err)
		return nil, fmt.Errorf("erreur chargement sessions: %w", err)
	}

	fmt.Printf("✅ Sessions disponibles: %d\n", len(sessions))

	if len(sessions) == 0 {
		return nil, fmt.Errorf("aucune session fermée disponible pour cette date (déjà incluses dans un rapport Z précédent ?)")
	}

	// ═══════════════════════════════════════════════════════════════════════
	// 4. AGRÉGER LES DONNÉES
	// ═══════════════════════════════════════════════════════════════════════

	var sessionsSummaries []SessionSummary
	var sessionIds []string
	var totalInvoiceCount int
	var totalHT, totalTVA, totalTTC float64
	var totalCashExpected, totalCashCounted, totalCashDifference float64
	var totalDiscounts float64
	var creditNotesCount int
	var creditNotesTotal float64
	totalsByMethod := make(map[string]float64)
	refundsByMethod := make(map[string]float64)
	globalVATByRate := make(map[string]VATDetail)

	// Cache customer_type pour la ventilation e-reporting (Z)
	customerTypeCacheZ := make(map[string]string)
	getCustomerTypeZ := func(customerID string) string {
		if customerID == "" {
			return "individual"
		}
		if ct, ok := customerTypeCacheZ[customerID]; ok {
			return ct
		}
		cust, err := dao.FindRecordById("customers", customerID)
		if err != nil || cust == nil {
			customerTypeCacheZ[customerID] = "individual"
			return "individual"
		}
		ct := cust.GetString("customer_type")
		if ct == "" {
			ct = "individual"
		}
		customerTypeCacheZ[customerID] = ct
		return ct
	}
	globalByCustomerType := make(map[string]*CustomerTypeSummary)
	ensureGlobalCustomerType := func(ct string) {
		if _, ok := globalByCustomerType[ct]; !ok {
			globalByCustomerType[ct] = &CustomerTypeSummary{}
		}
	}

	for _, session := range sessions {
		sessionId := session.Id
		sessionIds = append(sessionIds, sessionId)
		openingFloat := session.GetFloat("opening_float")
		countedCash := session.GetFloat("counted_cash_total")

		openedById := session.GetString("opened_by")
		closedById := session.GetString("closed_by")
		openedByName := getUserName(app, openedById)
		closedByName := getUserName(app, closedById)

		// ─────────────────────────────────────────────────────────────────
		// Charger les factures de la session
		// ─────────────────────────────────────────────────────────────────

		invoices, err := dao.FindRecordsByFilter(
			"invoices",
			fmt.Sprintf("session = '%s' && is_pos_ticket = true && status != 'draft'", sessionId),
			"",
			0,
			0,
		)

		var invoiceCount int
		var sessionHT, sessionTVA, sessionTTC float64
		var cashFromSales float64
		sessionMethodTotals := make(map[string]float64)
		sessionRefundsByMethod := make(map[string]float64)
		sessionVATByRate := make(map[string]VATDetail)

		if err == nil {
			for _, inv := range invoices {
				invType := inv.GetString("invoice_type")

				// Comptabiliser les avoirs séparément
				if invType == "credit_note" {
					creditNotesCount++

					// ✅ on stocke en positif (pour affichage + agrégats)
					amt := inv.GetFloat("total_ttc")
					if amt < 0 {
						amt = -amt
					}
					creditNotesTotal += amt

					// ✅ remboursements par mode
					rm := inv.GetString("refund_method")
					if rm == "" {
						rm = "autre"
					}
					sessionRefundsByMethod[rm] += amt
					refundsByMethod[rm] += amt

					continue
				}

				invoiceCount++
				ht := inv.GetFloat("total_ht")
				tva := inv.GetFloat("total_tva")
				ttc := inv.GetFloat("total_ttc")

				sessionHT += ht
				sessionTVA += tva
				sessionTTC += ttc

				// Agréger la TVA pour le détail de session uniquement
				vatBreakdown := inv.Get("vat_breakdown")
				if isVATBreakdownValid(vatBreakdown) {
					aggregateVATBreakdown(vatBreakdown, sessionVATByRate)
				} else {
					aggregateVATFromItems(inv.Get("items"), sessionVATByRate)
				}

				method := inv.GetString("payment_method_label")
				if method == "" {
					method = inv.GetString("payment_method")
				}
				if method != "" {
					sessionMethodTotals[method] += ttc
					if method == "especes" {
						cashFromSales += ttc
					}
				}

				// Déléguer l'agrégation globale (totaux, VAT global, remises, moyens)
				aggregateInvoiceIntoTotals(
					inv,
					&totalHT, &totalTVA, &totalTTC,
					totalsByMethod,
					globalVATByRate,
					&totalDiscounts,
				)

				// Ventilation par customer_type (e-reporting)
				// Tickets POS : customer peut etre vide → individual par defaut
				ctZ := "individual"
				if custID := inv.GetString("customer"); custID != "" {
					ctZ = getCustomerTypeZ(custID)
				}
				ensureGlobalCustomerType(ctZ)
				globalByCustomerType[ctZ].Count++
				globalByCustomerType[ctZ].TotalHT += inv.GetFloat("total_ht")
				globalByCustomerType[ctZ].TotalTVA += inv.GetFloat("total_tva")
				globalByCustomerType[ctZ].TotalTTC += inv.GetFloat("total_ttc")
			}
		}

		// ─────────────────────────────────────────────────────────────────
		// Mouvements de caisse
		// ─────────────────────────────────────────────────────────────────

		movements, _ := dao.FindRecordsByFilter(
			"cash_movements",
			fmt.Sprintf("session = '%s'", sessionId),
			"",
			0,
			0,
		)

		var movementsTotal float64
		for _, mov := range movements {
			movType := mov.GetString("movement_type")
			amount := mov.GetFloat("amount")

			switch movType {
			case "cash_in":
				movementsTotal += amount
			case "cash_out", "safe_drop":
				movementsTotal -= amount
			case "adjustment":
				movementsTotal += amount
			}
		}

		// ─────────────────────────────────────────────────────────────────
		// Calcul des espèces
		// ─────────────────────────────────────────────────────────────────

		expectedCash := openingFloat + movementsTotal
		cashDiff := countedCash - expectedCash

		if countedCash == 0 {
			countedCash = expectedCash
			cashDiff = 0
		}

		totalInvoiceCount += invoiceCount
		totalHT += sessionHT
		totalTVA += sessionTVA
		totalTTC += sessionTTC
		totalCashExpected += expectedCash
		totalCashCounted += countedCash
		totalCashDifference += cashDiff

		openedAt := parsePocketBaseDate(session.GetString("opened_at"))
		closedAt := parsePocketBaseDate(session.GetString("closed_at"))

		// ✅ FIX: Arrondir les montants de session à 2 décimales
		sessionHT = roundAmount(sessionHT)
		sessionTVA = roundAmount(sessionTVA)
		sessionTTC = roundAmount(sessionTTC)
		expectedCash = roundAmount(expectedCash)
		countedCash = roundAmount(countedCash)
		cashDiff = roundAmount(cashDiff)
		openingFloat = roundAmount(openingFloat)

		// Arrondir les montants dans les maps de session
		for k, v := range sessionMethodTotals {
			sessionMethodTotals[k] = roundAmount(v)
		}
		for k, v := range sessionRefundsByMethod {
			sessionRefundsByMethod[k] = roundAmount(v)
		}
		for k, v := range sessionVATByRate {
			v.BaseHT = roundAmount(v.BaseHT)
			v.VATAmount = roundAmount(v.VATAmount)
			v.TotalTTC = roundAmount(v.TotalTTC)
			sessionVATByRate[k] = v
		}

		sessionsSummaries = append(sessionsSummaries, SessionSummary{
			ID:                session.Id,
			OpenedAt:          openedAt,
			ClosedAt:          closedAt,
			OpenedBy:          openedById,
			OpenedByName:      openedByName,
			ClosedBy:          closedById,
			ClosedByName:      closedByName,
			InvoiceCount:      invoiceCount,
			TotalHT:           sessionHT,
			TotalTVA:          sessionTVA,
			TotalTTC:          sessionTTC,
			OpeningFloat:      openingFloat,
			ExpectedCashTotal: expectedCash,
			CountedCashTotal:  countedCash,
			CashDifference:    cashDiff,
			TotalsByMethod:    sessionMethodTotals,
			VATByRate:         sessionVATByRate,
		})

		fmt.Printf("📊 Session %s: %d tickets, %.2f € HT, %.2f € TVA, %.2f € TTC\n",
			sessionId, invoiceCount, sessionHT, sessionTVA, sessionTTC)
	}

	// ═══════════════════════════════════════════════════════════════════════
	// 4b. AGRÉGER LES FACTURES B2B PAYÉES CE JOUR
	// Ces factures ne sont pas liées à une session caisse.
	// Elles contribuent uniquement aux totaux journaliers (DailyTotals).
	// ═══════════════════════════════════════════════════════════════════════

	b2bInvoices, err := loadB2BInvoicesForDay(app, ownerCompany, dateStartStr, dateEndStr)
	if err != nil {
		// Non-fatal : on logue mais on ne bloque pas la génération du Z
		fmt.Printf("⚠️ Erreur chargement factures B2B (non-fatal): %v\n", err)
		b2bInvoices = nil
	}

	var b2bInvoiceCount int
	var b2bCreditNotesCount int
	var b2bCreditNotesTotal float64

	for _, inv := range b2bInvoices {
		invType := inv.GetString("invoice_type")

		// Avoirs B2B : montant négatif → déduire des totaux
		if invType == "credit_note" {
			b2bCreditNotesCount++
			amt := inv.GetFloat("total_ttc") // négatif en BDD
			if amt < 0 {
				amt = -amt // stocker en positif pour l'affichage
			}
			b2bCreditNotesTotal += amt

			// Moyen de remboursement
			rm := inv.GetString("refund_method")
			if rm == "" {
				rm = inv.GetString("payment_method")
			}
			if rm == "" {
				rm = "autre"
			}
			refundsByMethod[rm] += amt
			continue
		}

		b2bInvoiceCount++
		aggregateInvoiceIntoTotals(
			inv,
			&totalHT, &totalTVA, &totalTTC,
			totalsByMethod,
			globalVATByRate,
			&totalDiscounts,
		)

		// Ventilation customer_type (e-reporting) pour les B2B
		ctB2B := getCustomerTypeZ(inv.GetString("customer"))
		ensureGlobalCustomerType(ctB2B)
		globalByCustomerType[ctB2B].Count++
		globalByCustomerType[ctB2B].TotalHT += inv.GetFloat("total_ht")
		globalByCustomerType[ctB2B].TotalTVA += inv.GetFloat("total_tva")
		globalByCustomerType[ctB2B].TotalTTC += inv.GetFloat("total_ttc")
	}

	// Fusionner dans les compteurs globaux
	totalInvoiceCount += b2bInvoiceCount
	creditNotesCount += b2bCreditNotesCount
	creditNotesTotal += b2bCreditNotesTotal

	fmt.Printf("💼 B2B agrégé: %d factures payées, HT/TVA/TTC mis à jour\n", b2bInvoiceCount)

	// 🔍 DEBUG: Afficher la TVA agrégée
	fmt.Printf("🧾 TVA agrégée globalVATByRate: %+v\n", globalVATByRate)
	for rate, detail := range globalVATByRate {
		fmt.Printf("   - Taux %s%%: Base HT=%.2f€, TVA=%.2f€, TTC=%.2f€\n",
			rate, detail.BaseHT, detail.VATAmount, detail.TotalTTC)
	}

	// Arrondir globalByCustomerType
	for _, s := range globalByCustomerType {
		s.TotalHT = roundAmount(s.TotalHT)
		s.TotalTVA = roundAmount(s.TotalTVA)
		s.TotalTTC = roundAmount(s.TotalTTC)
	}

	// ═══════════════════════════════════════════════════════════════════════
	// 5. GÉNÉRER LE NUMÉRO SÉQUENTIEL
	// ═══════════════════════════════════════════════════════════════════════

	sequenceNumber, previousHash, err := getNextZSequence(app, ownerCompany, fiscalYear)
	if err != nil {
		return nil, fmt.Errorf("erreur génération séquence: %w", err)
	}

	zNumber := fmt.Sprintf("Z-%d-%0*d", fiscalYear, NumberPadding, sequenceNumber)

	// ═══════════════════════════════════════════════════════════════════════
	// 6. CONSTRUIRE LE RAPPORT
	// ═══════════════════════════════════════════════════════════════════════

	// ✅ FIX: Arrondir tous les montants à 2 décimales
	totalHT = roundAmount(totalHT)
	totalTVA = roundAmount(totalTVA)
	totalTTC = roundAmount(totalTTC)
	totalCashExpected = roundAmount(totalCashExpected)
	totalCashCounted = roundAmount(totalCashCounted)
	totalCashDifference = roundAmount(totalCashDifference)
	totalDiscounts = roundAmount(totalDiscounts)
	creditNotesTotal = roundAmount(creditNotesTotal)

	// Arrondir les montants dans les maps
	for k, v := range totalsByMethod {
		totalsByMethod[k] = roundAmount(v)
	}
	for k, v := range refundsByMethod {
		refundsByMethod[k] = roundAmount(v)
	}
	for k, v := range globalVATByRate {
		v.BaseHT = roundAmount(v.BaseHT)
		v.VATAmount = roundAmount(v.VATAmount)
		v.TotalTTC = roundAmount(v.TotalTTC)
		globalVATByRate[k] = v
	}

	rapport := &RapportZ{
		ReportType:   "z",
		GeneratedAt:  time.Now(),
		Number:       zNumber,
		SequenceNum:  sequenceNumber,
		PreviousHash: previousHash,
		CashRegister: CashRegisterInfo{
			ID:   cashRegister.Id,
			Code: cashRegister.GetString("code"),
			Name: cashRegister.GetString("name"),
		},
		Date:       date,
		FiscalYear: fiscalYear,
		Sessions:   sessionsSummaries,
		DailyTotals: DailyTotalsSummary{
			SessionsCount:       len(sessions),
			InvoiceCount:        totalInvoiceCount,
			TotalHT:             totalHT,
			TotalTVA:            totalTVA,
			TotalTTC:            totalTTC,
			NetTTC:              roundAmount(totalTTC - creditNotesTotal),
			ByMethod:            totalsByMethod,
			VATByRate:           globalVATByRate,
			TotalCashExpected:   totalCashExpected,
			TotalCashCounted:    totalCashCounted,
			TotalCashDifference: totalCashDifference,
			TotalDiscounts:      totalDiscounts,
			CreditNotesCount:    creditNotesCount,
			CreditNotesTotal:    creditNotesTotal,
			RefundsByMethod:     refundsByMethod,
			ByCustomerType:      globalByCustomerType,
		},
		Note:     "Rapport Z - Document inaltérable",
		IsLocked: true,
	}

	// ═══════════════════════════════════════════════════════════════════════
	// 7. CALCULER LE HASH
	// ═══════════════════════════════════════════════════════════════════════

	hash, err := computeZReportHash(rapport)
	if err != nil {
		return nil, fmt.Errorf("erreur calcul hash: %w", err)
	}
	rapport.Hash = hash

	// ═══════════════════════════════════════════════════════════════════════
	// 8. SAUVEGARDER EN BASE DE DONNÉES
	// ═══════════════════════════════════════════════════════════════════════

	zReportId, err := saveZReport(app, rapport, ownerCompany, sessionIds)
	if err != nil {
		return nil, fmt.Errorf("erreur sauvegarde rapport Z: %w", err)
	}
	rapport.ZReportId = zReportId

	// ═══════════════════════════════════════════════════════════════════════
	// 9. MARQUER LES SESSIONS COMME UTILISÉES
	// ═══════════════════════════════════════════════════════════════════════

	for _, session := range sessions {
		session.Set("z_report_id", zReportId)
		if err := dao.SaveRecord(session); err != nil {
			fmt.Printf("⚠️ Erreur marquage session %s: %v\n", session.Id, err)
		}
	}

	fmt.Printf("\n✅ Rapport Z %s généré et sauvegardé: %d sessions, %d tickets, %.2f € TTC\n",
		zNumber, len(sessions), totalInvoiceCount, totalTTC)

	return rapport, nil
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

// aggregateVATBreakdown agrège la TVA depuis le champ vat_breakdown d'une facture
func aggregateVATBreakdown(vatData interface{}, target map[string]VATDetail) {
	if vatData == nil {
		return
	}

	// Le vat_breakdown peut être un array ou un map
	switch v := vatData.(type) {
	case []interface{}:
		for _, item := range v {
			if m, ok := item.(map[string]interface{}); ok {
				rate := getFloatFromMap(m, "rate")
				baseHT := getFloatFromMap(m, "base_ht")
				vatAmount := getFloatFromMap(m, "vat_amount")

				rateKey := fmt.Sprintf("%.1f", rate)
				existing := target[rateKey]
				existing.Rate = rate
				existing.BaseHT += baseHT
				existing.VATAmount += vatAmount
				existing.TotalTTC += baseHT + vatAmount
				target[rateKey] = existing
			}
		}
	case map[string]interface{}:
		for rateKey, item := range v {
			if m, ok := item.(map[string]interface{}); ok {
				rate := getFloatFromMap(m, "rate")
				baseHT := getFloatFromMap(m, "base_ht")
				vatAmount := getFloatFromMap(m, "vat_amount")

				existing := target[rateKey]
				existing.Rate = rate
				existing.BaseHT += baseHT
				existing.VATAmount += vatAmount
				existing.TotalTTC += baseHT + vatAmount
				target[rateKey] = existing
			}
		}
	}
}

// 🆕 aggregateVATFromItems calcule la TVA depuis le champ items d'une facture
// Utilisé quand vat_breakdown est null
func aggregateVATFromItems(itemsData interface{}, target map[string]VATDetail) {
	if itemsData == nil {
		fmt.Printf("⚠️ aggregateVATFromItems: itemsData est nil\n")
		return
	}

	var items []interface{}

	// Le champ items peut être différents types selon PocketBase
	switch v := itemsData.(type) {
	case string:
		// Parser la string JSON
		if v == "" || v == "null" || v == "[]" {
			fmt.Printf("⚠️ aggregateVATFromItems: items string vide\n")
			return
		}
		if err := json.Unmarshal([]byte(v), &items); err != nil {
			fmt.Printf("⚠️ Erreur parsing items JSON string: %v\n", err)
			return
		}
		fmt.Printf("✅ aggregateVATFromItems: Parsé %d items depuis string JSON\n", len(items))
	case []interface{}:
		items = v
		fmt.Printf("✅ aggregateVATFromItems: Reçu %d items comme []interface{}\n", len(items))
	case []byte:
		// types.JsonRaw est un alias de []byte
		if len(v) == 0 {
			return
		}
		if err := json.Unmarshal(v, &items); err != nil {
			fmt.Printf("⚠️ Erreur parsing items []byte: %v\n", err)
			return
		}
		fmt.Printf("✅ aggregateVATFromItems: Parsé %d items depuis []byte\n", len(items))
	default:
		// Essayer de convertir en []byte via Stringer ou directement
		// types.JsonRaw implémente peut-être une interface
		if raw, ok := itemsData.(json.RawMessage); ok {
			if err := json.Unmarshal(raw, &items); err != nil {
				fmt.Printf("⚠️ Erreur parsing items RawMessage: %v\n", err)
				return
			}
			fmt.Printf("✅ aggregateVATFromItems: Parsé %d items depuis RawMessage\n", len(items))
		} else {
			// Dernier recours: convertir en string via fmt
			strVal := fmt.Sprintf("%s", itemsData)
			if strVal == "" || strVal == "null" || strVal == "[]" {
				return
			}
			if err := json.Unmarshal([]byte(strVal), &items); err != nil {
				fmt.Printf("⚠️ Erreur parsing items via fmt: %v (type original: %T)\n", err, itemsData)
				return
			}
			fmt.Printf("✅ aggregateVATFromItems: Parsé %d items via fmt.Sprintf\n", len(items))
		}
	}

	for _, item := range items {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		// Extraire les données de l'item
		tvaRate := getFloatFromMap(m, "tva_rate")
		totalHT := getFloatFromMap(m, "total_ht")
		totalTTC := getFloatFromMap(m, "total_ttc")

		// Si pas de tva_rate, essayer vat_rate
		if tvaRate == 0 {
			tvaRate = getFloatFromMap(m, "vat_rate")
		}

		// Calculer le montant de TVA
		vatAmount := totalTTC - totalHT

		// Clé du taux (ex: "20.0", "5.5")
		rateKey := fmt.Sprintf("%.1f", tvaRate)

		// Agréger
		existing := target[rateKey]
		existing.Rate = tvaRate
		existing.BaseHT += totalHT
		existing.VATAmount += vatAmount
		existing.TotalTTC += totalTTC
		target[rateKey] = existing
	}
}

// isVATBreakdownValid vérifie si vat_breakdown contient des données exploitables
func isVATBreakdownValid(vatData interface{}) bool {
	if vatData == nil {
		return false
	}

	switch v := vatData.(type) {
	case string:
		// Vérifier si c'est une string vide ou un JSON vide
		trimmed := strings.TrimSpace(v)
		if trimmed == "" || trimmed == "null" || trimmed == "{}" || trimmed == "[]" {
			return false
		}
		return true
	case map[string]interface{}:
		// Map vide = pas valide
		return len(v) > 0
	case []interface{}:
		// Array vide = pas valide
		return len(v) > 0
	default:
		return false
	}
}

func getFloatFromMap(m map[string]interface{}, key string) float64 {
	if val, ok := m[key]; ok {
		switch v := val.(type) {
		case float64:
			return v
		case int:
			return float64(v)
		case int64:
			return float64(v)
		}
	}
	return 0
}

// getNextZSequence récupère le prochain numéro de séquence pour les rapports Z
func getNextZSequence(app *pocketbase.PocketBase, ownerCompany string, fiscalYear int) (int, string, error) {
	dao := app.Dao()

	filter := fmt.Sprintf(
		"owner_company = '%s' && fiscal_year = %d",
		ownerCompany,
		fiscalYear,
	)

	// Utiliser FindRecordsByFilter avec tri et limite de 1
	records, err := dao.FindRecordsByFilter(
		"z_reports",
		filter,
		"-sequence_number", // Tri décroissant
		1,                  // Limite à 1 résultat
		0,                  // Offset 0
	)

	if err != nil || len(records) == 0 {
		return 1, GENESIS_HASH_Z, nil
	}

	lastZ := records[0]
	return lastZ.GetInt("sequence_number") + 1, lastZ.GetString("hash"), nil
}

// computeZReportHash calcule le hash SHA-256 du rapport Z
func computeZReportHash(rapport *RapportZ) (string, error) {
	data := map[string]interface{}{
		"number":          rapport.Number,
		"date":            rapport.Date,
		"fiscal_year":     rapport.FiscalYear,
		"cash_register":   rapport.CashRegister.ID,
		"sessions_count":  rapport.DailyTotals.SessionsCount,
		"invoice_count":   rapport.DailyTotals.InvoiceCount,
		"total_ht":        rapport.DailyTotals.TotalHT,
		"total_tva":       rapport.DailyTotals.TotalTVA,
		"total_ttc":       rapport.DailyTotals.TotalTTC,
		"vat_by_rate":     rapport.DailyTotals.VATByRate,
		"by_method":       rapport.DailyTotals.ByMethod,
		"previous_hash":   rapport.PreviousHash,
		"sequence_number": rapport.SequenceNum,
		"generated_at":    rapport.GeneratedAt.Format(time.RFC3339),
	}

	// Tri des clés pour un hash déterministe
	keys := make([]string, 0, len(data))
	for k := range data {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var builder strings.Builder
	builder.WriteString("{")

	for i, k := range keys {
		if i > 0 {
			builder.WriteString(",")
		}

		keyJSON, _ := json.Marshal(k)
		valueJSON, _ := json.Marshal(data[k])

		builder.Write(keyJSON)
		builder.WriteString(":")
		builder.Write(valueJSON)
	}

	builder.WriteString("}")

	hash := sha256.Sum256([]byte(builder.String()))
	return hex.EncodeToString(hash[:]), nil
}

// saveZReport sauvegarde le rapport Z en base de données
func saveZReport(app *pocketbase.PocketBase, rapport *RapportZ, ownerCompany string, sessionIds []string) (string, error) {
	dao := app.Dao()

	collection, err := dao.FindCollectionByNameOrId("z_reports")
	if err != nil {
		return "", fmt.Errorf("collection z_reports introuvable: %w", err)
	}

	record := models.NewRecord(collection)

	record.Set("number", rapport.Number)
	record.Set("owner_company", ownerCompany)
	record.Set("cash_register", rapport.CashRegister.ID)
	record.Set("date", rapport.Date)
	record.Set("fiscal_year", rapport.FiscalYear)
	record.Set("sequence_number", rapport.SequenceNum)
	record.Set("session_ids", sessionIds)
	record.Set("sessions_count", rapport.DailyTotals.SessionsCount)
	record.Set("invoice_count", rapport.DailyTotals.InvoiceCount)
	record.Set("total_ht", rapport.DailyTotals.TotalHT)
	record.Set("total_tva", rapport.DailyTotals.TotalTVA)
	record.Set("total_ttc", rapport.DailyTotals.TotalTTC)
	record.Set("vat_breakdown", rapport.DailyTotals.VATByRate)
	record.Set("totals_by_method", rapport.DailyTotals.ByMethod)
	record.Set("total_cash_expected", rapport.DailyTotals.TotalCashExpected)
	record.Set("total_cash_counted", rapport.DailyTotals.TotalCashCounted)
	record.Set("total_cash_difference", rapport.DailyTotals.TotalCashDifference)
	record.Set("total_discounts", rapport.DailyTotals.TotalDiscounts)
	record.Set("credit_notes_count", rapport.DailyTotals.CreditNotesCount)
	record.Set("credit_notes_total", rapport.DailyTotals.CreditNotesTotal)
	record.Set("hash", rapport.Hash)
	record.Set("previous_hash", rapport.PreviousHash)
	record.Set("generated_at", rapport.GeneratedAt)
	record.Set("note", rapport.Note)

	// Sauvegarder le rapport complet en JSON
	fullReportJSON, _ := json.Marshal(rapport)
	record.Set("full_report", string(fullReportJSON))

	if err := dao.SaveRecord(record); err != nil {
		return "", err
	}

	return record.Id, nil
}

// loadExistingRapportZ charge un rapport Z existant depuis la BDD
func loadExistingRapportZ(record *models.Record) (*RapportZ, error) {
	fullReportStr := record.GetString("full_report")
	if fullReportStr == "" {
		return nil, fmt.Errorf("rapport Z corrompu: full_report vide")
	}

	var rapport RapportZ
	if err := json.Unmarshal([]byte(fullReportStr), &rapport); err != nil {
		return nil, fmt.Errorf("erreur parsing rapport Z: %w", err)
	}

	rapport.ZReportId = record.Id
	return &rapport, nil
}

// ============================================================================
// ROUTE POUR LISTER LES RAPPORTS Z
// ============================================================================

type ZReportListItem struct {
	ID            string    `json:"id"`
	Number        string    `json:"number"`
	Date          string    `json:"date"`
	TotalTTC      float64   `json:"total_ttc"`
	InvoiceCount  int       `json:"invoice_count"`
	SessionsCount int       `json:"sessions_count"`
	GeneratedAt   time.Time `json:"generated_at"`
}

func ListZReports(app *pocketbase.PocketBase, cashRegisterID string, limit int) ([]ZReportListItem, error) {
	dao := app.Dao()

	filter := fmt.Sprintf("cash_register = '%s'", cashRegisterID)

	records, err := dao.FindRecordsByFilter(
		"z_reports",
		filter,
		"-date",
		limit,
		0,
	)

	if err != nil {
		return nil, err
	}

	var items []ZReportListItem
	for _, r := range records {
		items = append(items, ZReportListItem{
			ID:            r.Id,
			Number:        r.GetString("number"),
			Date:          r.GetString("date"),
			TotalTTC:      r.GetFloat("total_ttc"),
			InvoiceCount:  r.GetInt("invoice_count"),
			SessionsCount: r.GetInt("sessions_count"),
			GeneratedAt:   parsePocketBaseDate(r.GetString("generated_at")),
		})
	}

	return items, nil
}

func getMetaMap(rec *models.Record) map[string]any {
	raw := rec.Get("meta")
	if raw == nil {
		return nil
	}
	if m, ok := raw.(map[string]any); ok {
		return m
	}
	return nil
}

func isCashInFromSale(mov *models.Record) bool {
	meta := getMetaMap(mov)
	if meta == nil {
		return false
	}
	// ✅ Ton cas: meta.invoice_id / meta.invoice_number
	if v, ok := meta["invoice_id"].(string); ok && v != "" {
		return true
	}
	if v, ok := meta["invoice_number"].(string); ok && v != "" {
		return true
	}
	return false
}
