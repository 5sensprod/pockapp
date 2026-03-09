// backend/routes/pos_routes.go
// 🎫 ROUTES API POS - Création de tickets avec logique métier centralisée
// ✅ VERSION MULTIPAIEMENT - payments[] JSON avec montant libre par moyen

package routes

import (
	"fmt"
	"log"
	"math"
	"net/http"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend/hash"
)

// ============================================================================
// CONSTANTES
// ============================================================================

const (
	GENESIS_HASH_POS = "0000000000000000000000000000000000000000000000000000000000000000"
	NumberPaddingPOS = 6
)

// ============================================================================
// DTOs - STRUCTURES D'ENTRÉE
// ============================================================================

// PosPaymentEntry représente une ligne de paiement dans un règlement multipaiement.
type PosPaymentEntry struct {
	MethodCode         string  `json:"method_code"`
	MethodLabel        string  `json:"method_label"`
	AccountingCategory string  `json:"accounting_category"` // cash | card | check | transfer | other
	Amount             float64 `json:"amount"`
	AmountReceived     float64 `json:"amount_received,omitempty"` // Pour les espèces uniquement
}

// PosTicketInput représente le payload envoyé par le frontend POS.
type PosTicketInput struct {
	// Contexte obligatoire
	OwnerCompany string `json:"owner_company"`
	CashRegister string `json:"cash_register"`
	SessionID    string `json:"session_id"`
	CustomerID   string `json:"customer_id"`

	// Panier
	Items []PosItemInput `json:"items"`

	// ✅ MULTIPAIEMENT : nouvelle liste de paiements
	// Si Payments est renseigné, il prend la priorité.
	Payments []PosPaymentEntry `json:"payments,omitempty"`

	// Rétrocompatibilité : champs mono-paiement (ignorés si Payments est renseigné)
	PaymentMethod      string  `json:"payment_method,omitempty"`
	PaymentMethodLabel string  `json:"payment_method_label,omitempty"`
	AmountPaid         float64 `json:"amount_paid,omitempty"`

	// Remises globales (optionnel)
	CartDiscountMode  string  `json:"cart_discount_mode,omitempty"`
	CartDiscountValue float64 `json:"cart_discount_value,omitempty"`
}

// PosItemInput représente un item du panier
type PosItemInput struct {
	ProductID    string  `json:"product_id"`
	Name         string  `json:"name"`
	Designation  string  `json:"designation,omitempty"`
	SKU          string  `json:"sku,omitempty"`
	Quantity     float64 `json:"quantity"`
	UnitPriceTTC float64 `json:"unit_price_ttc"`
	TVARate      float64 `json:"tva_rate"`

	LineDiscountMode  string  `json:"line_discount_mode,omitempty"`
	LineDiscountValue float64 `json:"line_discount_value,omitempty"`
}

// PosTicketResult représente la réponse de création
type PosTicketResult struct {
	Ticket       *models.Record `json:"ticket"`
	CashMovement *models.Record `json:"cash_movement,omitempty"`
	Change       float64        `json:"change,omitempty"`
	Totals       TicketTotals   `json:"totals"`
}

// TicketTotals contient les totaux calculés
type TicketTotals struct {
	SubtotalTTC           float64             `json:"subtotal_ttc"`
	LineDiscountsTotalTTC float64             `json:"line_discounts_total_ttc"`
	CartDiscountTTC       float64             `json:"cart_discount_ttc"`
	TotalHT               float64             `json:"total_ht"`
	TotalTVA              float64             `json:"total_tva"`
	TotalTTC              float64             `json:"total_ttc"`
	VATBreakdown          []VATBreakdownEntry `json:"vat_breakdown"`
}

// VATBreakdownEntry représente une entrée de ventilation TVA
type VATBreakdownEntry struct {
	Rate     float64 `json:"rate"`
	BaseHT   float64 `json:"base_ht"`
	VAT      float64 `json:"vat"`
	TotalTTC float64 `json:"total_ttc"`
}

// ============================================================================
// normalizePayments : rétrocompatibilité mono → multi
// ============================================================================

