package hooks

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend/hash"
)

// ============================================================================
// CONSTANTES
// ============================================================================

const (
	GENESIS_HASH  = "0000000000000000000000000000000000000000000000000000000000000000"
	NumberPadding = 6
)

// Champs autorisés à être modifiés sur une facture verrouillée
var allowedInvoiceUpdates = map[string]bool{
	"status":               true,
	"is_paid":              true,
	"paid_at":              true,
	"payment_method":       true,
	"is_locked":            true,
	"closure_id":           true,
	"converted_to_invoice": true,
	"converted_invoice_id": true,
}

// Transitions de statut autorisées (SANS "paid")
var allowedStatusTransitions = map[string][]string{
	"draft":     {"validated"},
	"validated": {"sent"},
	"sent":      {},
}

// ============================================================================
// ENREGISTREMENT DES HOOKS
// ============================================================================

func RegisterInvoiceHooks(app *pocketbase.PocketBase) {
	allowedInvoiceUpdates["converted_to_invoice"] = true
	allowedInvoiceUpdates["converted_invoice_id"] = true

	// -------------------------------------------------------------------------
	// HOOK: Avant création d'une facture
	// -------------------------------------------------------------------------
	app.OnRecordBeforeCreateRequest("invoices").Add(func(e *core.RecordCreateEvent) error {
		record := e.Record

		ownerCompany := record.GetString("owner_company")
		invoiceType := record.GetString("invoice_type")
		status := record.GetString("status")

		if status == "" {
			status = "draft"
			record.Set("status", status)
		}

		if record.Get("is_paid") == nil {
			record.Set("is_paid", false)
		}

		// -------------------------------------------------------------------------
		// 🧾 sold_by : caissier/vendeur (auto-fill depuis l'utilisateur connecté)
		// -------------------------------------------------------------------------
		if record.GetString("sold_by") == "" {
			if e.HttpContext != nil {
				if authRecord := e.HttpContext.Get("authRecord"); authRecord != nil {
					if user, ok := authRecord.(*models.Record); ok {
						record.Set("sold_by", user.Id)
					}
				}
			}
		}

		// ═════════════════════════════════════════════════════════════════════
		// ✅ VALIDATIONS MÉTIER
		// ═════════════════════════════════════════════════════════════════════

		sessionID := record.GetString("session")
		cashRegisterID := record.GetString("cash_register")
		isPosTicket := record.GetBool("is_pos_ticket")
		originalInvoiceID := record.GetString("original_invoice_id")

		// Valeur par défaut refund_type
		if record.GetString("refund_type") == "" {
			record.Set("refund_type", "full")
		}

		// ─────────────────────────────────────────────────────────────────────
		// RÈGLE 1: Si session présente → FORCER is_pos_ticket = true
		// ─────────────────────────────────────────────────────────────────────
		if sessionID != "" {
			if !isPosTicket {
				record.Set("is_pos_ticket", true)
				log.Printf("🔧 Force is_pos_ticket=true (session présente: %s)", sessionID)
			}
		}

		// ─────────────────────────────────────────────────────────────────────
		// RÈGLE 2: Si original_invoice_id présent → protections & règles POS
		// ─────────────────────────────────────────────────────────────────────
		var orig *models.Record
		if originalInvoiceID != "" {
			var err error
			orig, err = app.Dao().FindRecordById("invoices", originalInvoiceID)
			if err != nil || orig == nil {
				return fmt.Errorf("document original introuvable (original_invoice_id=%s)", originalInvoiceID)
			}
			// ✅ Règle remboursement (avoirs): l'original doit être validé ET payé (ticket POS ou facture)
			if invoiceType == "credit_note" {
				if orig.GetString("status") != "validated" {
					return fmt.Errorf("remboursement interdit: le document original n'est pas validé")
				}
				if !orig.GetBool("is_paid") {
					return fmt.Errorf("remboursement interdit: le document original n'est pas payé")
				}
				if orig.GetString("invoice_type") == "credit_note" {
					return fmt.Errorf("original_invoice_id ne peut pas référencer un avoir")
				}
			}

			// Bloquer la conversion si déjà converti (logique existante)
			if invoiceType == "invoice" {
				if orig.GetBool("converted_to_invoice") || orig.GetString("converted_invoice_id") != "" {
					return fmt.Errorf("ce ticket a déjà été converti en facture")
				}
				existing, err := app.Dao().FindFirstRecordByFilter(
					"invoices",
					fmt.Sprintf("invoice_type='invoice' && original_invoice_id='%s'", originalInvoiceID),
				)
				if err == nil && existing != nil {
					return fmt.Errorf("ce ticket a déjà une facture associée (invoiceId=%s)", existing.Id)
				}
			}

			// Facture issue d'un ticket OU AVOIR sur ticket : pas de session/cash_register (pas de double comptage)
			if sessionID != "" || cashRegisterID != "" {
				log.Printf("⚠️ CORRECTION: document lié à un ticket ne peut avoir de session/cash_register")
				record.Set("session", "")
				record.Set("cash_register", "")
				sessionID = ""
				cashRegisterID = ""
			}

			// AVOIR sur ticket : document comptable
			if invoiceType == "credit_note" {
				record.Set("is_pos_ticket", false)
			} else {
				// facture issue d'un ticket : document comptable
				record.Set("is_pos_ticket", false)
			}

			// ─────────────────────────────────────────────────────────────
			// ✅ Remboursement partiel: validations + recalcul totaux
			// ─────────────────────────────────────────────────────────────
			if invoiceType == "credit_note" {
				refundType := record.GetString("refund_type")

				// Empêcher de dépasser le montant remboursable (multi-avoirs)
				origTotal := orig.GetFloat("total_ttc")
				if origTotal < 0 {
					origTotal = -origTotal
				}

				// Recalculer depuis la BDD (pas depuis le champ qui peut être désynchronisé)
				creditTotalSoFar, err := sumCreditNotesAbsTotal(app, orig.Id)
				if err != nil {
					return fmt.Errorf("impossible de calculer les avoirs existants: %w", err)
				}

				remaining := origTotal - creditTotalSoFar
				log.Printf("🔍 Validation avoir: ticket=%s, total=%.2f, avoirs_existants=%.2f, remaining=%.2f",
					orig.GetString("number"), origTotal, creditTotalSoFar, remaining)

				if remaining <= 0.01 { // Tolérance pour arrondis
					return fmt.Errorf("plus de remboursement possible (remaining=%.2f€)", remaining)
				}

				if refundType == "partial" {
					// refunded_items requis et non vide
					refundedItemsRaw, err := getItemsArray(record.Get("refunded_items"))
					if err != nil {
						return fmt.Errorf("refunded_items invalide: %w", err)
					}
					if len(refundedItemsRaw) == 0 {
						return fmt.Errorf("refunded_items doit être présent et non vide (refund_type=partial)")
					}

					origItems, err := getItemsArray(orig.Get("items"))
					if err != nil {
						return fmt.Errorf("items originaux invalides: %w", err)
					}
					if len(origItems) == 0 {
						return fmt.Errorf("items originaux vides")
					}

					// Cumul des quantités déjà remboursées par ligne (original_item_index)
					alreadyRefundedByIndex, err := sumCreditNotesRefundedQtyByIndex(app, orig.Id)
					if err != nil {
						return fmt.Errorf("impossible de calculer les quantités déjà remboursées: %w", err)
					}

					normalized := make([]map[string]any, 0, len(refundedItemsRaw))

					for i := range refundedItemsRaw {
						it := refundedItemsRaw[i]

						idx, hasIdx := itemOriginalIndex(it)
						if !hasIdx {
							return fmt.Errorf("refunded_items[%d]: original_item_index requis", i)
						}
						if idx < 0 || idx >= len(origItems) {
							return fmt.Errorf("refunded_items[%d]: original_item_index hors limites (max=%d)", i, len(origItems)-1)
						}

						rq := math.Abs(itemQty(it))
						if rq <= 0 {
							return fmt.Errorf("refunded_items[%d]: quantité invalide (<=0)", i)
						}

						origIt := origItems[idx]
						oq := math.Abs(itemQty(origIt))
						already := alreadyRefundedByIndex[idx]
						remainingQty := oq - already
						if remainingQty <= 0 {
							return fmt.Errorf("refunded_items[%d]: item déjà totalement remboursé", i)
						}
						if rq > remainingQty {
							return fmt.Errorf("refunded_items[%d]: quantité remboursée %.6g > restant remboursable %.6g", i, rq, remainingQty)
						}

						cp := make(map[string]any)
						for k, v := range origIt {
							cp[k] = v
						}

						reason := ""
						if v, ok := it["refund_reason"]; ok {
							reason = strings.TrimSpace(fmt.Sprint(v))
						}
						if reason == "" {
							if v, ok := it["reason"]; ok {
								reason = strings.TrimSpace(fmt.Sprint(v))
							}
						}

						cp["original_item_index"] = idx
						cp["refund_reason"] = reason

						// Normaliser en négatif (avoir)
						cp["quantity"] = -math.Abs(rq)

						lineHT, lineTVA, lineTTC := computeLineTotalsForQty(origIt, rq)
						cp["total_ht"] = -math.Abs(lineHT)
						cp["total_tva"] = -math.Abs(lineTVA)
						cp["total_ttc"] = -math.Abs(lineTTC)

						normalized = append(normalized, cp)
					}

					newTotals, vatBreakdown := computeTotalsAndVat(normalized)

					absNew := math.Abs(newTotals.TotalTTC)
					if absNew-remaining > 0.01 {
						return fmt.Errorf("montant de l'avoir (%.2f) dépasse le restant remboursable (%.2f)", absNew, remaining)
					}

					record.Set("items", normalized)
					record.Set("total_ht", -math.Abs(newTotals.TotalHT))
					record.Set("total_tva", -math.Abs(newTotals.TotalTVA))
					record.Set("total_ttc", -math.Abs(newTotals.TotalTTC))
					record.Set("vat_breakdown", vatBreakdown)
				} else {
					// full: rembourser le RESTANT (multi-avoirs) en construisant l'avoir par ligne
					origItems, err := getItemsArray(orig.Get("items"))
					if err != nil {
						return fmt.Errorf("items originaux invalides: %w", err)
					}
					if len(origItems) == 0 {
						return fmt.Errorf("items originaux vides")
					}

					alreadyRefundedByIndex, err := sumCreditNotesRefundedQtyByIndex(app, orig.Id)
					if err != nil {
						return fmt.Errorf("impossible de calculer les quantités déjà remboursées: %w", err)
					}

					normalized := make([]map[string]any, 0, len(origItems))
					for idx := range origItems {
						origIt := origItems[idx]
						oq := math.Abs(itemQty(origIt))
						already := alreadyRefundedByIndex[idx]
						remainingQty := oq - already
						if remainingQty <= 0 {
							continue
						}

						cp := make(map[string]any)
						for k, v := range origIt {
							cp[k] = v
						}
						cp["original_item_index"] = idx
						cp["quantity"] = -math.Abs(remainingQty)

						lineHT, lineTVA, lineTTC := computeLineTotalsForQty(origIt, remainingQty)
						cp["total_ht"] = -math.Abs(lineHT)
						cp["total_tva"] = -math.Abs(lineTVA)
						cp["total_ttc"] = -math.Abs(lineTTC)

						normalized = append(normalized, cp)
					}

					if len(normalized) == 0 {
						return fmt.Errorf("plus de remboursement possible (remaining=%.2f€)", remaining)
					}

					newTotals, vatBreakdown := computeTotalsAndVat(normalized)

					absNew := math.Abs(newTotals.TotalTTC)
					if absNew-remaining > 0.01 {
						return fmt.Errorf("montant de l'avoir (%.2f) dépasse le restant remboursable (%.2f)", absNew, remaining)
					}

					record.Set("items", normalized)
					record.Set("total_ht", -math.Abs(newTotals.TotalHT))
					record.Set("total_tva", -math.Abs(newTotals.TotalTVA))
					record.Set("total_ttc", -math.Abs(newTotals.TotalTTC))
					record.Set("vat_breakdown", vatBreakdown)
				}

			}
		}

		// ─────────────────────────────────────────────────────────────────────
		// RÈGLE 3: Si is_pos_ticket = false ET session présente → ERREUR
		// ─────────────────────────────────────────────────────────────────────
		if !record.GetBool("is_pos_ticket") && record.GetString("session") != "" {
			return errors.New("une facture B2B (is_pos_ticket=false) ne peut pas avoir de session de caisse")
		}

		// ─────────────────────────────────────────────────────────────────────
		// RÈGLE 4: Si cash_register présent SANS session → ERREUR
		// ─────────────────────────────────────────────────────────────────────
		if cashRegisterID != "" && sessionID == "" {
			return errors.New("cash_register nécessite une session active")
		}

		// ═════════════════════════════════════════════════════════════════════
		// FIN DES VALIDATIONS
		// ═════════════════════════════════════════════════════════════════════

		// CAS 1 : Brouillon → pas de numéro, pas de hash
		if status == "draft" {
			record.Set("is_locked", false)

			fiscalYear := time.Now().Year()
			dateStr := record.GetString("date")
			if dateStr != "" {
				if strings.Contains(dateStr, "T") {
					if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
						fiscalYear = t.Year()
					}
				} else {
					if t, err := time.Parse("2006-01-02", dateStr); err == nil {
						fiscalYear = t.Year()
					}
				}
			}
			record.Set("fiscal_year", fiscalYear)
			return nil
		}

		// CAS 2 : Facture non brouillon créée directement
		fiscalYear := time.Now().Year()
		dateStr := record.GetString("date")
		if dateStr != "" {
			if strings.Contains(dateStr, "T") {
				if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
					fiscalYear = t.Year()
				}
			} else {
				if t, err := time.Parse("2006-01-02", dateStr); err == nil {
					fiscalYear = t.Year()
				}
			}
		}
		record.Set("fiscal_year", fiscalYear)

		lastInvoice, err := getLastInvoice(app, ownerCompany)

		var previousHash string
		var sequenceNumber int

		if err != nil || lastInvoice == nil {
			previousHash = GENESIS_HASH
			sequenceNumber = 1
		} else {
			previousHash = lastInvoice.GetString("hash")
			sequenceNumber = lastInvoice.GetInt("sequence_number") + 1
		}

		record.Set("previous_hash", previousHash)
		record.Set("sequence_number", sequenceNumber)

		existingNumber := record.GetString("number")
		if existingNumber == "" || !isValidDocumentNumber(existingNumber, fiscalYear) {
			newNumber, err := generateDocumentNumber(app, ownerCompany, invoiceType, fiscalYear, record)
			if err != nil {
				return fmt.Errorf("erreur génération numéro: %w", err)
			}
			record.Set("number", newNumber)
		}

		hashValue := hash.ComputeDocumentHash(record)
		record.Set("hash", hashValue)
		record.Set("is_locked", true)

		// ═══════════════════════════════════════════════════════════════════════
		// ✅ AJOUTER ICI - Initialiser les champs de remboursement
		// ═══════════════════════════════════════════════════════════════════════
		if invoiceType != "credit_note" {
			totalTTC := record.GetFloat("total_ttc")
			if totalTTC < 0 {
				totalTTC = -totalTTC
			}
			record.Set("remaining_amount", totalTTC)
			record.Set("credit_notes_total", 0)
			record.Set("has_credit_note", false)
		}

		return nil
	})

	// -------------------------------------------------------------------------
	// HOOK: Après création d'une facture
	// -------------------------------------------------------------------------
	app.OnRecordAfterCreateRequest("invoices").Add(func(e *core.RecordCreateEvent) error {
		// ---------------------------------------------------------------------
		// ✅ Conversion ticket -> facture (existant)
		// ---------------------------------------------------------------------
		if e.Record.GetString("invoice_type") == "invoice" {
			originalID := e.Record.GetString("original_invoice_id")
			if originalID != "" {
				orig, err := app.Dao().FindRecordById("invoices", originalID)
				if err != nil || orig == nil {
					return fmt.Errorf("ticket original introuvable (original_invoice_id=%s)", originalID)
				}

				if !orig.GetBool("is_pos_ticket") {
					return fmt.Errorf("original_invoice_id doit référencer un ticket POS (is_pos_ticket=true)")
				}

				if (orig.GetBool("converted_to_invoice") || orig.GetString("converted_invoice_id") != "") &&
					orig.GetString("converted_invoice_id") != e.Record.Id {
					return fmt.Errorf("ticket déjà converti (converted_invoice_id=%s)", orig.GetString("converted_invoice_id"))
				}

				orig.Set("converted_to_invoice", true)
				orig.Set("converted_invoice_id", e.Record.Id)

				if err := app.Dao().SaveRecord(orig); err != nil {
					return fmt.Errorf("impossible de marquer le ticket comme converti: %w", err)
				}
			}
		}

		// ---------------------------------------------------------------------
		// 🆕 Avoirs sur tickets POS (TIK-) + partial refunds
		// ---------------------------------------------------------------------
		if e.Record.GetString("invoice_type") == "credit_note" {
			originalID := e.Record.GetString("original_invoice_id")
			if originalID != "" {
				orig, err := app.Dao().FindRecordById("invoices", originalID)
				if err != nil || orig == nil {
					return fmt.Errorf("document original introuvable (original_invoice_id=%s)", originalID)
				}

				// ✅ Règle remboursement: l'original doit être validé ET payé
				if orig.GetString("status") != "validated" {
					return fmt.Errorf("remboursement interdit: le document original n'est pas validé")
				}
				if !orig.GetBool("is_paid") {
					return fmt.Errorf("remboursement interdit: le document original n'est pas payé")
				}

				// 5) Mettre à jour le ticket original: has_credit_note = true
				if !orig.GetBool("has_credit_note") {
					orig.Set("has_credit_note", true)
				}

				// 6) Mettre à jour credit_notes_total & remaining_amount (multi-avoirs)
				origTotal := orig.GetFloat("total_ttc")
				if origTotal < 0 {
					origTotal = -origTotal
				}

				currentCreditTotal, err := sumCreditNotesAbsTotal(app, orig.Id)
				if err != nil {
					return fmt.Errorf("impossible de recalculer credit_notes_total: %w", err)
				}

				newCreditAbs := math.Abs(e.Record.GetFloat("total_ttc"))
				// currentCreditTotal inclut déjà cet avoir (créé), donc on recalc "à plat"
				// -> remaining basé sur la somme totale des avoirs existants
				remaining := origTotal - currentCreditTotal
				if remaining < 0 {
					remaining = 0
				}

				orig.Set("credit_notes_total", currentCreditTotal)
				orig.Set("remaining_amount", remaining)

				if err := app.Dao().SaveRecord(orig); err != nil {
					return fmt.Errorf("impossible de mettre à jour le ticket (credit_notes_total/remaining_amount): %w", err)
				}

				_ = newCreditAbs // évite warning si build tags/linters

				// -----------------------------------------------------------------
				// 🆕 Gestion remboursement espèces (refund_method="especes")
				// -----------------------------------------------------------------
				if e.Record.GetString("refund_method") == "especes" {
					origCashRegister := orig.GetString("cash_register")
					if origCashRegister != "" {
						activeSession, err := app.Dao().FindFirstRecordByFilter(
							"cash_sessions",
							fmt.Sprintf("cash_register = '%s' && status = 'open'", origCashRegister),
						)

						if err == nil && activeSession != nil {
							cmCol, err := app.Dao().FindCollectionByNameOrId("cash_movements")
							if err != nil {
								return err
							}

							amount := math.Abs(e.Record.GetFloat("total_ttc"))

							cm := models.NewRecord(cmCol)
							cm.Set("owner_company", e.Record.GetString("owner_company"))
							cm.Set("session", activeSession.Id)
							cm.Set("movement_type", "refund_out")
							cm.Set("amount", amount)
							cm.Set("related_invoice", e.Record.Id)

							if e.HttpContext != nil {
								if authRecord := e.HttpContext.Get("authRecord"); authRecord != nil {
									if user, ok := authRecord.(*models.Record); ok {
										cm.Set("created_by", user.Id)
									}
								}
							}

							meta := map[string]interface{}{
								"source":           "credit_note_cash_refund",
								"original_ticket":  orig.Id,
								"cash_register":    origCashRegister,
								"cash_session_id":  activeSession.Id,
								"credit_note_id":   e.Record.Id,
								"credit_note_num":  e.Record.GetString("number"),
								"original_ticketN": orig.GetString("number"),
								"refund_type":      e.Record.GetString("refund_type"),
							}
							cm.Set("meta", meta)

							if err := app.Dao().SaveRecord(cm); err != nil {
								return fmt.Errorf("impossible de créer le cash_movement refund_out: %w", err)
							}
						}
					}
				}
			}
		}

		// action := "invoice_created"
		// if e.Record.GetString("invoice_type") == "credit_note" {
		// 	action = "credit_note_created"
		// }

		return createAuditLog(app, e.HttpContext, AuditLogParams{
			Action:       getAuditAction(e.Record, "created"),
			EntityType:   getEntityType(e.Record),
			EntityID:     e.Record.Id,
			EntityNumber: e.Record.GetString("number"),
			OwnerCompany: e.Record.GetString("owner_company"),
			Details: map[string]interface{}{
				"customer":      e.Record.GetString("customer"),
				"total_ttc":     e.Record.GetFloat("total_ttc"),
				"status":        e.Record.GetString("status"),
				"is_pos_ticket": e.Record.GetBool("is_pos_ticket"),
				"session":       e.Record.GetString("session"),
				"refund_type":   e.Record.GetString("refund_type"),
			},
		})
	})

	// -------------------------------------------------------------------------
	// HOOK: Avant mise à jour d'une facture
	// -------------------------------------------------------------------------
	app.OnRecordBeforeUpdateRequest("invoices").Add(func(e *core.RecordUpdateEvent) error {
		original := e.Record.OriginalCopy()
		updated := e.Record

		// Si la facture est verrouillée, vérifier les champs modifiés
		if original.GetBool("is_locked") {
			for key := range updated.SchemaData() {
				originalValue := original.Get(key)
				newValue := updated.Get(key)

				if key == "updated" || key == "id" || key == "created" {
					continue
				}

				if !deepEqual(originalValue, newValue) {
					if !allowedInvoiceUpdates[key] {
						return fmt.Errorf(
							"modification interdite: le champ '%s' ne peut pas être modifié sur une facture validée. "+
								"Créez un avoir pour annuler cette facture",
							key,
						)
					}
				}
			}
		}

		// Vérifier les transitions de statut
		oldStatus := original.GetString("status")
		newStatus := updated.GetString("status")

		if oldStatus != newStatus {
			allowed := allowedStatusTransitions[oldStatus]
			isAllowed := false
			for _, s := range allowed {
				if s == newStatus {
					isAllowed = true
					break
				}
			}
			if !isAllowed {
				return fmt.Errorf(
					"transition de statut invalide: %s → %s n'est pas autorisé. "+
						"Transitions possibles: %v",
					oldStatus, newStatus, allowed,
				)
			}

			// 🔹 Transition spéciale: draft → validated
			if oldStatus == "draft" && newStatus == "validated" {
				ownerCompany := updated.GetString("owner_company")
				invoiceType := updated.GetString("invoice_type")

				// Année fiscale basée sur la date de facture
				dateStr := updated.GetString("date")
				fiscalYear := time.Now().Year()
				if dateStr != "" {
					if strings.Contains(dateStr, "T") {
						if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
							fiscalYear = t.Year()
						}
					} else {
						if t, err := time.Parse("2006-01-02", dateStr); err == nil {
							fiscalYear = t.Year()
						}
					}
				}
				updated.Set("fiscal_year", fiscalYear)

				// Récupérer la dernière facture pour chaînage
				lastInvoice, err := getLastInvoice(app, ownerCompany)
				var previousHash string
				var sequenceNumber int

				if err != nil || lastInvoice == nil {
					previousHash = GENESIS_HASH
					sequenceNumber = 1
				} else {
					previousHash = lastInvoice.GetString("hash")
					sequenceNumber = lastInvoice.GetInt("sequence_number") + 1
				}

				updated.Set("previous_hash", previousHash)
				updated.Set("sequence_number", sequenceNumber)

				// 🆕 MODIFIÉ : Appel avec le record pour détecter POS
				existingNumber := updated.GetString("number")
				if existingNumber == "" || !isValidDocumentNumber(existingNumber, fiscalYear) {
					newNumber, err := generateDocumentNumber(app, ownerCompany, invoiceType, fiscalYear, updated)
					if err != nil {
						return fmt.Errorf("erreur génération numéro (validation): %w", err)
					}
					updated.Set("number", newNumber)
				}

				// Recalcul du hash
				hashValue := hash.ComputeDocumentHash(updated)
				updated.Set("hash", hashValue)

				// Verrouiller à la validation
				updated.Set("is_locked", true)
			}
		}

		// Vérification logique sur is_paid
		oldIsPaid := original.GetBool("is_paid")
		newIsPaid := updated.GetBool("is_paid")

		if oldIsPaid && !newIsPaid {
			// On autorise la correction d'erreur de saisie
		}

		// Si on marque comme payée, s'assurer que paid_at est défini
		if newIsPaid && !oldIsPaid {
			if updated.GetString("paid_at") == "" {
				updated.Set("paid_at", time.Now().Format(time.RFC3339))
			}
		}

		return nil
	})

	// -------------------------------------------------------------------------
	// HOOK: Après mise à jour d'une facture
	// -------------------------------------------------------------------------
	app.OnRecordAfterUpdateRequest("invoices").Add(func(e *core.RecordUpdateEvent) error {
		original := e.Record.OriginalCopy()
		updated := e.Record

		oldStatus := original.GetString("status")
		newStatus := updated.GetString("status")
		oldIsPaid := original.GetBool("is_paid")
		newIsPaid := updated.GetBool("is_paid")

		// Déterminer l'action de base
		var baseAction string
		if oldStatus != newStatus {
			switch newStatus {
			case "validated":
				baseAction = "validated"
			case "sent":
				baseAction = "sent"
			default:
				baseAction = "updated"
			}
		} else if !oldIsPaid && newIsPaid {
			// Paiement enregistré - action spéciale
			return createAuditLog(app, e.HttpContext, AuditLogParams{
				Action:       "payment_recorded",
				EntityType:   getEntityType(updated),
				EntityID:     updated.Id,
				EntityNumber: updated.GetString("number"),
				OwnerCompany: updated.GetString("owner_company"),
				PreviousValues: map[string]interface{}{
					"status":         oldStatus,
					"is_paid":        oldIsPaid,
					"payment_method": original.GetString("payment_method"),
					"paid_at":        original.GetString("paid_at"),
				},
				NewValues: map[string]interface{}{
					"status":         newStatus,
					"is_paid":        newIsPaid,
					"payment_method": updated.GetString("payment_method"),
					"paid_at":        updated.GetString("paid_at"),
				},
			})
		} else {
			baseAction = "updated"
		}

		return createAuditLog(app, e.HttpContext, AuditLogParams{
			Action:       getAuditAction(updated, baseAction),
			EntityType:   getEntityType(updated),
			EntityID:     updated.Id,
			EntityNumber: updated.GetString("number"),
			OwnerCompany: updated.GetString("owner_company"),
			PreviousValues: map[string]interface{}{
				"status":         oldStatus,
				"is_paid":        oldIsPaid,
				"payment_method": original.GetString("payment_method"),
				"paid_at":        original.GetString("paid_at"),
			},
			NewValues: map[string]interface{}{
				"status":         newStatus,
				"is_paid":        newIsPaid,
				"payment_method": updated.GetString("payment_method"),
				"paid_at":        updated.GetString("paid_at"),
			},
		})
	})

	// -------------------------------------------------------------------------
	// HOOK: Avant suppression d'une facture
	// → BLOQUE TOUJOURS (sauf brouillons)
	// -------------------------------------------------------------------------
	app.OnRecordBeforeDeleteRequest("invoices").Add(func(e *core.RecordDeleteEvent) error {
		record := e.Record
		status := record.GetString("status")

		// ✅ Autoriser la suppression des brouillons non verrouillés
		if status == "draft" && !record.GetBool("is_locked") {
			return nil
		}

		// ❌ Tout le reste reste interdit
		return errors.New(
			"suppression interdite: les factures validées ou envoyées ne " +
				"peuvent pas être supprimées. Créez un avoir pour annuler cette facture",
		)
	})
}

