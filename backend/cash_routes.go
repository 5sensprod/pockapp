// backend/routes/cash_routes.go
// VERSION AMÉLIORÉE avec routes Z reports

package backend

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"

	// IMPORTANT : Remplacer "pocket-react" par le nom de votre module (voir go.mod)
	"pocket-react/backend/reports"
)

// parseItemsFromRecord extrait les items d'un record PocketBase (gère tous les formats)
func parseItemsFromRecord(record *models.Record, fieldName string) ([]map[string]any, error) {
	raw := record.Get(fieldName)
	if raw == nil {
		return nil, fmt.Errorf("champ '%s' absent ou null", fieldName)
	}

	switch v := raw.(type) {
	case []any:
		// Format standard []interface{}
		out := make([]map[string]any, 0, len(v))
		for _, it := range v {
			if m, ok := it.(map[string]any); ok {
				out = append(out, m)
			} else {
				// Fallback: marshal/unmarshal
				b, err := json.Marshal(it)
				if err != nil {
					return nil, err
				}
				var mm map[string]any
				if err := json.Unmarshal(b, &mm); err != nil {
					return nil, err
				}
				out = append(out, mm)
			}
		}
		return out, nil

	case []map[string]any:
		return v, nil

	case string:
		// JSON string
		if v == "" || v == "null" || v == "[]" {
			return nil, fmt.Errorf("champ '%s' vide", fieldName)
		}
		var out []map[string]any
		if err := json.Unmarshal([]byte(v), &out); err != nil {
			return nil, err
		}
		return out, nil

	case json.RawMessage:
		var out []map[string]any
		if err := json.Unmarshal(v, &out); err != nil {
			return nil, err
		}
		return out, nil

	default:
		// Dernier recours: marshal/unmarshal
		b, err := json.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("type non supporté: %T", v)
		}
		var out []map[string]any
		if err := json.Unmarshal(b, &out); err != nil {
			return nil, err
		}
		return out, nil
	}
}

// DTOs ---------------------------------------------------------

type OpenSessionInput struct {
	OwnerCompany string  `json:"owner_company"`
	CashRegister string  `json:"cash_register"`
	OpeningFloat float64 `json:"opening_float"`
}

type CloseSessionInput struct {
	CountedCashTotal float64 `json:"counted_cash_total"`
}

type CashMovementInput struct {
	Session      string         `json:"session"`
	MovementType string         `json:"movement_type"`
	Amount       float64        `json:"amount"`
	Reason       string         `json:"reason"`
	Meta         map[string]any `json:"meta"`
}

type PosRefundInput struct {
	OriginalTicketID string                 `json:"original_ticket_id"`
	RefundType       string                 `json:"refund_type"`   // full|partial
	RefundMethod     string                 `json:"refund_method"` // especes|cb|autre
	RefundedItems    []PosRefundedItemInput `json:"refunded_items"`
	Reason           string                 `json:"reason"`
}

type PosRefundedItemInput struct {
	OriginalItemIndex int     `json:"original_item_index"`
	Quantity          float64 `json:"quantity"`
	Reason            string  `json:"reason"`
}

// ROUTES -------------------------------------------------------