// normalizePayments s'assure qu'on a toujours une liste Payments cohérente.
// Si le frontend envoie payments[] → on les utilise.
// Sinon on convertit l'ancien champ payment_method en une entrée unique.
func normalizePayments(input *PosTicketInput) []PosPaymentEntry {
	if len(input.Payments) > 0 {
		return input.Payments
	}

	// Fallback : ancienne API mono-paiement
	method := input.PaymentMethod
	if method == "" {
		method = "especes"
	}

	// Deviner accounting_category depuis le code (heuristique legacy)
	category := "other"
	switch method {
	case "especes", "cash":
		category = "cash"
	case "cb", "card":
		category = "card"
	case "cheque", "check":
		category = "check"
	case "virement", "transfer":
		category = "transfer"
	}

	label := input.PaymentMethodLabel
	if label == "" {
		label = method
	}

	amountReceived := 0.0
	if category == "cash" {
		amountReceived = input.AmountPaid
	}

	return []PosPaymentEntry{
		{
			MethodCode:         method,
			MethodLabel:        label,
			AccountingCategory: category,
			Amount:             0, // sera rempli avec TotalTTC dans la route
			AmountReceived:     amountReceived,
		},
	}
}

// ============================================================================
// REGISTRATION DES ROUTES
// ============================================================================

