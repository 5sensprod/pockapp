package hooks

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
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
// FONCTIONS D'ARRONDI DES MONTANTS
// ============================================================================

// roundAmount arrondit proprement à 2 décimales pour éviter les erreurs de virgule flottante
// Exemple: 119.70000000000002 → 119.70
func roundAmount(val float64) float64 {
	return math.Round(val*100) / 100
}

// roundInvoiceAmounts arrondit TOUS les montants d'une facture/ticket
// Cette fonction garantit la cohérence des données avant hash et stockage
func roundInvoiceAmounts(record *models.Record) {
	// 1. Arrondir les totaux principaux
	record.Set("total_ht", roundAmount(record.GetFloat("total_ht")))
	record.Set("total_tva", roundAmount(record.GetFloat("total_tva")))
	record.Set("total_ttc", roundAmount(record.GetFloat("total_ttc")))

	// 2. Arrondir les champs de remise si présents
	if cartDiscountTtc := record.GetFloat("cart_discount_ttc"); cartDiscountTtc != 0 {
		record.Set("cart_discount_ttc", roundAmount(cartDiscountTtc))
	}
	if lineDiscountsTotalTtc := record.GetFloat("line_discounts_total_ttc"); lineDiscountsTotalTtc != 0 {
		record.Set("line_discounts_total_ttc", roundAmount(lineDiscountsTotalTtc))
	}

	// 3. Arrondir les champs de remboursement
	if remainingAmount := record.GetFloat("remaining_amount"); remainingAmount != 0 {
		record.Set("remaining_amount", roundAmount(remainingAmount))
	}
	if creditNotesTotal := record.GetFloat("credit_notes_total"); creditNotesTotal != 0 {
		record.Set("credit_notes_total", roundAmount(creditNotesTotal))
	}

	// 4. Arrondir les items
	roundItems(record)

	// 5. Arrondir la ventilation TVA
	roundVatBreakdown(record)

	// 6. Vérifier la cohérence HT + TVA = TTC (correction automatique si nécessaire)
	totalHT := record.GetFloat("total_ht")
	totalTVA := record.GetFloat("total_tva")
	totalTTC := record.GetFloat("total_ttc")

	expectedTTC := roundAmount(totalHT + totalTVA)
	if math.Abs(expectedTTC-totalTTC) > 0.01 {
		// Recalculer la TVA pour garantir la cohérence
		correctedTVA := roundAmount(totalTTC - totalHT)
		record.Set("total_tva", correctedTVA)
		log.Printf("🔧 [Arrondi] Correction TVA: %.2f → %.2f (HT=%.2f, TTC=%.2f)",
			totalTVA, correctedTVA, totalHT, totalTTC)
	}
}

// roundItems arrondit les montants de chaque item dans le champ "items"
func roundItems(record *models.Record) {
	itemsRaw := record.Get("items")
	if itemsRaw == nil {
		return
	}

	var items []map[string]interface{}

	// Parser les items selon leur type
	switch v := itemsRaw.(type) {
	case []interface{}:
		for _, it := range v {
			if m, ok := it.(map[string]interface{}); ok {
				items = append(items, m)
			}
		}
	case []map[string]interface{}:
		items = v
	case string:
		if v == "" || v == "null" || v == "[]" {
			return
		}
		if err := json.Unmarshal([]byte(v), &items); err != nil {
			log.Printf("⚠️ [Arrondi] Erreur parsing items: %v", err)
			return
		}
	default:
		// Essayer de marshaler/unmarshaler
		b, err := json.Marshal(v)
		if err != nil {
			return
		}
		if err := json.Unmarshal(b, &items); err != nil {
			return
		}
	}

	if len(items) == 0 {
		return
	}

	// Arrondir chaque item
	for i := range items {
		item := items[i]

		// Arrondir les champs monétaires courants
		moneyFields := []string{
			"unit_price_ht", "unit_price_ttc", "unit_price",
			"total_ht", "total_ttc", "total_tva",
			"line_discount_ttc", "line_discount_value",
			"unit_price_ttc_before_discount",
		}

		for _, field := range moneyFields {
			if val, ok := item[field].(float64); ok {
				item[field] = roundAmount(val)
			}
		}
	}

	record.Set("items", items)
}

