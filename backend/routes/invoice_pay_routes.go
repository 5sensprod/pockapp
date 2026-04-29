// backend/routes/invoice_pay_routes.go
// ═══════════════════════════════════════════════════════════════════════════
// ROUTES — PAIEMENT ET STATS DES FACTURES
// ═══════════════════════════════════════════════════════════════════════════

package routes

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"

	"pocket-react/backend"
)

// ============================================================================
// DTOs
// ============================================================================

type PayInvoiceInput struct {
	PaymentMethod      string              `json:"payment_method"`
	PaymentMethodLabel string              `json:"payment_method_label"`
	PaidAt             string              `json:"paid_at"` // ISO8601 optionnel
	SplitPayments      []SplitPaymentInput `json:"split_payments"`
}

type SplitPaymentInput struct {
	Method      string  `json:"method"`
	MethodLabel string  `json:"method_label"`
	Amount      float64 `json:"amount"`
}

// ============================================================================
// REGISTRATION
// ============================================================================

func RegisterInvoicePayRoutes(app *pocketbase.PocketBase, router *echo.Echo) {

	// ─────────────────────────────────────────────────────────────────────────
	// POST /api/invoices/:id/pay
	// Enregistre le paiement d'une facture B2B.
	//
	// Body JSON :
	//   { "payment_method": "card", "payment_method_label": "", "paid_at": "" }
	//
	// Réponse 200 :
	//   { "invoice": {...}, "parent_updated": {...} | null }
	// ─────────────────────────────────────────────────────────────────────────
	router.POST("/api/invoices/:id/pay", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewUnauthorizedError("Authentication required", nil)
		}

		invoiceID := c.PathParam("id")
		if invoiceID == "" {
			return apis.NewBadRequestError("id requis", nil)
		}

		var payload PayInvoiceInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		if payload.PaymentMethod == "" {
			payload.PaymentMethod = "autre"
		}

		soldByID := info.AuthRecord.Id

		result, err := backend.RecordPayment(app.Dao(), invoiceID, backend.PayInvoiceInput{
			PaymentMethod:      payload.PaymentMethod,
			PaymentMethodLabel: payload.PaymentMethodLabel,
			PaidAt:             payload.PaidAt,
			SplitPayments:      toBackendSplitPayments(payload.SplitPayments),
		}, soldByID)

		if err != nil {
			errMsg := err.Error()
			if strings.Contains(errMsg, "introuvable") {
				return apis.NewNotFoundError(errMsg, nil)
			}
			if strings.Contains(errMsg, "déjà encaissée") ||
				strings.Contains(errMsg, "brouillon") ||
				strings.Contains(errMsg, "avoir") ||
				strings.Contains(errMsg, "POS") {
				return apis.NewBadRequestError(errMsg, nil)
			}
			return apis.NewApiError(500, errMsg, err)
		}

		return c.JSON(http.StatusOK, echo.Map{
			"invoice":        result.Invoice,
			"parent_updated": result.ParentUpdated, // nil si pas de facture parente
		})
	}, apis.RequireRecordAuth())

	// ─────────────────────────────────────────────────────────────────────────
	// GET /api/invoices/stats?company_id=xxx&fiscal_year=2025
	// Calcule les stats sur TOUTES les factures de la company (sans pagination).
	//
	// Réponse 200 :
	//   {
	//     "invoice_count": 42,
	//     "credit_note_count": 3,
	//     "total_ttc": 15000.00,
	//     "credit_notes_ttc": -500.00,
	//     "paid": 12000.00,
	//     "pending": 3000.00,
	//     "overdue": 800.00
	//   }
	// ─────────────────────────────────────────────────────────────────────────
	router.GET("/api/invoices/stats", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewUnauthorizedError("Authentication required", nil)
		}

		companyID := c.QueryParam("company_id")
		if companyID == "" {
			return apis.NewBadRequestError("company_id requis", nil)
		}

		fiscalYear := 0
		if fy := c.QueryParam("fiscal_year"); fy != "" {
			if parsed, err := strconv.Atoi(fy); err == nil {
				fiscalYear = parsed
			}
		}

		statsFilter := backend.StatsFilter{
			FiscalYear: fiscalYear,
			DateFrom:   c.QueryParam("date_from"), // "YYYY-MM-DD"
			DateTo:     c.QueryParam("date_to"),   // "YYYY-MM-DD"
		}

		stats, err := backend.ComputeInvoiceStats(app.Dao(), companyID, statsFilter)
		if err != nil {
			return apis.NewApiError(500, "Erreur calcul stats", err)
		}

		return c.JSON(http.StatusOK, stats)
	}, apis.RequireRecordAuth())
}

// toBackendSplitPayments convertit les DTOs de la route vers le type backend
func toBackendSplitPayments(inputs []SplitPaymentInput) []backend.SplitPayment {
	if len(inputs) == 0 {
		return nil
	}
	result := make([]backend.SplitPayment, len(inputs))
	for i, sp := range inputs {
		result[i] = backend.SplitPayment{
			Method:      sp.Method,
			MethodLabel: sp.MethodLabel,
			Amount:      sp.Amount,
		}
	}
	return result
}
