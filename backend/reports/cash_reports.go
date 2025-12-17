// Fichier: backend/reports/cash_reports.go

package reports

import (
	"fmt"
	"time"

	"github.com/pocketbase/pocketbase"
)

type RapportX struct {
	ReportType   string              `json:"report_type"`
	GeneratedAt  time.Time           `json:"generated_at"`
	Session      SessionInfo         `json:"session"`
	OpeningFloat float64             `json:"opening_float"`
	Sales        SalesSummary        `json:"sales"`
	Movements    MovementsSummary    `json:"movements"`
	ExpectedCash ExpectedCashSummary `json:"expected_cash"`
	Note         string              `json:"note"`
}

type SessionInfo struct {
	ID           string    `json:"id"`
	CashRegister string    `json:"cash_register"`
	OpenedAt     time.Time `json:"opened_at"`
	Status       string    `json:"status"`
}

type SalesSummary struct {
	InvoiceCount int                `json:"invoice_count"`
	TotalTTC     float64            `json:"total_ttc"`
	ByMethod     map[string]float64 `json:"by_method"`
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

func GenerateRapportX(app *pocketbase.PocketBase, sessionID string) (*RapportX, error) {
	dao := app.Dao()

	// 1. Charger la session
	session, err := dao.FindRecordById("cash_sessions", sessionID)
	if err != nil {
		return nil, fmt.Errorf("session introuvable: %w", err)
	}

	if session.GetString("status") != "open" {
		return nil, fmt.Errorf("le rapport X est uniquement pour les sessions ouvertes")
	}

	// 2. Récupérer les factures de la session
	invoices, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("session = '%s' && is_pos_ticket = true && status != 'draft'", sessionID),
		"",
		0,
		0,
	)
	if err != nil {
		return nil, fmt.Errorf("erreur chargement factures: %w", err)
	}

	// 3. Calculer les totaux
	var invoiceCount int
	var totalTTC float64
	totalsByMethod := make(map[string]float64)
	var cashFromSales float64

	for _, inv := range invoices {
		invoiceCount++
		ttc := inv.GetFloat("total_ttc")
		totalTTC += ttc

		method := inv.GetString("payment_method")
		if method != "" {
			totalsByMethod[method] += ttc
			if method == "especes" {
				cashFromSales += ttc
			}
		}
	}

	// 4. Récupérer les mouvements de caisse
	movements, err := dao.FindRecordsByFilter(
		"cash_movements",
		fmt.Sprintf("session = '%s'", sessionID),
		"",
		0,
		0,
	)
	if err != nil {
		return nil, fmt.Errorf("erreur chargement mouvements: %w", err)
	}

	var cashIn, cashOut, safeDrop float64
	for _, mov := range movements {
		movType := mov.GetString("movement_type")
		amount := mov.GetFloat("amount")

		switch movType {
		case "cash_in":
			cashIn += amount
		case "cash_out":
			cashOut += amount
		case "safe_drop":
			safeDrop += amount
		}
	}

	movementsTotal := cashIn - cashOut - safeDrop

	// 5. Calculer les espèces attendues
	openingFloat := session.GetFloat("opening_float")
	expectedCash := openingFloat + cashFromSales + movementsTotal

	// 6. Construire le rapport
	openedAt, _ := time.Parse(time.RFC3339, session.GetString("opened_at"))

	rapport := &RapportX{
		ReportType:  "x",
		GeneratedAt: time.Now(),
		Session: SessionInfo{
			ID:           session.Id,
			CashRegister: session.GetString("cash_register"),
			OpenedAt:     openedAt,
			Status:       "open",
		},
		OpeningFloat: openingFloat,
		Sales: SalesSummary{
			InvoiceCount: invoiceCount,
			TotalTTC:     totalTTC,
			ByMethod:     totalsByMethod,
		},
		Movements: MovementsSummary{
			CashIn:   cashIn,
			CashOut:  cashOut,
			SafeDrop: safeDrop,
			Total:    movementsTotal,
		},
		ExpectedCash: ExpectedCashSummary{
			OpeningFloat: openingFloat,
			SalesCash:    cashFromSales,
			Movements:    movementsTotal,
			Total:        expectedCash,
		},
		Note: "Lecture intermédiaire - La caisse reste ouverte",
	}

	return rapport, nil
}

// ============================================================================
// RAPPORT Z - Clôture Journalière
// ============================================================================