func RegisterPosRoutes(app *pocketbase.PocketBase, router *echo.Echo) {

	// -------------------------------------------------------------------------
	// POST /api/pos/ticket - Créer un ticket de caisse
	// -------------------------------------------------------------------------
	router.POST("/api/pos/ticket", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()

		// 1) Parser le payload
		var input PosTicketInput
		if err := c.Bind(&input); err != nil {
			return apis.NewBadRequestError("Corps de requête invalide", err)
		}

		// 2) Validations obligatoires
		if input.OwnerCompany == "" {
			return apis.NewBadRequestError("owner_company requis", nil)
		}
		if input.CashRegister == "" {
			return apis.NewBadRequestError("cash_register requis", nil)
		}
		if input.SessionID == "" {
			return apis.NewBadRequestError("session_id requis", nil)
		}
		if input.CustomerID == "" {
			return apis.NewBadRequestError("customer_id requis", nil)
		}
		if len(input.Items) == 0 {
			return apis.NewBadRequestError("items requis (panier vide)", nil)
		}

		// 3) Vérifier que la session est ouverte
		session, err := dao.FindRecordById("cash_sessions", input.SessionID)
		if err != nil || session == nil {
			return apis.NewNotFoundError("Session introuvable", err)
		}
		if session.GetString("status") != "open" {
			return apis.NewBadRequestError("La session de caisse n'est pas ouverte", nil)
		}
		if session.GetString("cash_register") != input.CashRegister {
			return apis.NewBadRequestError("La session n'appartient pas à cette caisse", nil)
		}

		// 4) Vérifier que la caisse existe et est active
		register, err := dao.FindRecordById("cash_registers", input.CashRegister)
		if err != nil || register == nil {
			return apis.NewNotFoundError("Caisse introuvable", err)
		}
		if !register.GetBool("is_active") {
			return apis.NewBadRequestError("Cette caisse est désactivée", nil)
		}

		// 5) Calculer les totaux
		totals, processedItems, err := calculateTicketTotals(input)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		// 6) Normaliser et valider les paiements
		payments := normalizePayments(&input)

		// Pour le fallback mono-paiement, remplir le montant avec TotalTTC
		if len(input.Payments) == 0 && len(payments) == 1 {
			payments[0].Amount = totals.TotalTTC
		}

		// Valider que la somme des paiements couvre le total
		var totalPaid float64
		for _, p := range payments {
			if p.Amount <= 0 {
				return apis.NewBadRequestError(
					fmt.Sprintf("Montant invalide pour le moyen '%s'", p.MethodCode), nil)
			}
			totalPaid = roundAmount(totalPaid + p.Amount)
		}

		if totalPaid < totals.TotalTTC-0.005 {
			return apis.NewBadRequestError(
				fmt.Sprintf("Paiements insuffisants: %.2f€ reçus, %.2f€ attendus",
					totalPaid, totals.TotalTTC), nil)
		}

		// Calculer la monnaie à rendre (sur la totalité des espèces)
		var totalCashPaid float64
		var totalCashReceived float64
		for _, p := range payments {
			if p.AccountingCategory == "cash" {
				totalCashPaid = roundAmount(totalCashPaid + p.Amount)
				if p.AmountReceived > 0 {
					totalCashReceived = roundAmount(totalCashReceived + p.AmountReceived)
				} else {
					totalCashReceived = roundAmount(totalCashReceived + p.Amount)
				}
			}
		}
		// Monnaie = excédent espèces - (total - non-espèces)
		nonCashPaid := roundAmount(totalPaid - totalCashPaid)
		change := roundAmount(math.Max(0, totalCashReceived-(totals.TotalTTC-nonCashPaid)))

		// 7) Déterminer le moyen principal (pour champ texte rétrocompat)
		mainMethodCode := payments[0].MethodCode
		mainMethodLabel := payments[0].MethodLabel
		if len(payments) > 1 {
			mainMethodCode = "multi"
			mainMethodLabel = ""
			for i, p := range payments {
				if i > 0 {
					mainMethodLabel += " + "
				}
				mainMethodLabel += p.MethodLabel
			}
		}

		// 8) Générer le numéro et le chaînage
		fiscalYear := time.Now().Year()
		ticketNumber, err := generateTicketNumber(dao, input.OwnerCompany, fiscalYear)
		if err != nil {
			return apis.NewApiError(500, "Erreur génération numéro", err)
		}

		previousHash, sequenceNumber := getTicketChainInfo(dao, input.OwnerCompany)

		// 9) Créer le ticket
		invoicesCol, err := dao.FindCollectionByNameOrId("invoices")
		if err != nil {
			return apis.NewApiError(500, "Collection invoices introuvable", err)
		}

		ticket := models.NewRecord(invoicesCol)

		// Identification
		ticket.Set("number", ticketNumber)
		ticket.Set("invoice_type", "invoice")
		ticket.Set("owner_company", input.OwnerCompany)
		ticket.Set("customer", input.CustomerID)
		ticket.Set("currency", "EUR")
		ticket.Set("fiscal_year", fiscalYear)

		// Dates
		now := time.Now()
		ticket.Set("date", now.Format("2006-01-02"))

		// POS
		ticket.Set("is_pos_ticket", true)
		ticket.Set("cash_register", input.CashRegister)
		ticket.Set("session", input.SessionID)

		// Statut
		ticket.Set("status", "validated")
		ticket.Set("is_paid", true)
		ticket.Set("paid_at", now.Format(time.RFC3339))

		// Paiement - champs rétrocompat (mono)
		ticket.Set("payment_method", mainMethodCode)
		if mainMethodLabel != "" {
			ticket.Set("payment_method_label", mainMethodLabel)
		}

		// ✅ Paiement - champ multipaiement (JSON array)
		// Construire une représentation sérialisable
		paymentsData := make([]map[string]any, len(payments))
		for i, p := range payments {
			paymentsData[i] = map[string]any{
				"method_code":         p.MethodCode,
				"method_label":        p.MethodLabel,
				"accounting_category": p.AccountingCategory,
				"amount":              p.Amount,
			}
			if p.AccountingCategory == "cash" {
				received := p.AmountReceived
				if received <= 0 {
					received = p.Amount
				}
				paymentsData[i]["amount_received"] = received
			}
		}
		ticket.Set("payments", paymentsData)

		// Items et totaux
		ticket.Set("items", processedItems)
		ticket.Set("total_ht", totals.TotalHT)
		ticket.Set("total_tva", totals.TotalTVA)
		ticket.Set("total_ttc", totals.TotalTTC)
		ticket.Set("vat_breakdown", totals.VATBreakdown)

		// Remises
		if totals.LineDiscountsTotalTTC > 0 {
			ticket.Set("line_discounts_total_ttc", totals.LineDiscountsTotalTTC)
		}
		if totals.CartDiscountTTC > 0 {
			ticket.Set("cart_discount_mode", input.CartDiscountMode)
			ticket.Set("cart_discount_value", input.CartDiscountValue)
			ticket.Set("cart_discount_ttc", totals.CartDiscountTTC)
		}

		// Chaînage NF525
		ticket.Set("previous_hash", previousHash)
		ticket.Set("sequence_number", sequenceNumber)
		ticket.Set("is_locked", true)

		// Remboursement
		ticket.Set("remaining_amount", totals.TotalTTC)
		ticket.Set("credit_notes_total", 0)
		ticket.Set("has_credit_note", false)

		// Vendeur
		if info.AuthRecord != nil {
			ticket.Set("sold_by", info.AuthRecord.Id)
		}

		// Hash
		hashValue := hash.ComputeDocumentHash(ticket)
		ticket.Set("hash", hashValue)
		ticket.Set("_skip_hook_processing", true)

		if err := dao.SaveRecord(ticket); err != nil {
			return apis.NewApiError(500, "Erreur création ticket", err)
		}

		log.Printf("✅ Ticket %s créé: %.2f€ TTC | %d moyen(s) | session: %s",
			ticketNumber, totals.TotalTTC, len(payments), input.SessionID)

		// 10) Créer les mouvements de caisse (une entrée par ligne espèces)
		var lastCashMovement *models.Record
		cmCol, cmErr := dao.FindCollectionByNameOrId("cash_movements")

		if cmErr == nil {
			for i, p := range payments {
				if p.AccountingCategory != "cash" {
					continue
				}

				received := p.AmountReceived
				if received <= 0 {
					received = p.Amount
				}

				// Monnaie sur cette ligne espèces (seulement si c'est la dernière)
				lineChange := 0.0
				if i == len(payments)-1 {
					lineChange = change
				}

				cm := models.NewRecord(cmCol)
				cm.Set("owner_company", input.OwnerCompany)
				cm.Set("session", input.SessionID)
				cm.Set("movement_type", "cash_in")
				cm.Set("amount", p.Amount)
				cm.Set("reason", fmt.Sprintf("Vente ticket %s (%s)", ticketNumber, p.MethodLabel))
				cm.Set("related_invoice", ticket.Id)

				if info.AuthRecord != nil {
					cm.Set("created_by", info.AuthRecord.Id)
				}

				cm.Set("meta", map[string]any{
					"source":         "pos_ticket_sale",
					"invoice_id":     ticket.Id,
					"invoice_number": ticketNumber,
					"method_code":    p.MethodCode,
					"amount_paid":    received,
					"change":         lineChange,
					"is_multi":       len(payments) > 1,
				})

				if err := dao.SaveRecord(cm); err != nil {
					log.Printf("⚠️ Erreur création cash_movement ligne %d: %v", i, err)
				} else {
					lastCashMovement = cm
					log.Printf("✅ Mouvement caisse: %.2f€ cash_in (%s)", p.Amount, p.MethodLabel)
				}
			}
		}

		// 11) Retourner le résultat
		return c.JSON(http.StatusCreated, PosTicketResult{
			Ticket:       ticket,
			CashMovement: lastCashMovement,
			Change:       change,
			Totals:       totals,
		})
	},
		apis.RequireRecordAuth(),
	)

	// -------------------------------------------------------------------------
	// GET /api/pos/ticket/:id - Récupérer un ticket avec ses détails
	// -------------------------------------------------------------------------
	router.GET("/api/pos/ticket/:id", func(c echo.Context) error {
		dao := app.Dao()
		ticketId := c.PathParam("id")

		ticket, err := dao.FindRecordById("invoices", ticketId)
		if err != nil || ticket == nil {
			return apis.NewNotFoundError("Ticket introuvable", err)
		}

		if !ticket.GetBool("is_pos_ticket") {
			return apis.NewBadRequestError("Ce document n'est pas un ticket POS", nil)
		}

		creditNotes, _ := dao.FindRecordsByFilter(
			"invoices",
			fmt.Sprintf("invoice_type = 'credit_note' && original_invoice_id = '%s'", ticketId),
			"-created",
			50,
			0,
		)

		return c.JSON(http.StatusOK, echo.Map{
			"ticket":       ticket,
			"credit_notes": creditNotes,
			"can_refund":   ticket.GetFloat("remaining_amount") > 0.01,
		})
	},
		apis.RequireRecordAuth(),
	)

	// -------------------------------------------------------------------------
	// GET /api/pos/session/:id/tickets - Liste des tickets d'une session
	// -------------------------------------------------------------------------
	router.GET("/api/pos/session/:id/tickets", func(c echo.Context) error {
		dao := app.Dao()
		sessionId := c.PathParam("id")

		tickets, err := dao.FindRecordsByFilter(
			"invoices",
			fmt.Sprintf("session = '%s' && is_pos_ticket = true", sessionId),
			"-created",
			500,
			0,
		)

		if err != nil {
			return apis.NewApiError(500, "Erreur chargement tickets", err)
		}

		var totalTTC float64
		var countInvoices, countCreditNotes int

		for _, t := range tickets {
			if t.GetString("invoice_type") == "credit_note" {
				countCreditNotes++
				totalTTC -= math.Abs(t.GetFloat("total_ttc"))
			} else {
				countInvoices++
				totalTTC += t.GetFloat("total_ttc")
			}
		}

		return c.JSON(http.StatusOK, echo.Map{
			"tickets":            tickets,
			"count":              len(tickets),
			"invoices_count":     countInvoices,
			"credit_notes_count": countCreditNotes,
			"net_total_ttc":      roundAmount(totalTTC),
		})
	},
		apis.RequireRecordAuth(),
	)
}