// ============================================================================
// 🔢 GÉNÉRATION DE NUMÉRO DE DOCUMENT
// ============================================================================

// generateDocumentNumber génère un numéro unique pour facture ou avoir
// Format: FAC-2025-000001 ou AVO-2025-000001
func generateDocumentNumber(app *pocketbase.PocketBase, ownerCompany, invoiceType string, fiscalYear int, record *models.Record) (string, error) {
	var prefix string

	// 🆕 NOUVEAU : Détecter si c'est un ticket POS via le champ cash_register
	isPOS := record.GetString("cash_register") != ""
	if !isPOS && record.Get("is_paid") == nil {
		record.Set("is_paid", false)
	}

	// Pour les tickets POS, forcer is_paid = true
	if isPOS {
		record.Set("is_paid", true)
		record.Set("is_pos_ticket", true) // 🆕 Aussi marquer comme ticket
	}
	switch {
	case invoiceType == "credit_note":
		prefix = fmt.Sprintf("AVO-%d-", fiscalYear)
	case isPOS:
		// 🎯 TICKETS DE CAISSE
		prefix = fmt.Sprintf("TIK-%d-", fiscalYear)
	default:
		// Factures classiques
		prefix = fmt.Sprintf("FAC-%d-", fiscalYear)
	}

	// 🆕 MODIFIÉ : Filtrer par préfixe pour permettre plusieurs types de numérotation
	// On ne filtre plus par invoice_type, mais par le préfixe du numéro
	filterParts := []string{
		fmt.Sprintf("owner_company = '%s'", ownerCompany),
		fmt.Sprintf("fiscal_year = %d", fiscalYear),
		fmt.Sprintf("number ~ '%s'", prefix), // Filtre par préfixe (~ = contains)
	}

	filter := strings.Join(filterParts, " && ")

	records, err := app.Dao().FindRecordsByFilter(
		"invoices",
		filter,
		"-sequence_number", // Tri par sequence_number décroissant
		1,
		0,
	)

	var nextSeq int
	if err != nil || len(records) == 0 {
		nextSeq = 1
	} else {
		// Extraire le numéro du dernier document avec ce préfixe
		lastNumber := records[0].GetString("number")
		nextSeq = extractSequenceFromNumber(lastNumber, prefix) + 1
	}

	// Générer le numéro avec padding (6 chiffres)
	return fmt.Sprintf("%s%0*d", prefix, NumberPadding, nextSeq), nil
}

