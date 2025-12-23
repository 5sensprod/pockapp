package backend

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/models"
)

type InvoiceRefundInput struct {
	OriginalInvoiceID string                     `json:"original_invoice_id"`
	RefundType        string                     `json:"refund_type"` // full|partial
	RefundMethod      string                     `json:"refund_method"`
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

		var payload InvoiceRefundInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		if payload.OriginalInvoiceID == "" {
			return apis.NewBadRequestError("original_invoice_id requis", nil)
		}
		if payload.RefundType == "" {
			payload.RefundType = "full"
		}
		if payload.RefundType != "full" && payload.RefundType != "partial" {
			return apis.NewBadRequestError("refund_type invalide (full|partial)", nil)
		}
		if payload.Reason == "" {
			return apis.NewBadRequestError("reason requis", nil)
		}
		if payload.RefundMethod == "" {
			payload.RefundMethod = "autre"
		}
		if payload.RefundMethod != "especes" && payload.RefundMethod != "cb" && payload.RefundMethod != "cheque" && payload.RefundMethod != "autre" {
			return apis.NewBadRequestError("refund_method invalide (especes|cb|cheque|autre)", nil)
		}

		// 1) Facture originale
		orig, err := dao.FindRecordById("invoices", payload.OriginalInvoiceID)
		if err != nil || orig == nil {
			return apis.NewNotFoundError("Facture introuvable", err)
		}
		if orig.GetString("invoice_type") != "invoice" {
			return apis.NewBadRequestError("Impossible de rembourser un avoir", nil)
		}
		if orig.GetBool("is_pos_ticket") {
			return apis.NewBadRequestError("Cette route est réservée aux factures B2B (pas aux tickets POS)", nil)
		}
		if orig.GetString("status") == "draft" {
			return apis.NewBadRequestError("Impossible de rembourser un brouillon", nil)
		}

		// 2) Remaining monétaire (depuis BDD)
		origTotal := abs(orig.GetFloat("total_ttc"))
		creditNotesTotal := sumCreditNotesForTicket(dao, orig.Id) // réutilisable car basé sur original_invoice_id
		remaining := origTotal - creditNotesTotal

		log.Printf("🔍 Invoice %s: total=%.2f, avoirs=%.2f, remaining=%.2f",
			orig.GetString("number"), origTotal, creditNotesTotal, remaining)

		if remaining <= 0.01 {
			return apis.NewBadRequestError(
				fmt.Sprintf("Facture déjà totalement remboursée (total: %.2f€, avoirs: %.2f€)", origTotal, creditNotesTotal),
				nil,
			)
		}

		// 3) Construire items + totaux
		var creditItems []map[string]any
		var creditTotalHT, creditTotalTVA, creditTotalTTC float64

		origItems, err := parseItemsFromRecord(orig, "items")
		if err != nil || len(origItems) == 0 {
			return apis.NewBadRequestError(fmt.Sprintf("Items originaux invalides: %v", err), nil)
		}

		alreadyRefunded := getRefundedItemsForTicket(dao, orig.Id)

		if payload.RefundType == "partial" {
			if len(payload.RefundedItems) == 0 {
				return apis.NewBadRequestError("refunded_items requis si refund_type=partial", nil)
			}

			creditItems = make([]map[string]any, 0, len(payload.RefundedItems))
			for i, it := range payload.RefundedItems {
				if it.OriginalItemIndex < 0 || it.OriginalItemIndex >= len(origItems) {
					return apis.NewBadRequestError(
						fmt.Sprintf("refunded_items[%d].original_item_index hors limites (max=%d)", i, len(origItems)-1),
						nil,
					)
				}
				if it.Quantity <= 0 {
					return apis.NewBadRequestError(fmt.Sprintf("refunded_items[%d].quantity invalide", i), nil)
				}

				origItem := origItems[it.OriginalItemIndex]
				origQty := getItemQuantity(origItem)

				refundedQty := alreadyRefunded[it.OriginalItemIndex]
				remainingQty := origQty - refundedQty
				if remainingQty <= 0 {
					return apis.NewBadRequestError(fmt.Sprintf("refunded_items[%d]: item déjà totalement remboursé", i), nil)
				}
				if it.Quantity > remainingQty {
					return apis.NewBadRequestError(
						fmt.Sprintf("refunded_items[%d]: quantité (%.2f) > restant remboursable (%.2f)", i, it.Quantity, remainingQty),
						nil,
					)
				}

				cp := make(map[string]any)
				for k, v := range origItem {
					cp[k] = v
				}
				cp["quantity"] = it.Quantity
				cp["refund_reason"] = it.Reason
				cp["original_item_index"] = it.OriginalItemIndex

				lineHT, lineTVA, lineTTC := computeItemTotals(origItem, it.Quantity)
				cp["total_ht"] = lineHT
				cp["total_tva"] = lineTVA
				cp["total_ttc"] = lineTTC

				creditTotalHT += lineHT
				creditTotalTVA += lineTVA
				creditTotalTTC += lineTTC

				creditItems = append(creditItems, cp)
			}
		} else {
			// Full: rembourser “le restant” en respectant les quantités déjà remboursées
			creditItems = make([]map[string]any, 0, len(origItems))
			for idx, origItem := range origItems {
				origQty := getItemQuantity(origItem)
				refundedQty := alreadyRefunded[idx]
				remainingQty := origQty - refundedQty
				if remainingQty <= 0 {
					continue
				}

				cp := make(map[string]any)
				for k, v := range origItem {
					cp[k] = v
				}

				cp["quantity"] = remainingQty
				cp["original_item_index"] = idx
				cp["refund_reason"] = payload.Reason

				lineHT, lineTVA, lineTTC := computeItemTotals(origItem, remainingQty)
				cp["total_ht"] = lineHT
				cp["total_tva"] = lineTVA
				cp["total_ttc"] = lineTTC

				creditTotalHT += lineHT
				creditTotalTVA += lineTVA
				creditTotalTTC += lineTTC

				creditItems = append(creditItems, cp)
			}

			if len(creditItems) == 0 {
				return apis.NewBadRequestError("Facture déjà totalement remboursée (aucune quantité restante)", nil)
			}

			if creditTotalTTC > remaining+0.01 {
				return apis.NewBadRequestError(
					fmt.Sprintf("Montant recalculé (%.2f€) dépasse le restant remboursable (%.2f€)", creditTotalTTC, remaining),
					nil,
				)
			}
		}

		if creditTotalTTC > remaining+0.01 {
			return apis.NewBadRequestError(
				fmt.Sprintf("Montant (%.2f€) dépasse le restant remboursable (%.2f€)", creditTotalTTC, remaining),
				nil,
			)
		}

		// 4) Numéro + chaînage
		ownerCompany := orig.GetString("owner_company")
		fiscalYear := time.Now().Year()
		avoNumber, err := generateAvoirNumber(dao, ownerCompany, fiscalYear)
		if err != nil {
			return apis.NewApiError(500, "Erreur génération numéro avoir", err)
		}

		lastInvoice, _ := getLastInvoiceForCompany(dao, ownerCompany)
		var previousHash string
		var sequenceNumber int
		if lastInvoice == nil {
			previousHash = "0000000000000000000000000000000000000000000000000000000000000000"
			sequenceNumber = 1
		} else {
			previousHash = lastInvoice.GetString("hash")
			sequenceNumber = lastInvoice.GetInt("sequence_number") + 1
		}

		invoicesCol, err := dao.FindCollectionByNameOrId("invoices")
		if err != nil {
			return apis.NewApiError(500, "Collection invoices introuvable", err)
		}

		credit := models.NewRecord(invoicesCol)
		credit.Set("number", avoNumber)
		credit.Set("owner_company", ownerCompany)
		credit.Set("customer", orig.GetString("customer"))
		credit.Set("invoice_type", "credit_note")
		credit.Set("status", "validated")
		credit.Set("date", time.Now().Format(time.RFC3339))
		credit.Set("currency", orig.GetString("currency"))
		credit.Set("fiscal_year", fiscalYear)

		credit.Set("original_invoice_id", orig.Id)
		credit.Set("is_pos_ticket", false)
		credit.Set("session", "")
		credit.Set("cash_register", "")

		credit.Set("refund_type", payload.RefundType)
		credit.Set("refund_method", payload.RefundMethod)
		credit.Set("cancellation_reason", payload.Reason)

		// Montants négatifs pour l’avoir
		credit.Set("items", creditItems)
		credit.Set("total_ht", -creditTotalHT)
		credit.Set("total_tva", -creditTotalTVA)
		credit.Set("total_ttc", -creditTotalTTC)

		credit.Set("previous_hash", previousHash)
		credit.Set("sequence_number", sequenceNumber)
		credit.Set("is_locked", true)

		hash := computeRecordHash(credit)
		credit.Set("hash", hash)

		if info.AuthRecord != nil {
			credit.Set("sold_by", info.AuthRecord.Id)
		}

		if err := dao.SaveRecord(credit); err != nil {
			return apis.NewApiError(500, "Impossible de créer l'avoir", err)
		}

		log.Printf("✅ Avoir %s créé: %.2f€ (invoice: %s)", avoNumber, -creditTotalTTC, orig.GetString("number"))

		// 5) Update facture originale
		newCreditNotesTotal := creditNotesTotal + creditTotalTTC
		newRemaining := origTotal - newCreditNotesTotal
		if newRemaining < 0 {
			newRemaining = 0
		}

		orig.Set("has_credit_note", true)
		orig.Set("credit_notes_total", newCreditNotesTotal)
		orig.Set("remaining_amount", newRemaining)

		if err := dao.SaveRecord(orig); err != nil {
			log.Printf("⚠️ Erreur mise à jour facture: %v", err)
		}

		origUpdated, _ := dao.FindRecordById("invoices", orig.Id)

		return c.JSON(http.StatusCreated, echo.Map{
			"credit_note":      credit,
			"original_updated": origUpdated,
		})
	}, apis.RequireRecordAuth())
}