func RegisterCashRoutes(app *pocketbase.PocketBase, router *echo.Echo) {

	// ----------------------------------------------------------------------
	// POS REFUND (AVOIR SUR TICKET)
	// ----------------------------------------------------------------------
	// ----------------------------------------------------------------------
	// POS REFUND (AVOIR SUR TICKET)
	// ----------------------------------------------------------------------
	router.POST("/api/pos/refund", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()

		var payload PosRefundInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		if payload.OriginalTicketID == "" {
			return apis.NewBadRequestError("original_ticket_id requis", nil)
		}
		if payload.RefundType == "" {
			payload.RefundType = "full"
		}
		if payload.RefundType != "full" && payload.RefundType != "partial" {
			return apis.NewBadRequestError("refund_type invalide (full|partial)", nil)
		}
		if payload.RefundMethod == "" {
			payload.RefundMethod = "autre"
		}
		if payload.RefundMethod != "especes" && payload.RefundMethod != "cb" && payload.RefundMethod != "cheque" && payload.RefundMethod != "autre" {
			return apis.NewBadRequestError("refund_method invalide (especes|cb|cheque|autre)", nil)
		}

		// 1) Le ticket doit exister et être is_pos_ticket=true
		orig, err := dao.FindRecordById("invoices", payload.OriginalTicketID)
		if err != nil || orig == nil {
			return apis.NewNotFoundError("Ticket introuvable", err)
		}
		if !orig.GetBool("is_pos_ticket") {
			return apis.NewBadRequestError("Le document original n'est pas un ticket POS", nil)
		}
		if orig.GetString("invoice_type") != "invoice" {
			return apis.NewBadRequestError("Impossible de rembourser un avoir", nil)
		}

		// 2) Calculer le montant restant remboursable (depuis la BDD)
		origTotal := abs(orig.GetFloat("total_ttc"))
		creditNotesTotal := sumCreditNotesForTicket(dao, orig.Id)
		remaining := origTotal - creditNotesTotal

		log.Printf("🔍 Ticket %s: total=%.2f, avoirs=%.2f, remaining=%.2f",
			orig.GetString("number"), origTotal, creditNotesTotal, remaining)

		if remaining <= 0.01 {
			return apis.NewBadRequestError(
				fmt.Sprintf("Ticket déjà totalement remboursé (total: %.2f€, avoirs: %.2f€)", origTotal, creditNotesTotal),
				nil,
			)
		}

		// 3) Si especes, une session doit être ouverte pour cette caisse
		var activeSession *models.Record
		if payload.RefundMethod == "especes" {
			cashRegisterID := orig.GetString("cash_register")
			if cashRegisterID == "" {
				return apis.NewBadRequestError("Le ticket n'a pas de cash_register", nil)
			}
			activeSession, _ = dao.FindFirstRecordByFilter(
				"cash_sessions",
				fmt.Sprintf("cash_register = '%s' && status = 'open'", cashRegisterID),
			)
			if activeSession == nil {
				return apis.NewBadRequestError("Aucune session ouverte pour cette caisse", nil)
			}
		}

		// 4) Construire les items et calculer les totaux
		var creditItems []map[string]any
		var creditTotalHT, creditTotalTVA, creditTotalTTC float64

		if payload.RefundType == "partial" {
			if len(payload.RefundedItems) == 0 {
				return apis.NewBadRequestError("refunded_items requis si refund_type=partial", nil)
			}

			origItems, err := parseItemsFromRecord(orig, "items")
			if err != nil || len(origItems) == 0 {
				return apis.NewBadRequestError(
					fmt.Sprintf("Items originaux invalides: %v", err),
					nil,
				)
			}

			alreadyRefunded := getRefundedItemsForTicket(dao, orig.Id)
			log.Printf("🔍 Items déjà remboursés: %v", alreadyRefunded)

			creditItems = make([]map[string]any, 0, len(payload.RefundedItems))
			creditTotalHT, creditTotalTVA, creditTotalTTC = 0, 0, 0

			for i, it := range payload.RefundedItems {
				if it.OriginalItemIndex < 0 || it.OriginalItemIndex >= len(origItems) {
					return apis.NewBadRequestError(
						fmt.Sprintf("refunded_items[%d].original_item_index hors limites (max=%d)", i, len(origItems)-1),
						nil,
					)
				}
				if it.Quantity <= 0 {
					return apis.NewBadRequestError(
						fmt.Sprintf("refunded_items[%d].quantity invalide", i),
						nil,
					)
				}

				origItem := origItems[it.OriginalItemIndex]
				origQty := getItemQuantity(origItem)

				alreadyRefundedQty := alreadyRefunded[it.OriginalItemIndex]
				remainingQty := origQty - alreadyRefundedQty

				if remainingQty <= 0 {
					return apis.NewBadRequestError(
						fmt.Sprintf("refunded_items[%d]: item déjà totalement remboursé", i),
						nil,
					)
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
			// Full refund: rembourser le RESTANT, mais en construisant l'avoir "par ligne"
			// pour que original_item_index + quantity restent cohérents avec les partiels.
			origItems, err := parseItemsFromRecord(orig, "items")
			if err != nil || len(origItems) == 0 {
				return apis.NewBadRequestError(
					fmt.Sprintf("Items originaux invalides: %v", err),
					nil,
				)
			}

			alreadyRefunded := getRefundedItemsForTicket(dao, orig.Id)
			log.Printf("🔍 Items déjà remboursés: %v", alreadyRefunded)

			creditItems = make([]map[string]any, 0, len(origItems))
			creditTotalHT, creditTotalTVA, creditTotalTTC = 0, 0, 0

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
				if payload.Reason != "" {
					cp["refund_reason"] = payload.Reason
				}

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
				return apis.NewBadRequestError("Ticket déjà totalement remboursé (aucune quantité restante)", nil)
			}

			// Sécurité: ne pas dépasser le restant monétaire calculé (tolérance arrondi)
			if creditTotalTTC > remaining+0.01 {
				return apis.NewBadRequestError(
					fmt.Sprintf("Montant recalculé (%.2f€) dépasse le restant remboursable (%.2f€)", creditTotalTTC, remaining),
					nil,
				)
			}

			log.Printf("🔍 Full refund (par lignes): origTotal=%.2f, remaining=%.2f, creditTotalTTC=%.2f, items=%d",
				origTotal, remaining, creditTotalTTC, len(creditItems))
		}

		// Vérifier que le montant ne dépasse pas le restant
		if creditTotalTTC > remaining+0.01 {
			return apis.NewBadRequestError(
				fmt.Sprintf("Montant (%.2f€) dépasse le restant remboursable (%.2f€)", creditTotalTTC, remaining),
				nil,
			)
		}

		// 5) Générer le numéro d'avoir
		ownerCompany := orig.GetString("owner_company")
		fiscalYear := time.Now().Year()
		avoNumber, err := generateAvoirNumber(dao, ownerCompany, fiscalYear)
		if err != nil {
			return apis.NewApiError(500, "Erreur génération numéro avoir", err)
		}

		// 6) Récupérer le dernier document pour le chaînage
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

		// 7) Créer l'avoir
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
		if payload.Reason != "" {
			credit.Set("cancellation_reason", payload.Reason)
		}

		// Montants NÉGATIFS pour l'avoir
		credit.Set("items", creditItems)
		credit.Set("total_ht", -creditTotalHT)
		credit.Set("total_tva", -creditTotalTVA)
		credit.Set("total_ttc", -creditTotalTTC)

		// Chaînage NF525
		credit.Set("previous_hash", previousHash)
		credit.Set("sequence_number", sequenceNumber)
		credit.Set("is_locked", true)

		// Calculer le hash
		hash := computeRecordHash(credit)
		credit.Set("hash", hash)

		if info.AuthRecord != nil {
			credit.Set("sold_by", info.AuthRecord.Id)
		}

		if err := dao.SaveRecord(credit); err != nil {
			return apis.NewApiError(500, "Impossible de créer l'avoir", err)
		}

		log.Printf("✅ Avoir %s créé: %.2f€ (ticket: %s)", avoNumber, -creditTotalTTC, orig.GetString("number"))

		// 8) Mettre à jour le ticket original
		newCreditNotesTotal := creditNotesTotal + creditTotalTTC
		newRemaining := origTotal - newCreditNotesTotal
		if newRemaining < 0 {
			newRemaining = 0
		}

		orig.Set("has_credit_note", true)
		orig.Set("credit_notes_total", newCreditNotesTotal)
		orig.Set("remaining_amount", newRemaining)

		if err := dao.SaveRecord(orig); err != nil {
			log.Printf("⚠️ Erreur mise à jour ticket: %v", err)
		}

		log.Printf("✅ Ticket %s mis à jour: credit_notes_total=%.2f, remaining=%.2f",
			orig.GetString("number"), newCreditNotesTotal, newRemaining)

		// 9) Créer le mouvement de caisse si espèces
		var cashMovement *models.Record
		if payload.RefundMethod == "especes" && activeSession != nil {
			cmCol, err := dao.FindCollectionByNameOrId("cash_movements")
			if err == nil {
				cm := models.NewRecord(cmCol)
				cm.Set("owner_company", ownerCompany)
				cm.Set("session", activeSession.Id)
				cm.Set("movement_type", "refund_out")
				cm.Set("amount", creditTotalTTC)
				cm.Set("reason", fmt.Sprintf("Remboursement %s", avoNumber))
				cm.Set("related_invoice", credit.Id)

				if info.AuthRecord != nil {
					cm.Set("created_by", info.AuthRecord.Id)
				}

				cm.Set("meta", map[string]any{
					"source":          "pos_refund",
					"credit_note_id":  credit.Id,
					"credit_note_num": avoNumber,
					"original_ticket": orig.Id,
					"ticket_num":      orig.GetString("number"),
				})

				if err := dao.SaveRecord(cm); err != nil {
					log.Printf("⚠️ Erreur création cash_movement: %v", err)
				} else {
					cashMovement = cm
					log.Printf("✅ Mouvement caisse créé: %.2f€ (refund_out)", creditTotalTTC)
				}
			}
		}

		// 10) Recharger le ticket mis à jour
		origUpdated, _ := dao.FindRecordById("invoices", orig.Id)

		// ═══════════════════════════════════════════════════════════════════════
		// 🆕 FIX 4 - AJOUTER ICI : Calculer les items remboursables pour le frontend
		// ═══════════════════════════════════════════════════════════════════════
		refundableItems := []map[string]any{}
		if origUpdated != nil {
			origItems, _ := parseItemsFromRecord(origUpdated, "items")
			alreadyRefunded := getRefundedItemsForTicket(dao, origUpdated.Id)

			for idx, item := range origItems {
				origQty := getItemQuantity(item)
				refundedQty := alreadyRefunded[idx]
				remainingQty := origQty - refundedQty

				// Récupérer le nom de l'item
				itemName := ""
				for _, key := range []string{"name", "label", "title", "product_name"} {
					if v, ok := item[key].(string); ok && v != "" {
						itemName = v
						break
					}
				}

				refundableItems = append(refundableItems, map[string]any{
					"index":         idx,
					"name":          itemName,
					"original_qty":  origQty,
					"refunded_qty":  refundedQty,
					"remaining_qty": remainingQty,
					"can_refund":    remainingQty > 0,
				})
			}
		}

		// ═══════════════════════════════════════════════════════════════════════
		// RETURN FINAL (modifier pour inclure refundable_items)
		// ═══════════════════════════════════════════════════════════════════════
		return c.JSON(http.StatusCreated, echo.Map{
			"credit_note":      credit,
			"cash_movement":    cashMovement,
			"original_updated": origUpdated,
			"refundable_items": refundableItems, // 🆕 Ajouté
		})
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// OUVERTURE SESSION
	// ----------------------------------------------------------------------
	router.POST("/api/cash/session/open", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()

		var payload OpenSessionInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		if payload.OwnerCompany == "" || payload.CashRegister == "" {
			return apis.NewBadRequestError("Champs requis manquants", nil)
		}

		// Vérifier s'il existe déjà une session ouverte
		filter := fmt.Sprintf("cash_register = '%s' && status = 'open'", payload.CashRegister)
		existing, _ := dao.FindFirstRecordByFilter("cash_sessions", filter)

		if existing != nil {
			return apis.NewBadRequestError(
				"Une session est déjà ouverte pour cette caisse", nil)
		}

		collection, _ := dao.FindCollectionByNameOrId("cash_sessions")
		rec := models.NewRecord(collection)
		rec.Set("owner_company", payload.OwnerCompany)
		rec.Set("cash_register", payload.CashRegister)
		rec.Set("status", "open")
		rec.Set("opened_at", time.Now())
		rec.Set("opening_float", payload.OpeningFloat)

		if info.AuthRecord != nil {
			rec.Set("opened_by", info.AuthRecord.Id)
		}

		if err := dao.SaveRecord(rec); err != nil {
			return apis.NewApiError(500, "Impossible d'ouvrir la session", err)
		}

		return c.JSON(http.StatusCreated, rec)
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// SESSION ACTIVE
	// ----------------------------------------------------------------------
	router.GET("/api/cash/session/active", func(c echo.Context) error {
		dao := app.Dao()
		registerId := c.QueryParam("cash_register")

		filter := "status = 'open'"

		if registerId != "" {
			filter = fmt.Sprintf("cash_register = '%s' && status = 'open'", registerId)
		}

		rec, _ := dao.FindFirstRecordByFilter("cash_sessions", filter)

		return c.JSON(http.StatusOK, echo.Map{
			"session": rec,
		})
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// FERMETURE SESSION
	// ----------------------------------------------------------------------
	router.POST("/api/cash/session/:id/close", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()
		id := c.PathParam("id")

		rec, err := dao.FindRecordById("cash_sessions", id)
		if err != nil {
			return apis.NewNotFoundError("Session introuvable", err)
		}

		if rec.GetString("status") != "open" {
			return apis.NewBadRequestError("Session déjà fermée", nil)
		}

		var payload CloseSessionInput
		_ = c.Bind(&payload)

		rec.Set("closed_at", time.Now())
		rec.Set("status", "closed")

		if payload.CountedCashTotal > 0 {
			rec.Set("counted_cash_total", payload.CountedCashTotal)
		}
		if info.AuthRecord != nil {
			rec.Set("closed_by", info.AuthRecord.Id)
		}

		if err := dao.SaveRecord(rec); err != nil {
			return apis.NewApiError(500, "Impossible de fermer la session", err)
		}

		return c.JSON(http.StatusOK, rec)
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// MOUVEMENT DE CAISSE
	// ----------------------------------------------------------------------
	router.POST("/api/cash/movements", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()

		var payload CashMovementInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		if payload.Session == "" {
			return apis.NewBadRequestError("Session requise", nil)
		}

		// Charger la session
		sessionRec, err := dao.FindRecordById("cash_sessions", payload.Session)
		if err != nil {
			return apis.NewBadRequestError("Session inconnue", err)
		}

		col, _ := dao.FindCollectionByNameOrId("cash_movements")
		rec := models.NewRecord(col)

		rec.Set("owner_company", sessionRec.Get("owner_company"))
		rec.Set("session", payload.Session)
		rec.Set("movement_type", payload.MovementType)
		rec.Set("amount", payload.Amount)
		rec.Set("reason", payload.Reason)
		rec.Set("meta", payload.Meta)

		if info.AuthRecord != nil {
			rec.Set("created_by", info.AuthRecord.Id)
		}

		if err := dao.SaveRecord(rec); err != nil {
			return apis.NewApiError(500, "Impossible de créer le mouvement", err)
		}

		return c.JSON(http.StatusCreated, rec)
	},
		apis.RequireRecordAuth(),
	)

	// ======================================================================
	// RAPPORTS
	// ======================================================================

	// ----------------------------------------------------------------------
	// RAPPORT X (Lecture intermédiaire)
	// ----------------------------------------------------------------------
	router.GET("/api/cash/reports/x", func(c echo.Context) error {
		sessionId := c.QueryParam("session")
		if sessionId == "" {
			return apis.NewBadRequestError("Paramètre 'session' requis", nil)
		}

		rapport, err := reports.GenerateRapportX(app, sessionId)
		if err != nil {
			return apis.NewApiError(500, err.Error(), err)
		}

		return c.JSON(http.StatusOK, rapport)
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// RAPPORT Z (Clôture journalière) - GÉNÉRATION
	// ----------------------------------------------------------------------
	router.GET("/api/cash/reports/z", func(c echo.Context) error {
		cashRegisterId := c.QueryParam("cash_register")
		date := c.QueryParam("date")

		fmt.Printf("\n📝 === RAPPORT Z DEMANDÉ ===\n")
		fmt.Printf("Caisse ID: %s\n", cashRegisterId)
		fmt.Printf("Date: %s\n", date)

		if cashRegisterId == "" || date == "" {
			return apis.NewBadRequestError("Paramètres 'cash_register' et 'date' requis", nil)
		}

		rapport, err := reports.GenerateRapportZ(app, cashRegisterId, date)
		if err != nil {
			fmt.Printf("❌ ERREUR: %v\n", err)
			return apis.NewApiError(500, err.Error(), err)
		}

		fmt.Printf("✅ Rapport généré avec succès: %s\n", rapport.Number)
		return c.JSON(http.StatusOK, rapport)
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// 🆕 LISTE DES RAPPORTS Z
	// ----------------------------------------------------------------------
	router.GET("/api/cash/reports/z/list", func(c echo.Context) error {
		cashRegisterId := c.QueryParam("cash_register")
		if cashRegisterId == "" {
			return apis.NewBadRequestError("Paramètre 'cash_register' requis", nil)
		}

		limit := 50
		if l := c.QueryParam("limit"); l != "" {
			if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
				limit = parsed
			}
		}

		items, err := reports.ListZReports(app, cashRegisterId, limit)
		if err != nil {
			return apis.NewApiError(500, "Erreur chargement rapports Z", err)
		}

		return c.JSON(http.StatusOK, echo.Map{
			"reports": items,
			"count":   len(items),
		})
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// 🆕 CHARGER UN RAPPORT Z PAR ID
	// ----------------------------------------------------------------------
	router.GET("/api/cash/reports/z/:id", func(c echo.Context) error {
		dao := app.Dao()
		id := c.PathParam("id")

		record, err := dao.FindRecordById("z_reports", id)
		if err != nil {
			return apis.NewNotFoundError("Rapport Z introuvable", err)
		}

		// Retourner le rapport complet stocké
		fullReport := record.Get("full_report")

		return c.JSON(http.StatusOK, echo.Map{
			"id":           record.Id,
			"number":       record.GetString("number"),
			"date":         record.GetString("date"),
			"hash":         record.GetString("hash"),
			"full_report":  fullReport,
			"generated_at": record.GetString("generated_at"),
		})
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// 🆕 VÉRIFIER SI UN RAPPORT Z EXISTE DÉJÀ
	// ----------------------------------------------------------------------
	router.GET("/api/cash/reports/z/check", func(c echo.Context) error {
		dao := app.Dao()
		cashRegisterId := c.QueryParam("cash_register")
		date := c.QueryParam("date")

		if cashRegisterId == "" || date == "" {
			return apis.NewBadRequestError("Paramètres 'cash_register' et 'date' requis", nil)
		}

		filter := fmt.Sprintf(
			"cash_register = '%s' && date ~ '%s'",
			cashRegisterId,
			date,
		)

		existing, _ := dao.FindFirstRecordByFilter("z_reports", filter)

		if existing != nil {
			return c.JSON(http.StatusOK, echo.Map{
				"exists":    true,
				"report_id": existing.Id,
				"number":    existing.GetString("number"),
				"message":   "Un rapport Z existe déjà pour cette date",
			})
		}

		// Compter les sessions disponibles
		dateStart, _ := time.Parse("2006-01-02", date)
		dateEnd := dateStart.Add(24 * time.Hour)
		dateStartStr := dateStart.Format("2006-01-02") + " 00:00:00"
		dateEndStr := dateEnd.Format("2006-01-02") + " 00:00:00"

		sessionsFilter := fmt.Sprintf(
			"cash_register = '%s' && status = 'closed' && closed_at >= '%s' && closed_at < '%s' && (z_report_id = '' || z_report_id = null)",
			cashRegisterId,
			dateStartStr,
			dateEndStr,
		)

		sessions, _ := dao.FindRecordsByFilter("cash_sessions", sessionsFilter, "", 0, 0)

		return c.JSON(http.StatusOK, echo.Map{
			"exists":             false,
			"available_sessions": len(sessions),
			"can_generate":       len(sessions) > 0,
			"message":            fmt.Sprintf("%d session(s) disponible(s) pour ce rapport", len(sessions)),
		})
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// DÉTAIL SESSION
	// ----------------------------------------------------------------------
	router.GET("/api/cash/session/:id/report", func(c echo.Context) error {
		dao := app.Dao()
		sessionId := c.PathParam("id")

		session, err := dao.FindRecordById("cash_sessions", sessionId)
		if err != nil {
			return apis.NewNotFoundError("Session introuvable", err)
		}

		movementsFilter := fmt.Sprintf("session = '%s'", sessionId)
		movements, err := dao.FindRecordsByFilter(
			"cash_movements",
			movementsFilter,
			"created",
			0,
			0,
		)

		if err != nil {
			return apis.NewApiError(500, "Erreur chargement mouvements", err)
		}

		return c.JSON(http.StatusOK, echo.Map{
			"session":   session,
			"movements": movements,
		})
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// HISTORIQUE SESSIONS
	// ----------------------------------------------------------------------
	router.GET("/api/cash/sessions", func(c echo.Context) error {
		dao := app.Dao()

		cashRegister := c.QueryParam("cash_register")
		status := c.QueryParam("status")
		dateFrom := c.QueryParam("date_from")
		dateTo := c.QueryParam("date_to")

		page := 1
		if p := c.QueryParam("page"); p != "" {
			if parsed, err := strconv.Atoi(p); err == nil {
				page = parsed
			}
		}

		perPage := 50
		if pp := c.QueryParam("perPage"); pp != "" {
			if parsed, err := strconv.Atoi(pp); err == nil {
				perPage = parsed
			}
		}

		var filters []string

		if cashRegister != "" {
			filters = append(filters, fmt.Sprintf("cash_register = '%s'", cashRegister))
		}

		if status != "" {
			filters = append(filters, fmt.Sprintf("status = '%s'", status))
		}

		if dateFrom != "" {
			dateStart, err := time.Parse("2006-01-02", dateFrom)
			if err == nil {
				filters = append(filters, fmt.Sprintf("opened_at >= '%s'", dateStart.Format(time.RFC3339)))
			}
		}

		if dateTo != "" {
			dateEnd, err := time.Parse("2006-01-02", dateTo)
			if err == nil {
				dateEnd = dateEnd.Add(24 * time.Hour)
				filters = append(filters, fmt.Sprintf("opened_at < '%s'", dateEnd.Format(time.RFC3339)))
			}
		}

		var finalFilter string
		if len(filters) > 0 {
			finalFilter = strings.Join(filters, " && ")
		}

		result, err := dao.FindRecordsByFilter(
			"cash_sessions",
			finalFilter,
			"-opened_at",
			perPage,
			(page-1)*perPage,
		)

		if err != nil {
			return apis.NewApiError(500, "Erreur chargement sessions", err)
		}

		return c.JSON(http.StatusOK, echo.Map{
			"sessions":   result,
			"page":       page,
			"perPage":    perPage,
			"totalItems": len(result),
		})
	},
		apis.RequireRecordAuth(),
	)

}

func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

// generateAvoirNumber génère un numéro d'avoir AVO-YYYY-NNNNNN
func generateAvoirNumber(dao *daos.Dao, ownerCompany string, fiscalYear int) (string, error) {
	prefix := fmt.Sprintf("AVO-%d-", fiscalYear)

	filter := fmt.Sprintf(
		"owner_company = '%s' && number ~ '%s'",
		ownerCompany, prefix,
	)

	records, err := dao.FindRecordsByFilter(
		"invoices",
		filter,
		"-created",
		1,
		0,
	)

	nextSeq := 1
	if err == nil && len(records) > 0 {
		lastNumber := records[0].GetString("number")
		// Extraire le numéro de séquence
		parts := strings.Split(lastNumber, "-")
		if len(parts) == 3 {
			if seq, err := strconv.Atoi(parts[2]); err == nil {
				nextSeq = seq + 1
			}
		}
	}

	return fmt.Sprintf("%s%06d", prefix, nextSeq), nil
}

// getLastInvoiceForCompany récupère le dernier document pour le chaînage
func getLastInvoiceForCompany(dao *daos.Dao, ownerCompany string) (*models.Record, error) {
	records, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("owner_company = '%s' && sequence_number > 0", ownerCompany),
		"-sequence_number",
		1,
		0,
	)
	if err != nil || len(records) == 0 {
		return nil, err
	}
	return records[0], nil
}

// getItemQuantity extrait la quantité d'un item
func getItemQuantity(item map[string]any) float64 {
	for _, key := range []string{"quantity", "qty", "qte"} {
		if v, ok := item[key]; ok {
			switch t := v.(type) {
			case float64:
				return t
			case int:
				return float64(t)
			case int64:
				return float64(t)
			}
		}
	}
	return 1
}

// computeItemTotals recalcule les totaux d'un item pour une quantité donnée
func computeItemTotals(item map[string]any, qty float64) (ht, tva, ttc float64) {
	origQty := getItemQuantity(item)
	if origQty <= 0 {
		origQty = 1
	}

	ratio := qty / origQty

	// Essayer d'utiliser les totaux existants
	if v, ok := item["total_ttc"].(float64); ok && v != 0 {
		ttc = v * ratio
		if vHT, ok := item["total_ht"].(float64); ok {
			ht = vHT * ratio
		}
		if vTVA, ok := item["total_tva"].(float64); ok {
			tva = vTVA * ratio
		}
		if ht == 0 && tva == 0 {
			tva = ttc - ht
		}
		return
	}

	// Sinon calculer depuis le prix unitaire
	var unitHT float64
	for _, key := range []string{"unit_price_ht", "price_ht", "unit_ht"} {
		if v, ok := item[key].(float64); ok && v != 0 {
			unitHT = v
			break
		}
	}

	var vatRate float64
	for _, key := range []string{"vat_rate", "tva_rate", "tax_rate"} {
		if v, ok := item[key].(float64); ok {
			vatRate = v
			break
		}
	}

	ht = unitHT * qty
	tva = ht * (vatRate / 100)
	ttc = ht + tva
	return
}

// computeRecordHash calcule le hash SHA-256 d'un record
func computeRecordHash(record *models.Record) string {
	data := map[string]any{
		"number":          record.GetString("number"),
		"invoice_type":    record.GetString("invoice_type"),
		"customer":        record.GetString("customer"),
		"owner_company":   record.GetString("owner_company"),
		"date":            record.GetString("date"),
		"total_ht":        record.GetFloat("total_ht"),
		"total_tva":       record.GetFloat("total_tva"),
		"total_ttc":       record.GetFloat("total_ttc"),
		"previous_hash":   record.GetString("previous_hash"),
		"sequence_number": record.GetInt("sequence_number"),
		"fiscal_year":     record.GetInt("fiscal_year"),
	}

	if orig := record.GetString("original_invoice_id"); orig != "" {
		data["original_invoice_id"] = orig
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
	return hex.EncodeToString(hash[:])
}

// sumCreditNotesForTicket calcule la somme des avoirs existants pour un ticket
func sumCreditNotesForTicket(dao *daos.Dao, ticketID string) float64 {
	records, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("invoice_type = 'credit_note' && original_invoice_id = '%s'", ticketID),
		"",
		500,
		0,
	)
	if err != nil {
		return 0
	}

	sum := 0.0
	for _, r := range records {
		ttc := r.GetFloat("total_ttc")
		if ttc < 0 {
			ttc = -ttc
		}
		sum += ttc
	}
	return sum
}

// getRefundedItemsForTicket retourne les items déjà remboursés avec leurs quantités
func getRefundedItemsForTicket(dao *daos.Dao, ticketID string) map[int]float64 {
	refunded := make(map[int]float64) // index -> quantité remboursée

	records, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("invoice_type = 'credit_note' && original_invoice_id = '%s'", ticketID),
		"",
		500,
		0,
	)
	if err != nil {
		return refunded
	}

	for _, r := range records {
		items, err := parseItemsFromRecord(r, "items")
		if err != nil {
			continue
		}

		for _, item := range items {
			// Récupérer l'index original si présent
			if idxRaw, ok := item["original_item_index"]; ok {
				var idx int
				switch v := idxRaw.(type) {
				case float64:
					idx = int(v)
				case int:
					idx = v
				case int64:
					idx = int(v)
				default:
					continue
				}

				qty := getItemQuantity(item)
				refunded[idx] += qty
			}
		}
	}

	return refunded
}