// extractSequenceFromNumber extrait le numéro de séquence d'un numéro de document
// Ex: "FAC-2025-000042" -> 42
func extractSequenceFromNumber(number, prefix string) int {
	if !strings.HasPrefix(number, prefix) {
		return 0
	}
	seqStr := strings.TrimPrefix(number, prefix)
	var seq int
	fmt.Sscanf(seqStr, "%d", &seq)
	return seq
}

// isValidDocumentNumber vérifie si un numéro est au bon format
func isValidDocumentNumber(number string, fiscalYear int) bool {
	// Formats valides: FAC-YYYY-NNNNNN ou AVO-YYYY-NNNNNN ou DEV-YYYY-NNNNNN
	prefixes := []string{
		fmt.Sprintf("FAC-%d-", fiscalYear),
		fmt.Sprintf("AVO-%d-", fiscalYear),
		fmt.Sprintf("DEV-%d-", fiscalYear),
		fmt.Sprintf("TIK-%d-", fiscalYear),
	}

	for _, prefix := range prefixes {
		if strings.HasPrefix(number, prefix) {
			seqPart := strings.TrimPrefix(number, prefix)
			// Vérifier que c'est un nombre avec le bon padding
			if len(seqPart) == NumberPadding {
				var seq int
				if _, err := fmt.Sscanf(seqPart, "%d", &seq); err == nil && seq > 0 {
					return true
				}
			}
		}
	}
	return false
}

