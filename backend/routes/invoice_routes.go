// backend/routes/invoice_routes.go
package routes

import (
	"log"
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"

	"pocket-react/backend"
)

type InvoiceRefundInput struct {
	OriginalInvoiceID string                     `json:"original_invoice_id"`
	RefundType        string                     `json:"refund_type"` // full|partial
	RefundMethod      string                     `json:"refund_method"`
	RefundMethodLabel string                     `json:"refund_method_label"`
	RefundedItems     []InvoiceRefundedItemInput `json:"refunded_items"`
	Reason            string                     `json:"reason"`
}

type InvoiceRefundedItemInput struct {
	OriginalItemIndex int     `json:"original_item_index"`
	Quantity          float64 `json:"quantity"`
	Reason            string  `json:"reason"`
}

func RegisterInvoiceRefundRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.POST("/api/invoices/refund", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()

		// 1) Parser le payload
		var payload InvoiceRefundInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		// Validation basique
		if payload.OriginalInvoiceID == "" {
			return apis.NewBadRequestError("original_invoice_id requis", nil)
		}
		if payload.Reason == "" {
			return apis.NewBadRequestError("reason requis", nil)
		}
		if payload.RefundType == "" {
			payload.RefundType = "full"
		}
		if payload.RefundMethod == "" {
			payload.RefundMethod = "autre"
		}

		// 2) Vérifier que c'est bien une facture B2B (pas un ticket POS)
		orig, err := dao.FindRecordById("invoices", payload.OriginalInvoiceID)
		if err != nil || orig == nil {
			return apis.NewNotFoundError("Facture introuvable", err)
		}
		if orig.GetBool("is_pos_ticket") {
			return apis.NewBadRequestError("Cette route est réservée aux factures B2B (pas aux tickets POS)", nil)
		}

		// 3) Convertir le payload vers RefundInput
		refundInput := backend.RefundInput{
			OriginalDocumentID: payload.OriginalInvoiceID,
			RefundType:         payload.RefundType,
			RefundMethod:       payload.RefundMethod,
			RefundMethodLabel:  payload.RefundMethodLabel,
			Reason:             payload.Reason,
			IsPosTicket:        false, // C'est une facture B2B
		}

		// Convertir les items si partial
		if payload.RefundType == "partial" {
			if len(payload.RefundedItems) == 0 {
				return apis.NewBadRequestError("refunded_items requis si refund_type=partial", nil)
			}
			refundInput.RefundedItems = make([]backend.RefundedItemInput, len(payload.RefundedItems))
			for i, item := range payload.RefundedItems {
				refundInput.RefundedItems[i] = backend.RefundedItemInput{
					OriginalItemIndex: item.OriginalItemIndex,
					Quantity:          item.Quantity,
					Reason:            item.Reason,
				}
			}
		}

		// 4) Créer l'avoir via le module centralisé
		var soldByID string
		if info.AuthRecord != nil {
			soldByID = info.AuthRecord.Id
		}

		result, err := backend.CreateCreditNote(dao, refundInput, soldByID)
		if err != nil {
			errMsg := err.Error()
			if strings.Contains(errMsg, "introuvable") {
				return apis.NewNotFoundError(errMsg, nil)
			}
			if strings.Contains(errMsg, "invalide") ||
				strings.Contains(errMsg, "requis") ||
				strings.Contains(errMsg, "dépasse") ||
				strings.Contains(errMsg, "remboursé") {
				return apis.NewBadRequestError(errMsg, nil)
			}
			return apis.NewApiError(500, errMsg, err)
		}

		log.Printf("✅ Avoir B2B %s créé: %.2f€ (facture: %s)",
			result.CreditNote.GetString("number"),
			result.CreditNote.GetFloat("total_ttc"),
			orig.GetString("number"))

		// 5) Retourner le résultat
		return c.JSON(http.StatusCreated, echo.Map{
			"credit_note":      result.CreditNote,
			"original_updated": result.OriginalUpdated,
		})
	},
		apis.RequireRecordAuth(),
	)
}
