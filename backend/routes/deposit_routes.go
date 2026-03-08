// backend/routes/deposit_routes.go
// Routes HTTP pour la gestion des acomptes et factures de solde.
//
// POST /api/invoices/deposit          → Créer une facture d'acompte
// POST /api/invoices/balance          → Générer la facture de solde
// GET  /api/invoices/:id/deposits     → Lister les acomptes d'une facture

package routes

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"

	"pocket-react/backend"
)

// ============================================================================
// DTOs
// ============================================================================

type DepositCreateInput struct {
	ParentID           string  `json:"parent_id"`
	Percentage         float64 `json:"percentage"`           // ex: 30 pour 30%
	Amount             float64 `json:"amount"`               // montant TTC fixe
	PaymentMethod      string  `json:"payment_method"`       // virement|cb|especes|cheque|autre
	PaymentMethodLabel string  `json:"payment_method_label"` // si payment_method = "autre"
}

type BalanceCreateInput struct {
	ParentID string `json:"parent_id"`
}

// ============================================================================
// ENREGISTREMENT DES ROUTES
// ============================================================================

func RegisterDepositRoutes(app *pocketbase.PocketBase, router *echo.Echo) {

	// ──────────────────────────────────────────────────────────────────────────
	// POST /api/invoices/deposit
	// Crée une facture d'acompte (ACC-YYYY-XXXXXX) liée à une facture B2B.
	// ──────────────────────────────────────────────────────────────────────────
	router.POST("/api/invoices/deposit", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()

		var payload DepositCreateInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		// Validations basiques
		if payload.ParentID == "" {
			return apis.NewBadRequestError("parent_id requis", nil)
		}
		if payload.Percentage == 0 && payload.Amount == 0 {
			return apis.NewBadRequestError("percentage ou amount requis", nil)
		}
		if payload.Percentage != 0 && payload.Amount != 0 {
			return apis.NewBadRequestError("percentage et amount sont mutuellement exclusifs", nil)
		}
		if payload.Percentage < 0 || payload.Percentage > 100 {
			return apis.NewBadRequestError("percentage invalide (doit être entre 1 et 100)", nil)
		}
		if payload.Amount < 0 {
			return apis.NewBadRequestError("amount invalide (doit être positif)", nil)
		}

		var soldByID string
		if info.AuthRecord != nil {
			soldByID = info.AuthRecord.Id
		}

		input := backend.DepositInput{
			ParentID:           payload.ParentID,
			Percentage:         payload.Percentage,
			Amount:             payload.Amount,
			PaymentMethod:      payload.PaymentMethod,
			PaymentMethodLabel: payload.PaymentMethodLabel,
			SoldBy:             soldByID,
		}

		result, err := backend.CreateDepositInvoice(dao, input, soldByID)
		if err != nil {
			errMsg := err.Error()
			log.Printf("❌ Erreur création acompte: %s", errMsg)

			if strings.Contains(errMsg, "introuvable") {
				return apis.NewNotFoundError(errMsg, nil)
			}
			if strings.Contains(errMsg, "invalide") ||
				strings.Contains(errMsg, "requis") ||
				strings.Contains(errMsg, "dépasse") ||
				strings.Contains(errMsg, "impossible") ||
				strings.Contains(errMsg, "brouillon") ||
				strings.Contains(errMsg, "disponible") ||
				strings.Contains(errMsg, "exclusifs") {
				return apis.NewBadRequestError(errMsg, nil)
			}
			return apis.NewApiError(500, errMsg, err)
		}

		log.Printf("✅ Acompte %s créé pour facture %s",
			result.Deposit.GetString("number"),
			result.ParentUpdated.GetString("number"),
		)

		return c.JSON(http.StatusCreated, echo.Map{
			"deposit":        result.Deposit,
			"parent_updated": result.ParentUpdated,
		})
	}, apis.RequireRecordAuth())

	// ──────────────────────────────────────────────────────────────────────────
	// POST /api/invoices/balance
	// Génère la facture de solde une fois tous les acomptes payés.
	// ──────────────────────────────────────────────────────────────────────────
	router.POST("/api/invoices/balance", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()

		var payload BalanceCreateInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		if payload.ParentID == "" {
			return apis.NewBadRequestError("parent_id requis", nil)
		}

		var soldByID string
		if info.AuthRecord != nil {
			soldByID = info.AuthRecord.Id
		}

		result, err := backend.CreateBalanceInvoice(dao, payload.ParentID, soldByID)
		if err != nil {
			errMsg := err.Error()
			log.Printf("❌ Erreur création facture de solde: %s", errMsg)

			if strings.Contains(errMsg, "introuvable") {
				return apis.NewNotFoundError(errMsg, nil)
			}
			if strings.Contains(errMsg, "invalide") ||
				strings.Contains(errMsg, "requis") ||
				strings.Contains(errMsg, "brouillon") ||
				strings.Contains(errMsg, "déjà") ||
				strings.Contains(errMsg, "couvert") ||
				strings.Contains(errMsg, "payé") ||
				strings.Contains(errMsg, "aucun") {
				return apis.NewBadRequestError(errMsg, nil)
			}
			return apis.NewApiError(500, errMsg, err)
		}

		log.Printf("✅ Facture de solde %s créée (parente: %s)",
			result.BalanceInvoice.GetString("number"),
			result.ParentUpdated.GetString("number"),
		)

		return c.JSON(http.StatusCreated, echo.Map{
			"balance_invoice": result.BalanceInvoice,
			"parent_updated":  result.ParentUpdated,
		})
	}, apis.RequireRecordAuth())

	// ──────────────────────────────────────────────────────────────────────────
	// GET /api/invoices/:id/deposits
	// Liste tous les acomptes (et la facture de solde éventuelle) d'une facture.
	// ──────────────────────────────────────────────────────────────────────────
	router.GET("/api/invoices/:id/deposits", func(c echo.Context) error {
		dao := app.Dao()
		invoiceID := c.PathParam("id")

		if invoiceID == "" {
			return apis.NewBadRequestError("id requis", nil)
		}

		parent, err := dao.FindRecordById("invoices", invoiceID)
		if err != nil || parent == nil {
			return apis.NewNotFoundError("Facture introuvable", err)
		}

		deposits, err := dao.FindRecordsByFilter(
			"invoices",
			fmt.Sprintf("invoice_type = 'deposit' && original_invoice_id = '%s'", invoiceID),
			"+created",
			0,
			0,
		)
		if err != nil {
			return apis.NewApiError(500, "Erreur récupération acomptes", err)
		}

		// Facture de solde si elle existe
		balanceInvoice, _ := dao.FindFirstRecordByFilter(
			"invoices",
			fmt.Sprintf("invoice_type = 'invoice' && original_invoice_id = '%s'", invoiceID),
		)

		// Résumé
		paidCount := 0
		pendingCount := 0
		for _, d := range deposits {
			if d.GetBool("is_paid") {
				paidCount++
			} else {
				pendingCount++
			}
		}

		return c.JSON(http.StatusOK, echo.Map{
			"deposits":         deposits,
			"balance_invoice":  balanceInvoice,
			"deposits_count":   len(deposits),
			"paid_count":       paidCount,
			"pending_count":    pendingCount,
			"deposits_total":   parent.GetFloat("deposits_total_ttc"),
			"balance_due":      parent.GetFloat("balance_due"),
			"parent_total_ttc": parent.GetFloat("total_ttc"),
		})
	}, apis.RequireRecordAuth())
}