// ============================================================================
// HOOKS CLOSURES
// ============================================================================

func RegisterClosureHooks(app *pocketbase.PocketBase) {
	app.OnRecordBeforeCreateRequest("invoices").Add(func(e *core.RecordCreateEvent) error {
		record := e.Record

		ownerCompany := record.GetString("owner_company")
		invoiceType := record.GetString("invoice_type")
		status := record.GetString("status")
		cashRegister := record.GetString("cash_register")

		// Valeur par défaut de statut si non fourni
		if status == "" {
			status = "draft"
			record.Set("status", status)
		}

		// Initialiser is_paid si non défini
		if record.Get("is_paid") == nil {
			record.Set("is_paid", false)
		}

		// -------------------------------------------------------------------------
		// 🧾 sold_by : caissier/vendeur (auto-fill depuis l'utilisateur connecté)
		// -------------------------------------------------------------------------
		if record.GetString("sold_by") == "" {
			if e.HttpContext != nil {
				if authRecord := e.HttpContext.Get("authRecord"); authRecord != nil {
					if user, ok := authRecord.(*models.Record); ok {
						record.Set("sold_by", user.Id)
					}
				}
			}
		}

		// 🆕 NOUVEAU : LIAISON AUTOMATIQUE SESSION ACTIVE
		// Si une caisse est spécifiée mais pas de session
		if cashRegister != "" && record.GetString("session") == "" {
			// Chercher la session active pour cette caisse
			activeSession, err := app.Dao().FindFirstRecordByFilter(
				"cash_sessions",
				fmt.Sprintf("cash_register = '%s' && status = 'open'", cashRegister),
			)

			if err == nil && activeSession != nil {
				record.Set("session", activeSession.Id)
				log.Printf("✅ Facture liée automatiquement à la session %s", activeSession.Id)
			} else {
				log.Printf("⚠️ Aucune session ouverte pour la caisse %s", cashRegister)
			}
		}

		// 🔹 CAS 1 : Brouillon → pas de numéro, pas de hash, pas de chaînage
		if status == "draft" {
			record.Set("is_locked", false)

			// On peut initialiser fiscal_year à partir de maintenant ou de la date
			fiscalYear := time.Now().Year()
			dateStr := record.GetString("date")
			if dateStr != "" {
				if strings.Contains(dateStr, "T") {
					if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
						fiscalYear = t.Year()
					}
				} else {
					if t, err := time.Parse("2006-01-02", dateStr); err == nil {
						fiscalYear = t.Year()
					}
				}
			}
			record.Set("fiscal_year", fiscalYear)
			if invoiceType != "credit_note" {
				totalTTC := record.GetFloat("total_ttc")
				if totalTTC < 0 {
					totalTTC = -totalTTC
				}
				record.Set("remaining_amount", totalTTC)
				record.Set("credit_notes_total", 0)
				record.Set("has_credit_note", false)
			}
			// Pas de number, pas de hash, pas de previous_hash / sequence_number ici
			return nil
		}

		// 🔹 CAS 2 : Facture non brouillon créée directement (ex: avoir, ticket POS)
		// → numérotation + hash dès la création

		// Déterminer l'année fiscale à partir de la date de facture si possible
		fiscalYear := time.Now().Year()
		dateStr := record.GetString("date")
		if dateStr != "" {
			if strings.Contains(dateStr, "T") {
				if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
					fiscalYear = t.Year()
				}
			} else {
				if t, err := time.Parse("2006-01-02", dateStr); err == nil {
					fiscalYear = t.Year()
				}
			}
		}
		record.Set("fiscal_year", fiscalYear)

		// Récupérer la dernière facture (pour chaînage)
		lastInvoice, err := getLastInvoice(app, ownerCompany)

		var previousHash string
		var sequenceNumber int

		if err != nil || lastInvoice == nil {
			previousHash = GENESIS_HASH
			sequenceNumber = 1
		} else {
			previousHash = lastInvoice.GetString("hash")
			sequenceNumber = lastInvoice.GetInt("sequence_number") + 1
		}

		record.Set("previous_hash", previousHash)
		record.Set("sequence_number", sequenceNumber)

		// 🆕 MODIFIÉ : Génération automatique du numéro avec détection POS
		existingNumber := record.GetString("number")
		if existingNumber == "" || !isValidDocumentNumber(existingNumber, fiscalYear) {
			newNumber, err := generateDocumentNumber(app, ownerCompany, invoiceType, fiscalYear, record)
			if err != nil {
				return fmt.Errorf("erreur génération numéro: %w", err)
			}
			record.Set("number", newNumber)
		}

		// Calcul du hash
		hashValue := hash.ComputeDocumentHash(record)
		record.Set("hash", hashValue)

		// Verrouillage si ce n'est pas un brouillon
		record.Set("is_locked", true)

		if invoiceType != "credit_note" {
			totalTTC := record.GetFloat("total_ttc")
			if totalTTC < 0 {
				totalTTC = -totalTTC
			}
			record.Set("remaining_amount", totalTTC)
			record.Set("credit_notes_total", 0)
			record.Set("has_credit_note", false)
		}

		return nil
	})

	app.OnRecordBeforeUpdateRequest("closures").Add(func(e *core.RecordUpdateEvent) error {
		return errors.New("modification interdite: les clôtures sont inaltérables")
	})

	app.OnRecordBeforeDeleteRequest("closures").Add(func(e *core.RecordDeleteEvent) error {
		return errors.New("suppression interdite: les clôtures doivent être conservées")
	})
}