// ============================================================================
// FONCTIONS DE CALCUL (inchangées)
// ============================================================================

func calculateTicketTotals(input PosTicketInput) (TicketTotals, []map[string]any, error) {
	var totals TicketTotals
	processedItems := make([]map[string]any, 0, len(input.Items))
	vatMap := make(map[float64]*VATBreakdownEntry)

	for i, item := range input.Items {
		if item.Quantity <= 0 {
			return totals, nil, fmt.Errorf("items[%d]: quantité invalide", i)
		}
		if item.UnitPriceTTC < 0 {
			return totals, nil, fmt.Errorf("items[%d]: prix invalide", i)
		}

		baseTTC := roundAmount(item.UnitPriceTTC * item.Quantity)

		lineDiscountTTC := 0.0
		if item.LineDiscountMode == "percent" && item.LineDiscountValue > 0 {
			pct := clampFloat(item.LineDiscountValue, 0, 100)
			lineDiscountTTC = roundAmount(baseTTC * pct / 100)
		} else if item.LineDiscountMode == "amount" && item.LineDiscountValue > 0 {
			lineDiscountTTC = roundAmount(clampFloat(item.LineDiscountValue, 0, baseTTC))
		}

		lineTTC := roundAmount(baseTTC - lineDiscountTTC)

		tvaRate := item.TVARate
		if tvaRate < 0 {
			tvaRate = 20
		}
		coef := 1 + tvaRate/100
		lineHT := roundAmount(lineTTC / coef)
		lineTVA := roundAmount(lineTTC - lineHT)
		unitHT := roundAmount(lineHT / item.Quantity)

		if _, exists := vatMap[tvaRate]; !exists {
			vatMap[tvaRate] = &VATBreakdownEntry{Rate: tvaRate}
		}
		vatMap[tvaRate].BaseHT += lineHT
		vatMap[tvaRate].VAT += lineTVA
		vatMap[tvaRate].TotalTTC += lineTTC

		totals.SubtotalTTC += baseTTC
		totals.LineDiscountsTotalTTC += lineDiscountTTC

		processedItem := map[string]any{
			"product_id":    item.ProductID,
			"name":          item.Name,
			"quantity":      item.Quantity,
			"unit_price_ht": unitHT,
			"tva_rate":      tvaRate,
			"total_ht":      lineHT,
			"total_ttc":     lineTTC,
		}

		if item.Designation != "" {
			processedItem["designation"] = item.Designation
		}
		if item.SKU != "" {
			processedItem["sku"] = item.SKU
		}
		if lineDiscountTTC > 0 {
			processedItem["line_discount_mode"] = item.LineDiscountMode
			processedItem["line_discount_value"] = item.LineDiscountValue
			processedItem["line_discount_ttc"] = lineDiscountTTC
			processedItem["unit_price_ttc_before_discount"] = item.UnitPriceTTC
		}

		processedItems = append(processedItems, processedItem)
	}

	subtotalAfterLineDiscounts := roundAmount(totals.SubtotalTTC - totals.LineDiscountsTotalTTC)

	if input.CartDiscountMode == "percent" && input.CartDiscountValue > 0 {
		pct := clampFloat(input.CartDiscountValue, 0, 100)
		totals.CartDiscountTTC = roundAmount(subtotalAfterLineDiscounts * pct / 100)
	} else if input.CartDiscountMode == "amount" && input.CartDiscountValue > 0 {
		totals.CartDiscountTTC = roundAmount(clampFloat(input.CartDiscountValue, 0, subtotalAfterLineDiscounts))
	}

	if totals.CartDiscountTTC > 0 && subtotalAfterLineDiscounts > 0 {
		vatMap = make(map[float64]*VATBreakdownEntry)
		remaining := totals.CartDiscountTTC

		for i, item := range processedItems {
			lineTTC := item["total_ttc"].(float64)
			tvaRate := item["tva_rate"].(float64)

			var lineCartDiscount float64
			if i == len(processedItems)-1 {
				lineCartDiscount = remaining
			} else {
				lineCartDiscount = roundAmount(totals.CartDiscountTTC * lineTTC / subtotalAfterLineDiscounts)
			}
			remaining = roundAmount(remaining - lineCartDiscount)

			newLineTTC := roundAmount(lineTTC - lineCartDiscount)
			coef := 1 + tvaRate/100
			newLineHT := roundAmount(newLineTTC / coef)
			newLineTVA := roundAmount(newLineTTC - newLineHT)
			qty := item["quantity"].(float64)
			newUnitHT := roundAmount(newLineHT / qty)

			processedItems[i]["unit_price_ht"] = newUnitHT
			processedItems[i]["total_ht"] = newLineHT
			processedItems[i]["total_ttc"] = newLineTTC

			if _, exists := vatMap[tvaRate]; !exists {
				vatMap[tvaRate] = &VATBreakdownEntry{Rate: tvaRate}
			}
			vatMap[tvaRate].BaseHT += newLineHT
			vatMap[tvaRate].VAT += newLineTVA
			vatMap[tvaRate].TotalTTC += newLineTTC
		}
	}

	totals.TotalHT = 0
	totals.TotalTVA = 0
	totals.TotalTTC = 0
	totals.VATBreakdown = make([]VATBreakdownEntry, 0, len(vatMap))

	for _, entry := range vatMap {
		entry.BaseHT = roundAmount(entry.BaseHT)
		entry.VAT = roundAmount(entry.VAT)
		entry.TotalTTC = roundAmount(entry.TotalTTC)

		totals.TotalHT += entry.BaseHT
		totals.TotalTVA += entry.VAT
		totals.TotalTTC += entry.TotalTTC

		totals.VATBreakdown = append(totals.VATBreakdown, *entry)
	}

	totals.SubtotalTTC = roundAmount(totals.SubtotalTTC)
	totals.LineDiscountsTotalTTC = roundAmount(totals.LineDiscountsTotalTTC)
	totals.CartDiscountTTC = roundAmount(totals.CartDiscountTTC)
	totals.TotalHT = roundAmount(totals.TotalHT)
	totals.TotalTVA = roundAmount(totals.TotalTVA)
	totals.TotalTTC = roundAmount(totals.TotalTTC)

	expectedTTC := roundAmount(totals.TotalHT + totals.TotalTVA)
	if math.Abs(expectedTTC-totals.TotalTTC) > 0.01 {
		totals.TotalTVA = roundAmount(totals.TotalTTC - totals.TotalHT)
	}

	return totals, processedItems, nil
}

func roundAmount(amount float64) float64 {
	return math.Round(amount*100) / 100
}

func clampFloat(val, min, max float64) float64 {
	if val < min {
		return min
	}
	if val > max {
		return max
	}
	return val
}

func generateTicketNumber(dao *daos.Dao, ownerCompany string, fiscalYear int) (string, error) {
	prefix := fmt.Sprintf("TIK-%d-", fiscalYear)

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
		var seq int
		if _, err := fmt.Sscanf(lastNumber, "TIK-%d-%d", new(int), &seq); err == nil {
			nextSeq = seq + 1
		}
	}

	return fmt.Sprintf("%s%0*d", prefix, NumberPaddingPOS, nextSeq), nil
}

func getTicketChainInfo(dao *daos.Dao, ownerCompany string) (string, int) {
	records, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("owner_company = '%s' && sequence_number > 0", ownerCompany),
		"-sequence_number",
		1,
		0,
	)

	if err != nil || len(records) == 0 {
		return GENESIS_HASH_POS, 1
	}

	lastInvoice := records[0]
	return lastInvoice.GetString("hash"), lastInvoice.GetInt("sequence_number") + 1
}