// roundVatBreakdown arrondit les montants dans la ventilation TVA
func roundVatBreakdown(record *models.Record) {
	vatRaw := record.Get("vat_breakdown")
	if vatRaw == nil {
		return
	}

	var vatBreakdown []map[string]interface{}

	// Parser selon le type
	switch v := vatRaw.(type) {
	case []interface{}:
		for _, it := range v {
			if m, ok := it.(map[string]interface{}); ok {
				vatBreakdown = append(vatBreakdown, m)
			}
		}
	case []map[string]interface{}:
		vatBreakdown = v
	case string:
		if v == "" || v == "null" || v == "[]" {
			return
		}
		if err := json.Unmarshal([]byte(v), &vatBreakdown); err != nil {
			return
		}
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return
		}
		if err := json.Unmarshal(b, &vatBreakdown); err != nil {
			return
		}
	}

	if len(vatBreakdown) == 0 {
		return
	}

	// Arrondir chaque entrée
	for i := range vatBreakdown {
		entry := vatBreakdown[i]

		vatFields := []string{"base_ht", "vat", "vat_amount", "total_ttc"}
		for _, field := range vatFields {
			if val, ok := entry[field].(float64); ok {
				entry[field] = roundAmount(val)
			}
		}
	}

	record.Set("vat_breakdown", vatBreakdown)
}

// ============================================================================
// HELPER: DÉTECTION SKIP HOOK
// ============================================================================

// shouldSkipHookProcessing vérifie si le hook doit être ignoré
// Retourne true si le document a déjà été traité par une route API
func shouldSkipHookProcessing(record *models.Record) bool {
	// 1. Flag explicite _skip_hook_processing
	if skipFlag := record.Get("_skip_hook_processing"); skipFlag != nil {
		switch v := skipFlag.(type) {
		case bool:
			if v {
				return true
			}
		case string:
			if v == "true" || v == "1" {
				return true
			}
		case int, int64, float64:
			return true
		}
	}

	// 2. Si hash ET sequence_number sont déjà présents → document traité par route API
	if record.GetString("hash") != "" && record.GetInt("sequence_number") > 0 {
		return true
	}

	return false
}