// ============================================================================
// HOOKS AUDIT_LOGS
// ============================================================================

func getEntityType(record *models.Record) string {
	if record.GetString("invoice_type") == "credit_note" {
		return "credit_note"
	}
	if record.GetBool("is_pos_ticket") {
		return "ticket"
	}
	return "invoice"
}

func getAuditAction(record *models.Record, baseAction string) string {
	if record.GetString("invoice_type") == "credit_note" {
		return "credit_note_" + baseAction
	}
	if record.GetBool("is_pos_ticket") {
		return "ticket_" + baseAction
	}
	return "invoice_" + baseAction
}

func RegisterAuditLogHooks(app *pocketbase.PocketBase) {
	app.OnRecordBeforeCreateRequest("audit_logs").Add(func(e *core.RecordCreateEvent) error {
		record := e.Record

		lastLog, err := getLastAuditLog(app, record.GetString("owner_company"))

		var previousHash string
		if err != nil || lastLog == nil {
			previousHash = GENESIS_HASH
		} else {
			previousHash = lastLog.GetString("hash")
		}

		record.Set("previous_hash", previousHash)

		auditHash, err := hash.ComputeAuditLogHash(record)
		if err != nil {
			return fmt.Errorf("erreur calcul hash audit: %w", err)
		}
		record.Set("hash", auditHash)

		return nil
	})

	app.OnRecordBeforeUpdateRequest("audit_logs").Add(func(e *core.RecordUpdateEvent) error {
		return errors.New("modification interdite: les logs d'audit sont inaltérables")
	})

	app.OnRecordBeforeDeleteRequest("audit_logs").Add(func(e *core.RecordDeleteEvent) error {
		return errors.New("suppression interdite: les logs d'audit doivent être conservés")
	})
}

