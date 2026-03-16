// backend/routes/deposit_routes.go
// Routes HTTP pour la gestion des acomptes et factures de solde.
//
// POST /api/invoices/deposit          → Créer une facture d'acompte
// POST /api/invoices/balance          → Générer la facture de solde
// GET  /api/invoices/:id/deposits     → Lister les acomptes d'une facture
// POST /api/invoices/deposit/refund   → Rembourser un acompte (créer un avoir)

package routes

import (
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend"
	"pocket-react/backend/hash"
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

	// ──────────────────────────────────────────────────────────────────────────
	// POST /api/invoices/deposit/refund
	// Rembourse un acompte : crée un avoir (AVO-YYYY-XXXXXX) et met à jour
	// deposits_total_ttc + balance_due sur la facture parente.
	// ──────────────────────────────────────────────────────────────────────────
	router.POST("/api/invoices/deposit/refund", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()

		var payload struct {
			DepositID string `json:"deposit_id"`
			Reason    string `json:"reason"`
		}
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}
		if payload.DepositID == "" {
			return apis.NewBadRequestError("deposit_id requis", nil)
		}
		if payload.Reason == "" {
			return apis.NewBadRequestError("reason requis", nil)
		}

		// 1. Récupérer l'acompte
		deposit, err := dao.FindRecordById("invoices", payload.DepositID)
		if err != nil || deposit == nil {
			return apis.NewNotFoundError("Acompte introuvable", err)
		}
		if deposit.GetString("invoice_type") != "deposit" {
			return apis.NewBadRequestError("Ce document n'est pas un acompte", nil)
		}
		if deposit.GetString("status") == "draft" {
			return apis.NewBadRequestError("Impossible de rembourser un brouillon", nil)
		}

		// 2. Récupérer la facture parente
		parentID := deposit.GetString("original_invoice_id")
		parent, err := dao.FindRecordById("invoices", parentID)
		if err != nil || parent == nil {
			return apis.NewNotFoundError("Facture parente introuvable", err)
		}

		depositAmountTTC := math.Abs(deposit.GetFloat("total_ttc"))
		depositHT := math.Abs(deposit.GetFloat("total_ht"))

		// 3. Créer l'avoir sur acompte
		col, err := dao.FindCollectionByNameOrId("invoices")
		if err != nil {
			return apis.NewApiError(500, "Collection invoices introuvable", err)
		}

		creditNote := models.NewRecord(col)
		now := time.Now()

		ownerCompany := deposit.GetString("owner_company")
		fiscalYear := now.Year()

		// Numéro avoir : AVO-YYYY-XXXXXX
		creditNumber, err := generateCreditNoteNumber(dao, ownerCompany, fiscalYear)
		if err != nil {
			return apis.NewApiError(500, "Erreur génération numéro avoir", err)
		}

		creditNote.Set("number", creditNumber)
		creditNote.Set("invoice_type", "credit_note")
		creditNote.Set("date", now.Format(time.RFC3339))
		creditNote.Set("customer", deposit.GetString("customer"))
		creditNote.Set("owner_company", ownerCompany)
		creditNote.Set("original_invoice_id", payload.DepositID)
		creditNote.Set("status", "validated")
		creditNote.Set("is_paid", false)
		creditNote.Set("is_locked", true)
		creditNote.Set("is_pos_ticket", false)
		creditNote.Set("cancellation_reason", payload.Reason)
		creditNote.Set("total_ht", -depositHT)
		creditNote.Set("total_tva", -(depositAmountTTC - depositHT))
		creditNote.Set("total_ttc", -depositAmountTTC)
		creditNote.Set("currency", deposit.GetString("currency"))
		creditNote.Set("items", []interface{}{map[string]interface{}{
			"name":          fmt.Sprintf("Avoir sur acompte %s", deposit.GetString("number")),
			"quantity":      -1,
			"unit_price_ht": depositHT,
			"tva_rate":      deposit.GetFloat("deposit_percentage"),
			"total_ht":      -depositHT,
			"total_ttc":     -depositAmountTTC,
		}})
		creditNote.Set("notes", fmt.Sprintf(
			"Avoir sur acompte %s — Facture originale %s. Motif: %s",
			deposit.GetString("number"), parent.GetString("number"), payload.Reason,
		))

		// Vendeur — récupéré depuis l'utilisateur authentifié
		if info.AuthRecord != nil {
			creditNote.Set("sold_by", info.AuthRecord.Id)
		}

		// Chaînage ISCA — sequence_number + hash
		lastRecords, _ := dao.FindRecordsByFilter(
			"invoices",
			fmt.Sprintf("owner_company = '%s' && sequence_number > 0", ownerCompany),
			"-sequence_number",
			1,
			0,
		)

		const genesisHash = "0000000000000000000000000000000000000000000000000000000000000000"
		var previousHash string
		var sequenceNumber int

		if len(lastRecords) == 0 {
			previousHash = genesisHash
			sequenceNumber = 1
		} else {
			previousHash = lastRecords[0].GetString("hash")
			if previousHash == "" {
				previousHash = genesisHash
			}
			sequenceNumber = lastRecords[0].GetInt("sequence_number") + 1
		}

		creditNote.Set("previous_hash", previousHash)
		creditNote.Set("sequence_number", sequenceNumber)
		creditNote.Set("fiscal_year", fiscalYear)
		creditNote.Set("_skip_hook_processing", true)

		hashValue := hash.ComputeDocumentHash(creditNote)
		creditNote.Set("hash", hashValue)

		if err := dao.SaveRecord(creditNote); err != nil {
			return apis.NewApiError(500, "Erreur sauvegarde avoir", err)
		}

		log.Printf("✅ Avoir %s créé pour acompte %s (séq: %d)",
			creditNumber, deposit.GetString("number"), sequenceNumber)

		// 4. Mettre à jour deposits_total_ttc et balance_due sur la parente
		existingTotal := math.Round(parent.GetFloat("deposits_total_ttc")*100) / 100
		newTotal := math.Max(0, math.Round((existingTotal-depositAmountTTC)*100)/100)
		parentTotalTTC := math.Abs(parent.GetFloat("total_ttc"))

		parent.Set("deposits_total_ttc", newTotal)
		parent.Set("balance_due", math.Round((parentTotalTTC-newTotal)*100)/100)

		if err := dao.SaveRecord(parent); err != nil {
			return apis.NewApiError(500, "Erreur mise à jour facture parente", err)
		}

		// 5. Marquer l'acompte comme ayant un avoir lié
		deposit.Set("has_credit_note", true)
		_ = dao.SaveRecord(deposit)

		return c.JSON(http.StatusCreated, echo.Map{
			"credit_note":    creditNote,
			"parent_updated": parent,
		})
	}, apis.RequireRecordAuth())
}

// ============================================================================
// HELPERS PRIVÉS
// ============================================================================

// generateCreditNoteNumber génère le prochain numéro AVO-YYYY-XXXXXX
func generateCreditNoteNumber(dao *daos.Dao, ownerCompany string, fiscalYear int) (string, error) {
	prefix := fmt.Sprintf("AVO-%d-", fiscalYear)

	records, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf(
			"owner_company = '%s' && invoice_type = 'credit_note' && fiscal_year = %d",
			ownerCompany, fiscalYear,
		),
		"-sequence_number",
		1,
		0,
	)

	var nextSeq int
	if err != nil || len(records) == 0 {
		nextSeq = 1
	} else {
		lastNumber := records[0].GetString("number")
		var seq int
		fmt.Sscanf(strings.TrimPrefix(lastNumber, prefix), "%d", &seq)
		nextSeq = seq + 1
	}

	return fmt.Sprintf("%s%06d", prefix, nextSeq), nil
}