// clearSkipFlag supprime le flag _skip_hook_processing avant sauvegarde
func clearSkipFlag(record *models.Record) {
	record.Set("_skip_hook_processing", nil)
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

		// ═══════════════════════════════════════════════════════════════════════
		// ✅ SKIP SI DÉJÀ TRAITÉ PAR ROUTE API
		// ═══════════════════════════════════════════════════════════════════════
		if shouldSkipHookProcessing(record) {
			log.Printf("⏭️ [Hook] Skip processing pour %s (traité par route API)",
				record.GetString("number"))
			clearSkipFlag(record)
			return nil
		}

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
		// RÈGLE 2: Si original_invoice_id présent → protections & règles
		// ─────────────────────────────────────────────────────────────────────
		if originalInvoiceID != "" {
			orig, err := app.Dao().FindRecordById("invoices", originalInvoiceID)
			if err != nil || orig == nil {
				return fmt.Errorf("document original introuvable (original_invoice_id=%s)", originalInvoiceID)
			}

			// ✅ Règle remboursement (avoirs): l'original doit être validé ET payé
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

				// ═══════════════════════════════════════════════════════════════
				// ⚠️ IMPORTANT: La logique de calcul des avoirs est maintenant
				// dans refund.go. Si on arrive ici sans hash, c'est une création
				// directe (non via route API) - on vérifie juste les limites.
				// ═══════════════════════════════════════════════════════════════
				origTotal := math.Abs(orig.GetFloat("total_ttc"))
				creditTotalSoFar, _ := sumCreditNotesAbsTotal(app, orig.Id)
				remaining := origTotal - creditTotalSoFar

				if remaining <= 0.01 {
					return fmt.Errorf("plus de remboursement possible (remaining=%.2f€)", remaining)
				}

				// Vérifier que le montant de l'avoir ne dépasse pas le restant
				avoirAmount := math.Abs(record.GetFloat("total_ttc"))
				if avoirAmount > remaining+0.01 {
					return fmt.Errorf("montant de l'avoir (%.2f€) dépasse le restant remboursable (%.2f€)", avoirAmount, remaining)
				}
			}

			// Bloquer la conversion si déjà converti
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

			// Facture/avoir lié à un ticket: pas de session/cash_register
			if sessionID != "" || cashRegisterID != "" {
				log.Printf("⚠️ CORRECTION: document lié à un ticket ne peut avoir de session/cash_register")
				record.Set("session", "")
				record.Set("cash_register", "")
			}

			// AVOIR ou facture issue d'un ticket : document comptable
			record.Set("is_pos_ticket", false)
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
		if record.GetString("cash_register") != "" && record.GetString("session") == "" {
			return errors.New("cash_register nécessite une session active")
		}

		// ═════════════════════════════════════════════════════════════════════
		// FIN DES VALIDATIONS - DÉBUT NUMÉROTATION/HASH
		// ═════════════════════════════════════════════════════════════════════

		// ═════════════════════════════════════════════════════════════════════
		// ✅ ARRONDI DES MONTANTS (avant hash pour garantir la cohérence)
		// ═════════════════════════════════════════════════════════════════════
		roundInvoiceAmounts(record)
		log.Printf("✅ [Arrondi] Montants arrondis pour facture: HT=%.2f, TVA=%.2f, TTC=%.2f",
			record.GetFloat("total_ht"), record.GetFloat("total_tva"), record.GetFloat("total_ttc"))

		// Déterminer l'année fiscale
		fiscalYear := time.Now().Year()
		dateStr := record.GetString("date")
		if dateStr != "" {
			if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
				fiscalYear = t.Year()
			} else if t, err := time.Parse("2006-01-02", dateStr); err == nil {
				fiscalYear = t.Year()
			}
		}
		record.Set("fiscal_year", fiscalYear)

		// CAS 1 : Brouillon → pas de numéro, pas de hash
		if status == "draft" {
			record.Set("is_locked", false)
			return nil
		}

		// CAS 2 : Document non brouillon → numérotation + chaînage + hash
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

		// Générer le numéro si absent
		existingNumber := record.GetString("number")
		if existingNumber == "" || !isValidDocumentNumber(existingNumber, fiscalYear) {
			newNumber, err := generateDocumentNumber(app, ownerCompany, invoiceType, fiscalYear, record)
			if err != nil {
				return fmt.Errorf("erreur génération numéro: %w", err)
			}
			record.Set("number", newNumber)
		}

		// ═══════════════════════════════════════════════════════════════════════
		// 🔐 CALCUL DU HASH (seulement si pas déjà présent)
		// ═══════════════════════════════════════════════════════════════════════
		if record.GetString("hash") == "" {
			hashValue := hash.ComputeDocumentHash(record)
			record.Set("hash", hashValue)
		}

		record.Set("is_locked", true)

		// Initialiser les champs de remboursement pour les documents non-avoirs
		if invoiceType != "credit_note" {
			totalTTC := math.Abs(record.GetFloat("total_ttc"))
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
		// ✅ Conversion ticket -> facture
		// ---------------------------------------------------------------------
		if e.Record.GetString("invoice_type") == "invoice" {
			originalID := e.Record.GetString("original_invoice_id")
			if originalID != "" {
				orig, err := app.Dao().FindRecordById("invoices", originalID)
				if err != nil || orig == nil {
					return fmt.Errorf("ticket original introuvable (original_invoice_id=%s)", originalID)
				}

				if !orig.GetBool("is_pos_ticket") {
					return fmt.Errorf("original_invoice_id doit référencer un ticket POS")
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
		// ✅ Mise à jour du document original pour les avoirs
		// ---------------------------------------------------------------------
		if e.Record.GetString("invoice_type") == "credit_note" {
			originalID := e.Record.GetString("original_invoice_id")
			if originalID != "" {
				orig, err := app.Dao().FindRecordById("invoices", originalID)
				if err != nil || orig == nil {
					return fmt.Errorf("document original introuvable (original_invoice_id=%s)", originalID)
				}

				// Mettre à jour has_credit_note
				if !orig.GetBool("has_credit_note") {
					orig.Set("has_credit_note", true)
				}

				// Recalculer credit_notes_total & remaining_amount
				origTotal := math.Abs(orig.GetFloat("total_ttc"))
				currentCreditTotal, _ := sumCreditNotesAbsTotal(app, orig.Id)
				remaining := origTotal - currentCreditTotal
				if remaining < 0 {
					remaining = 0
				}

				orig.Set("credit_notes_total", currentCreditTotal)
				orig.Set("remaining_amount", remaining)

				if err := app.Dao().SaveRecord(orig); err != nil {
					return fmt.Errorf("impossible de mettre à jour le document original: %w", err)
				}

				// -----------------------------------------------------------------
				// Gestion remboursement espèces (si pas déjà géré par la route)
				// -----------------------------------------------------------------
				if e.Record.GetString("refund_method") == "especes" {
					// Vérifier si un cash_movement existe déjà pour cet avoir
					existingCM, _ := app.Dao().FindFirstRecordByFilter(
						"cash_movements",
						fmt.Sprintf("related_invoice = '%s'", e.Record.Id),
					)

					if existingCM == nil {
						// Créer le mouvement de caisse
						origCashRegister := orig.GetString("cash_register")
						if origCashRegister != "" {
							activeSession, err := app.Dao().FindFirstRecordByFilter(
								"cash_sessions",
								fmt.Sprintf("cash_register = '%s' && status = 'open'", origCashRegister),
							)

							if err == nil && activeSession != nil {
								cmCol, err := app.Dao().FindCollectionByNameOrId("cash_movements")
								if err == nil {
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

									cm.Set("meta", map[string]interface{}{
										"source":          "credit_note_cash_refund",
										"original_ticket": orig.Id,
										"credit_note_id":  e.Record.Id,
										"credit_note_num": e.Record.GetString("number"),
									})

									if err := app.Dao().SaveRecord(cm); err != nil {
										log.Printf("⚠️ Erreur création cash_movement: %v", err)
									}
								}
							}
						}
					}
				}
			}
		}

		// Audit log
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
							"modification interdite: le champ '%s' ne peut pas être modifié sur une facture validée",
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
					"transition de statut invalide: %s → %s",
					oldStatus, newStatus,
				)
			}

			// Transition spéciale: draft → validated
			if oldStatus == "draft" && newStatus == "validated" {
				ownerCompany := updated.GetString("owner_company")
				invoiceType := updated.GetString("invoice_type")

				// Année fiscale
				fiscalYear := time.Now().Year()
				dateStr := updated.GetString("date")
				if dateStr != "" {
					if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
						fiscalYear = t.Year()
					} else if t, err := time.Parse("2006-01-02", dateStr); err == nil {
						fiscalYear = t.Year()
					}
				}
				updated.Set("fiscal_year", fiscalYear)

				// ✅ ARRONDI DES MONTANTS (avant hash pour garantir la cohérence)
				roundInvoiceAmounts(updated)
				log.Printf("✅ [Arrondi] Validation brouillon: HT=%.2f, TVA=%.2f, TTC=%.2f",
					updated.GetFloat("total_ht"), updated.GetFloat("total_tva"), updated.GetFloat("total_ttc"))

				// Chaînage
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

				// Numéro
				existingNumber := updated.GetString("number")
				if existingNumber == "" || !isValidDocumentNumber(existingNumber, fiscalYear) {
					newNumber, err := generateDocumentNumber(app, ownerCompany, invoiceType, fiscalYear, updated)
					if err != nil {
						return fmt.Errorf("erreur génération numéro: %w", err)
					}
					updated.Set("number", newNumber)
				}

				// Hash
				hashValue := hash.ComputeDocumentHash(updated)
				updated.Set("hash", hashValue)
				updated.Set("is_locked", true)
			}
		}

		// Si on marque comme payée, s'assurer que paid_at est défini
		oldIsPaid := original.GetBool("is_paid")
		newIsPaid := updated.GetBool("is_paid")
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
			return createAuditLog(app, e.HttpContext, AuditLogParams{
				Action:       "payment_recorded",
				EntityType:   getEntityType(updated),
				EntityID:     updated.Id,
				EntityNumber: updated.GetString("number"),
				OwnerCompany: updated.GetString("owner_company"),
				PreviousValues: map[string]interface{}{
					"is_paid":        oldIsPaid,
					"payment_method": original.GetString("payment_method"),
				},
				NewValues: map[string]interface{}{
					"is_paid":        newIsPaid,
					"payment_method": updated.GetString("payment_method"),
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
		})
	})

	// -------------------------------------------------------------------------
	// HOOK: Avant suppression d'une facture
	// -------------------------------------------------------------------------
	app.OnRecordBeforeDeleteRequest("invoices").Add(func(e *core.RecordDeleteEvent) error {
		record := e.Record
		status := record.GetString("status")

		// Autoriser la suppression des brouillons non verrouillés
		if status == "draft" && !record.GetBool("is_locked") {
			return nil
		}

		return errors.New("suppression interdite: créez un avoir pour annuler cette facture")
	})
}