// ============================================================================
// HOOKS QUOTES (DEVIS)
// ============================================================================

func RegisterQuoteHooks(app *pocketbase.PocketBase) {
	app.OnRecordBeforeCreateRequest("quotes").Add(func(e *core.RecordCreateEvent) error {
		record := e.Record

		// ✅ issued_by
		if record.GetString("issued_by") == "" && e.HttpContext != nil {
			if authRecord := e.HttpContext.Get("authRecord"); authRecord != nil {
				if user, ok := authRecord.(*models.Record); ok {
					record.Set("issued_by", user.Id)
				}
			}
		}

		// 🔢 ton code existant de génération number (si présent chez toi)
		ownerCompany := record.GetString("owner_company")
		fiscalYear := time.Now().Year()

		existingNumber := record.GetString("number")
		if existingNumber == "" || !isValidDocumentNumber(existingNumber, fiscalYear) {
			newNumber, err := generateQuoteNumber(app, ownerCompany, fiscalYear)
			if err != nil {
				return fmt.Errorf("erreur génération numéro devis: %w", err)
			}
			record.Set("number", newNumber)
		}

		return nil
	})
}

// generateQuoteNumber génère un numéro unique pour les devis
// Format: DEV-2025-000001
func generateQuoteNumber(app *pocketbase.PocketBase, ownerCompany string, fiscalYear int) (string, error) {
	prefix := fmt.Sprintf("DEV-%d-", fiscalYear)

	filter := fmt.Sprintf(
		"owner_company = '%s' && number ~ '%s'",
		ownerCompany, prefix,
	)

	records, err := app.Dao().FindRecordsByFilter(
		"quotes",
		filter,
		"-created",
		1,
		0,
	)

	var nextSeq int
	if err != nil || len(records) == 0 {
		nextSeq = 1
	} else {
		lastNumber := records[0].GetString("number")
		nextSeq = extractSequenceFromNumber(lastNumber, prefix) + 1
	}

	return fmt.Sprintf("%s%0*d", prefix, NumberPadding, nextSeq), nil
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

func getLastInvoice(app *pocketbase.PocketBase, ownerCompany string) (*models.Record, error) {
	records, err := app.Dao().FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("owner_company = '%s'", ownerCompany),
		"-sequence_number",
		1,
		0,
	)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, nil
	}
	return records[0], nil
}