type RapportZ struct {
	ReportType   string             `json:"report_type"`
	GeneratedAt  time.Time          `json:"generated_at"`
	CashRegister CashRegisterInfo   `json:"cash_register"`
	Date         string             `json:"date"`
	Sessions     []SessionSummary   `json:"sessions"`
	DailyTotals  DailyTotalsSummary `json:"daily_totals"`
	Note         string             `json:"note"`
	IsLocked     bool               `json:"is_locked"`
}

type CashRegisterInfo struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

type SessionSummary struct {
	ID             string    `json:"id"`
	OpenedAt       time.Time `json:"opened_at"`
	ClosedAt       time.Time `json:"closed_at"`
	OpenedBy       string    `json:"opened_by"`
	InvoiceCount   int       `json:"invoice_count"`
	TotalTTC       float64   `json:"total_ttc"`
	CashDifference float64   `json:"cash_difference"`
}

type DailyTotalsSummary struct {
	SessionsCount       int                `json:"sessions_count"`
	InvoiceCount        int                `json:"invoice_count"`
	TotalTTC            float64            `json:"total_ttc"`
	ByMethod            map[string]float64 `json:"by_method"`
	TotalCashDifference float64            `json:"total_cash_difference"`
}

func GenerateRapportZ(app *pocketbase.PocketBase, cashRegisterID string, date string) (*RapportZ, error) {
	dao := app.Dao()

	// 1. Charger la caisse
	cashRegister, err := dao.FindRecordById("cash_registers", cashRegisterID)
	if err != nil {
		return nil, fmt.Errorf("caisse introuvable: %w", err)
	}

	// 2. Déterminer la plage horaire de la journée
	dateStart, err := time.Parse("2006-01-02", date)
	if err != nil {
		return nil, fmt.Errorf("format de date invalide: %w", err)
	}
	dateEnd := dateStart.Add(24 * time.Hour)

	// 3. Récupérer toutes les sessions fermées de cette journée
	filter := fmt.Sprintf(
		"cash_register = '%s' && status = 'closed' && opened_at >= '%s' && opened_at < '%s'",
		cashRegisterID,
		dateStart.Format(time.RFC3339),
		dateEnd.Format(time.RFC3339),
	)

	sessions, err := dao.FindRecordsByFilter(
		"cash_sessions",
		filter,
		"opened_at",
		0,
		0,
	)
	if err != nil {
		return nil, fmt.Errorf("erreur chargement sessions: %w", err)
	}

	if len(sessions) == 0 {
		return nil, fmt.Errorf("aucune session fermée pour cette date")
	}

	// 4. Agréger les données
	var sessionsSummaries []SessionSummary
	var totalInvoiceCount int
	var totalTTC float64
	totalsByMethod := make(map[string]float64)
	var totalCashDifference float64

	for _, session := range sessions {
		invoiceCount := session.GetInt("invoice_count")
		ttc := session.GetFloat("total_ttc")
		cashDiff := session.GetFloat("cash_difference")

		totalInvoiceCount += invoiceCount
		totalTTC += ttc
		totalCashDifference += cashDiff

		// Agréger les totaux par méthode
		if methodsData := session.Get("totals_by_method"); methodsData != nil {
			if methods, ok := methodsData.(map[string]interface{}); ok {
				for method, amount := range methods {
					if amt, ok := amount.(float64); ok {
						totalsByMethod[method] += amt
					}
				}
			}
		}

		openedAt, _ := time.Parse(time.RFC3339, session.GetString("opened_at"))
		closedAt, _ := time.Parse(time.RFC3339, session.GetString("closed_at"))

		sessionsSummaries = append(sessionsSummaries, SessionSummary{
			ID:             session.Id,
			OpenedAt:       openedAt,
			ClosedAt:       closedAt,
			OpenedBy:       session.GetString("opened_by"),
			InvoiceCount:   invoiceCount,
			TotalTTC:       ttc,
			CashDifference: cashDiff,
		})
	}

	// 5. Construire le rapport
	rapport := &RapportZ{
		ReportType:  "z",
		GeneratedAt: time.Now(),
		CashRegister: CashRegisterInfo{
			ID:   cashRegister.Id,
			Code: cashRegister.GetString("code"),
			Name: cashRegister.GetString("name"),
		},
		Date:     date,
		Sessions: sessionsSummaries,
		DailyTotals: DailyTotalsSummary{
			SessionsCount:       len(sessions),
			InvoiceCount:        totalInvoiceCount,
			TotalTTC:            totalTTC,
			ByMethod:            totalsByMethod,
			TotalCashDifference: totalCashDifference,
		},
		Note:     "Rapport Z - Document inaltérable",
		IsLocked: true,
	}

	return rapport, nil
}