// ============================================================================
// 🔢 GÉNÉRATION DE NUMÉRO DE DOCUMENT
// ============================================================================

func generateDocumentNumber(app *pocketbase.PocketBase, ownerCompany, invoiceType string, fiscalYear int, record *models.Record) (string, error) {
	var prefix string

	isPOS := record.GetString("cash_register") != ""

	if isPOS {
		record.Set("is_paid", true)
		record.Set("is_pos_ticket", true)
	}

	switch {
	case invoiceType == "credit_note":
		prefix = fmt.Sprintf("AVO-%d-", fiscalYear)
	case isPOS:
		prefix = fmt.Sprintf("TIK-%d-", fiscalYear)
	default:
		prefix = fmt.Sprintf("FAC-%d-", fiscalYear)
	}

	filter := fmt.Sprintf(
		"owner_company = '%s' && fiscal_year = %d && number ~ '%s'",
		ownerCompany, fiscalYear, prefix,
	)

	records, err := app.Dao().FindRecordsByFilter(
		"invoices",
		filter,
		"-sequence_number",
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

func extractSequenceFromNumber(number, prefix string) int {
	if !strings.HasPrefix(number, prefix) {
		return 0
	}
	seqStr := strings.TrimPrefix(number, prefix)
	var seq int
	fmt.Sscanf(seqStr, "%d", &seq)
	return seq
}

func isValidDocumentNumber(number string, fiscalYear int) bool {
	prefixes := []string{
		fmt.Sprintf("FAC-%d-", fiscalYear),
		fmt.Sprintf("AVO-%d-", fiscalYear),
		fmt.Sprintf("DEV-%d-", fiscalYear),
		fmt.Sprintf("TIK-%d-", fiscalYear),
	}

	for _, prefix := range prefixes {
		if strings.HasPrefix(number, prefix) {
			seqPart := strings.TrimPrefix(number, prefix)
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

		// ═══════════════════════════════════════════════════════════════════════
		// ✅ SKIP SI DÉJÀ TRAITÉ PAR ROUTE API
		// ═══════════════════════════════════════════════════════════════════════
		if shouldSkipHookProcessing(record) {
			log.Printf("⏭️ [ClosureHooks] Skip processing pour %s", record.GetString("number"))
			clearSkipFlag(record)
			return nil
		}

		ownerCompany := record.GetString("owner_company")
		invoiceType := record.GetString("invoice_type")
		status := record.GetString("status")
		cashRegister := record.GetString("cash_register")

		if status == "" {
			status = "draft"
			record.Set("status", status)
		}

		if record.Get("is_paid") == nil {
			record.Set("is_paid", false)
		}

		// sold_by
		if record.GetString("sold_by") == "" {
			if e.HttpContext != nil {
				if authRecord := e.HttpContext.Get("authRecord"); authRecord != nil {
					if user, ok := authRecord.(*models.Record); ok {
						record.Set("sold_by", user.Id)
					}
				}
			}
		}

		// Liaison automatique session active
		if cashRegister != "" && record.GetString("session") == "" {
			activeSession, err := app.Dao().FindFirstRecordByFilter(
				"cash_sessions",
				fmt.Sprintf("cash_register = '%s' && status = 'open'", cashRegister),
			)

			if err == nil && activeSession != nil {
				record.Set("session", activeSession.Id)
			}
		}

		// Brouillon → pas de numéro/hash
		if status == "draft" {
			record.Set("is_locked", false)

			fiscalYear := time.Now().Year()
			dateStr := record.GetString("date")
			if dateStr != "" {
				if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
					fiscalYear = t.Year()
				} else if t, err := time.Parse("2006-01-02", dateStr); err == nil {
					fiscalYear = t.Year()
				}
			}
			record.Set("fiscal_year", fiscalYear)

			if invoiceType != "credit_note" {
				totalTTC := math.Abs(record.GetFloat("total_ttc"))
				record.Set("remaining_amount", totalTTC)
				record.Set("credit_notes_total", 0)
				record.Set("has_credit_note", false)
			}
			return nil
		}

		// Non brouillon → numérotation + chaînage + hash
		fiscalYear := time.Now().Year()
		dateStr := record.GetString("date")
		if dateStr != "" {
			if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
				fiscalYear = t.Year()
			} else if t, err := time.Parse("2006-01-02", dateStr); err == nil {
				fiscalYear = t.Year()
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

		// Hash seulement si pas déjà présent
		if record.GetString("hash") == "" {
			hashValue := hash.ComputeDocumentHash(record)
			record.Set("hash", hashValue)
		}

		record.Set("is_locked", true)

		if invoiceType != "credit_note" {
			totalTTC := math.Abs(record.GetFloat("total_ttc"))
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

		if record.GetString("issued_by") == "" && e.HttpContext != nil {
			if authRecord := e.HttpContext.Get("authRecord"); authRecord != nil {
				if user, ok := authRecord.(*models.Record); ok {
					record.Set("issued_by", user.Id)
				}
			}
		}

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

func deepEqual(a, b interface{}) bool {
	aJSON, _ := json.Marshal(a)
	bJSON, _ := json.Marshal(b)
	return string(aJSON) == string(bJSON)
}

// sumCreditNotesAbsTotal calcule la somme absolue des avoirs existants
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
	return math.Round(sum*100) / 100, nil
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
	timestamp := time.Now().UTC().Format(time.RFC3339)

	record.Set("action", params.Action)
	record.Set("entity_type", params.EntityType)
	record.Set("entity_id", params.EntityID)
	record.Set("entity_number", params.EntityNumber)
	record.Set("owner_company", params.OwnerCompany)

	var userID string
	if ctx != nil {
		if authRecord := ctx.Get("authRecord"); authRecord != nil {
			if user, ok := authRecord.(*models.Record); ok {
				userID = user.Id
				record.Set("user_id", userID)
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

	// Chaînage
	lastLog, _ := getLastAuditLog(app, params.OwnerCompany)
	var previousHash string
	if lastLog == nil {
		previousHash = GENESIS_HASH
	} else {
		previousHash = lastLog.GetString("hash")
		if previousHash == "" {
			previousHash = GENESIS_HASH
		}
	}
	record.Set("previous_hash", previousHash)

	auditHash, err := hash.ComputeAuditLogHashWithParams(hash.AuditLogHashParams{
		Action:       params.Action,
		EntityType:   params.EntityType,
		EntityID:     params.EntityID,
		OwnerCompany: params.OwnerCompany,
		UserID:       userID,
		Details:      params.Details,
		PreviousHash: previousHash,
		Timestamp:    timestamp,
	})
	if err != nil {
		log.Printf("⚠️ Erreur calcul hash audit log: %v", err)
	} else {
		record.Set("hash", auditHash)
	}

	return app.Dao().SaveRecord(record)
}

// ============================================================================
// FONCTION D'INITIALISATION GLOBALE
// ============================================================================

func RegisterAllHooks(app *pocketbase.PocketBase) {
	RegisterInvoiceHooks(app)
	RegisterQuoteHooks(app)
	RegisterClosureHooks(app)
	RegisterAuditLogHooks(app)
	RegisterCashSessionHooks(app)
	RegisterInventoryHooks(app)
}