func getLastAuditLog(app *pocketbase.PocketBase, ownerCompany string) (*models.Record, error) {
	records, err := app.Dao().FindRecordsByFilter(
		"audit_logs",
		fmt.Sprintf("owner_company = '%s'", ownerCompany),
		"-created",
		1,
		0,
	)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, nil
	}
	return records[0], nil
}

func jsonMarshalOrdered(data map[string]interface{}) ([]byte, error) {
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
		valueJSON, err := json.Marshal(data[k])
		if err != nil {
			return nil, err
		}

		builder.Write(keyJSON)
		builder.WriteString(":")
		builder.Write(valueJSON)
	}

	builder.WriteString("}")
	return []byte(builder.String()), nil
}

func deepEqual(a, b interface{}) bool {
	aJSON, _ := json.Marshal(a)
	bJSON, _ := json.Marshal(b)
	return string(aJSON) == string(bJSON)
}

// ============================================================================
// CRÉATION D'AUDIT LOG
// ============================================================================

type AuditLogParams struct {
	Action         string
	EntityType     string
	EntityID       string
	EntityNumber   string
	OwnerCompany   string
	Details        map[string]interface{}
	PreviousValues map[string]interface{}
	NewValues      map[string]interface{}
}

func createAuditLog(app *pocketbase.PocketBase, ctx echo.Context, params AuditLogParams) error {
	collection, err := app.Dao().FindCollectionByNameOrId("audit_logs")
	if err != nil {
		return nil
	}

	record := models.NewRecord(collection)
	record.Set("action", params.Action)
	record.Set("entity_type", params.EntityType)
	record.Set("entity_id", params.EntityID)
	record.Set("entity_number", params.EntityNumber)
	record.Set("owner_company", params.OwnerCompany)

	if ctx != nil {
		if authRecord := ctx.Get("authRecord"); authRecord != nil {
			if user, ok := authRecord.(*models.Record); ok {
				record.Set("user_id", user.Id)
				record.Set("user_email", user.GetString("email"))
			}
		}
		record.Set("ip_address", ctx.RealIP())
		record.Set("user_agent", ctx.Request().UserAgent())
	}

	if params.Details != nil {
		record.Set("details", params.Details)
	}
	if params.PreviousValues != nil {
		record.Set("previous_values", params.PreviousValues)
	}
	if params.NewValues != nil {
		record.Set("new_values", params.NewValues)
	}

	return app.Dao().SaveRecord(record)
}

// ============================================================================
// HELPERS partial refund
// ============================================================================

type Totals struct {
	TotalHT  float64
	TotalTVA float64
	TotalTTC float64
}

func getItemsArray(v any) ([]map[string]any, error) {
	if v == nil {
		return nil, nil
	}

	switch t := v.(type) {
	case []any:
		out := make([]map[string]any, 0, len(t))
		for _, it := range t {
			m, ok := it.(map[string]any)
			if !ok {
				// fallback: marshal/unmarshal
				b, err := json.Marshal(it)
				if err != nil {
					return nil, err
				}
				var mm map[string]any
				if err := json.Unmarshal(b, &mm); err != nil {
					return nil, err
				}
				out = append(out, mm)
				continue
			}
			out = append(out, m)
		}
		return out, nil
	case []map[string]any:
		return t, nil
	default:
		// attempt marshal/unmarshal if PB gives json string/raw
		b, err := json.Marshal(v)
		if err != nil {
			return nil, err
		}
		var out []map[string]any
		if err := json.Unmarshal(b, &out); err != nil {
			return nil, err
		}
		return out, nil
	}
}

func itemQty(it map[string]any) float64 {
	for _, k := range []string{"quantity", "qty", "qte"} {
		if v, ok := it[k]; ok {
			if f, ok := toFloat(v); ok {
				return f
			}
		}
	}
	// default qty=1 if missing
	return 1
}

func computeTotalsAndVat(items []map[string]any) (Totals, any) {
	var t Totals
	vat := map[string]map[string]float64{} // rate -> {base_ht, tva, ttc}

	for _, it := range items {
		lineHT, lineTVA, lineTTC := lineTotals(it)

		t.TotalHT += lineHT
		t.TotalTVA += lineTVA
		t.TotalTTC += lineTTC

		rate := ""
		for _, k := range []string{"vat_rate", "tax_rate", "tva_rate", "rate"} {
			if v, ok := it[k]; ok {
				rate = strings.TrimSpace(fmt.Sprint(v))
				if rate != "" && rate != "<nil>" {
					break
				}
			}
		}
		if rate == "" {
			rate = "unknown"
		}

		if _, ok := vat[rate]; !ok {
			vat[rate] = map[string]float64{"base_ht": 0, "tva": 0, "ttc": 0}
		}
		vat[rate]["base_ht"] += lineHT
		vat[rate]["tva"] += lineTVA
		vat[rate]["ttc"] += lineTTC
	}

	// output as array for UI friendliness
	out := make([]map[string]any, 0, len(vat))
	for rate, sums := range vat {
		out = append(out, map[string]any{
			"rate":      rate,
			"base_ht":   round2(sums["base_ht"]),
			"tva":       round2(sums["tva"]),
			"total_ttc": round2(sums["ttc"]),
		})
	}
	return Totals{
		TotalHT:  round2(t.TotalHT),
		TotalTVA: round2(t.TotalTVA),
		TotalTTC: round2(t.TotalTTC),
	}, out
}

func lineTotals(it map[string]any) (float64, float64, float64) {
	// Prefer explicit totals if present
	if v, ok := it["total_ttc"]; ok {
		if f, ok := toFloat(v); ok {
			ttc := f
			ht := 0.0
			tva := 0.0
			if v2, ok := it["total_ht"]; ok {
				if f2, ok := toFloat(v2); ok {
					ht = f2
				}
			}
			if v3, ok := it["total_tva"]; ok {
				if f3, ok := toFloat(v3); ok {
					tva = f3
				}
			}
			// If ht/tva missing, try compute from unit price + rate
			if ht == 0 && tva == 0 {
				ht, tva, ttc = computeFromUnit(it)
			}
			return round2(ht), round2(tva), round2(ttc)
		}
	}

	// Otherwise compute from unit fields
	ht, tva, ttc := computeFromUnit(it)
	return round2(ht), round2(tva), round2(ttc)
}

func computeFromUnit(it map[string]any) (float64, float64, float64) {
	q := itemQty(it)

	// unit prices candidates
	var unitHT float64
	if v, ok := it["unit_price_ht"]; ok {
		if f, ok := toFloat(v); ok {
			unitHT = f
		}
	}
	if unitHT == 0 {
		for _, k := range []string{"price_ht", "unit_ht", "unitPriceHT"} {
			if v, ok := it[k]; ok {
				if f, ok := toFloat(v); ok {
					unitHT = f
					break
				}
			}
		}
	}

	// VAT rate
	rate := 0.0
	for _, k := range []string{"vat_rate", "tax_rate", "tva_rate"} {
		if v, ok := it[k]; ok {
			if f, ok := toFloat(v); ok {
				rate = f
				break
			}
		}
	}

	// If unitHT missing, try derive from unit_ttc
	if unitHT == 0 {
		if v, ok := it["unit_price_ttc"]; ok {
			if f, ok := toFloat(v); ok && (1+rate/100) != 0 {
				unitHT = f / (1 + rate/100)
			}
		}
		if unitHT == 0 {
			for _, k := range []string{"price_ttc", "unit_ttc", "unitPriceTTC"} {
				if v, ok := it[k]; ok {
					if f, ok := toFloat(v); ok && (1+rate/100) != 0 {
						unitHT = f / (1 + rate/100)
						break
					}
				}
			}
		}
	}

	ht := unitHT * q
	tva := ht * (rate / 100)
	ttc := ht + tva
	return ht, tva, ttc
}

func toFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case string:
		t = strings.TrimSpace(t)
		if t == "" {
			return 0, false
		}
		var f float64
		_, err := fmt.Sscanf(t, "%f", &f)
		return f, err == nil
	default:
		return 0, false
	}
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// sumCreditNotesRefundedQtyByIndex cumule les quantités (en absolu) déjà remboursées
// par original_item_index sur l'ensemble des avoirs liés à originalInvoiceID.
func sumCreditNotesRefundedQtyByIndex(app *pocketbase.PocketBase, originalInvoiceID string) (map[int]float64, error) {
	records, err := app.Dao().FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("invoice_type='credit_note' && original_invoice_id='%s'", originalInvoiceID),
		"-created",
		500,
		0,
	)
	if err != nil {
		return nil, err
	}

	refunded := map[int]float64{}
	for _, r := range records {
		items, err := getItemsArray(r.Get("items"))
		if err != nil {
			continue
		}
		for _, it := range items {
			idx, ok := itemOriginalIndex(it)
			if !ok {
				continue
			}
			refunded[idx] += math.Abs(itemQty(it))
		}
	}

	return refunded, nil
}

func itemOriginalIndex(it map[string]any) (int, bool) {
	for _, k := range []string{"original_item_index", "originalItemIndex"} {
		if v, ok := it[k]; ok {
			if f, ok := toFloat(v); ok {
				return int(f), true
			}
		}
	}
	return 0, false
}

// computeLineTotalsForQty calcule les totaux d'une ligne pour une quantité donnée.
// - Si des unit prices existent, on utilise computeFromUnit.
// - Sinon, on applique un prorata basé sur les totaux originaux.
func computeLineTotalsForQty(origIt map[string]any, qty float64) (float64, float64, float64) {
	if qty <= 0 {
		return 0, 0, 0
	}

	hasUnit := false
	for _, k := range []string{"unit_price_ht", "price_ht", "unit_ht", "unitPriceHT", "unit_price_ttc", "price_ttc", "unit_ttc", "unitPriceTTC"} {
		if v, ok := origIt[k]; ok {
			if f, ok := toFloat(v); ok && f != 0 {
				hasUnit = true
				break
			}
		}
	}

	if hasUnit {
		cp := make(map[string]any)
		for k, v := range origIt {
			cp[k] = v
		}
		delete(cp, "total_ht")
		delete(cp, "total_tva")
		delete(cp, "total_ttc")
		cp["quantity"] = qty
		ht, tva, ttc := computeFromUnit(cp)
		return round2(ht), round2(tva), round2(ttc)
	}

	oq := math.Abs(itemQty(origIt))
	if oq == 0 {
		oq = 1
	}
	ratio := qty / oq

	// Base sur totaux originaux si présents
	origHT := 0.0
	if v, ok := origIt["total_ht"]; ok {
		if f, ok := toFloat(v); ok {
			origHT = f
		}
	}
	origTVA := 0.0
	if v, ok := origIt["total_tva"]; ok {
		if f, ok := toFloat(v); ok {
			origTVA = f
		}
	}
	origTTC := 0.0
	if v, ok := origIt["total_ttc"]; ok {
		if f, ok := toFloat(v); ok {
			origTTC = f
		}
	}

	// Si total_ht manquant, on tente un calcul
	if origHT == 0 && origTVA == 0 && origTTC == 0 {
		cp := make(map[string]any)
		for k, v := range origIt {
			cp[k] = v
		}
		delete(cp, "total_ht")
		delete(cp, "total_tva")
		delete(cp, "total_ttc")
		cp["quantity"] = qty
		ht, tva, ttc := computeFromUnit(cp)
		return round2(ht), round2(tva), round2(ttc)
	}

	ht := origHT * ratio
	tva := origTVA * ratio
	ttc := origTTC * ratio
	return round2(math.Abs(ht)), round2(math.Abs(tva)), round2(math.Abs(ttc))
}

func sumCreditNotesAbsTotal(app *pocketbase.PocketBase, originalInvoiceID string) (float64, error) {
	records, err := app.Dao().FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("invoice_type='credit_note' && original_invoice_id='%s'", originalInvoiceID),
		"-created",
		500,
		0,
	)
	if err != nil {
		return 0, err
	}

	sum := 0.0
	for _, r := range records {
		sum += math.Abs(r.GetFloat("total_ttc"))
	}
	return round2(sum), nil
}

// ============================================================================
// FONCTION D'INITIALISATION GLOBALE
// ============================================================================

func RegisterAllHooks(app *pocketbase.PocketBase) {
	RegisterInvoiceHooks(app)
	RegisterQuoteHooks(app) //
	RegisterClosureHooks(app)
	RegisterAuditLogHooks(app)
	RegisterCashSessionHooks(app)
	RegisterInventoryHooks(app)
}
