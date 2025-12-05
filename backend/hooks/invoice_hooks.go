package hooks

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/models"
)

// ============================================================================
// CONSTANTES
// ============================================================================

const (
	GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"
)

// Champs autorisés à être modifiés sur une facture verrouillée
// NOUVEAU: is_paid, paid_at, payment_method sont autorisés (indépendants du statut)
var allowedInvoiceUpdates = map[string]bool{
	"status":         true, // draft -> validated -> sent
	"is_paid":        true, // Peut être modifié indépendamment
	"paid_at":        true,
	"payment_method": true,
	"is_locked":      true,
	"closure_id":     true,
}

// Transitions de statut autorisées (SANS "paid")
var allowedStatusTransitions = map[string][]string{
	"draft":     {"validated"},
	"validated": {"sent"},
	"sent":      {}, // Terminal pour le workflow d'envoi
}

// ============================================================================
// ENREGISTREMENT DES HOOKS
// ============================================================================

func RegisterInvoiceHooks(app *pocketbase.PocketBase) {
	// -------------------------------------------------------------------------
	// HOOK: Avant création d'une facture
	// -------------------------------------------------------------------------
	app.OnRecordBeforeCreateRequest("invoices").Add(func(e *core.RecordCreateEvent) error {
		record := e.Record

		// Déterminer l'année fiscale
		fiscalYear := time.Now().Year()
		record.Set("fiscal_year", fiscalYear)

		// Récupérer la dernière facture pour le chaînage
		lastInvoice, err := getLastInvoice(app, record.GetString("owner_company"))

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

		// Calculer le hash de la facture
		hash, err := computeInvoiceHash(record)
		if err != nil {
			return fmt.Errorf("erreur calcul hash: %w", err)
		}
		record.Set("hash", hash)

		// Initialiser is_paid à false si non défini
		if record.Get("is_paid") == nil {
			record.Set("is_paid", false)
		}

		// Verrouillage selon le statut
		if record.GetString("status") == "draft" {
			record.Set("is_locked", false)
		} else {
			record.Set("is_locked", true)
		}

		return nil
	})

	// -------------------------------------------------------------------------
	// HOOK: Après création d'une facture
	// -------------------------------------------------------------------------
	app.OnRecordAfterCreateRequest("invoices").Add(func(e *core.RecordCreateEvent) error {
		action := "invoice_created"
		if e.Record.GetString("invoice_type") == "credit_note" {
			action = "credit_note_created"
		}

		return createAuditLog(app, e.HttpContext, AuditLogParams{
			Action:       action,
			EntityType:   e.Record.GetString("invoice_type"),
			EntityID:     e.Record.Id,
			EntityNumber: e.Record.GetString("number"),
			OwnerCompany: e.Record.GetString("owner_company"),
			Details: map[string]interface{}{
				"invoice_type": e.Record.GetString("invoice_type"),
				"total_ttc":    e.Record.GetFloat("total_ttc"),
				"customer":     e.Record.GetString("customer"),
				"status":       e.Record.GetString("status"),
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
								"Créez un avoir pour annuler cette facture.",
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

			// Verrouiller si on passe de draft à validated
			if oldStatus == "draft" && newStatus == "validated" {
				updated.Set("is_locked", true)
			}
		}

		// Vérification logique sur is_paid
		oldIsPaid := original.GetBool("is_paid")
		newIsPaid := updated.GetBool("is_paid")

		if oldIsPaid && !newIsPaid {
			// On ne peut pas "dé-payer" une facture (annuler un paiement)
			// Sauf si on veut permettre les erreurs de saisie - à discuter
			// Pour l'instant, on autorise (cas de correction d'erreur)
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

		// Déterminer l'action
		action := "invoice_validated"
		oldStatus := original.GetString("status")
		newStatus := updated.GetString("status")
		oldIsPaid := original.GetBool("is_paid")
		newIsPaid := updated.GetBool("is_paid")

		if oldStatus != newStatus {
			switch newStatus {
			case "validated":
				action = "invoice_validated"
			case "sent":
				action = "invoice_sent"
			}
		} else if !oldIsPaid && newIsPaid {
			action = "payment_recorded"
		}

		return createAuditLog(app, e.HttpContext, AuditLogParams{
			Action:       action,
			EntityType:   updated.GetString("invoice_type"),
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
	// → BLOQUE TOUJOURS (législation française)
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
            "peuvent pas être supprimées. Utilisez un avoir pour annuler une facture.",
    )
})
}

// ============================================================================
// HOOKS CLOSURES
// ============================================================================

func RegisterClosureHooks(app *pocketbase.PocketBase) {
	// 🔒 Empêcher plusieurs clôtures daily pour le même jour et la même société
	app.OnRecordBeforeCreateRequest("closures").Add(func(e *core.RecordCreateEvent) error {
		record := e.Record

		ownerCompany := record.GetString("owner_company")
		closureType := record.GetString("closure_type")
		periodStartStr := record.GetString("period_start")

		if ownerCompany == "" || closureType != "daily" || periodStartStr == "" {
			// Rien de spécial à vérifier
			return nil
		}

		// On parse la date de début de période
		periodStart, err := time.Parse(time.RFC3339, periodStartStr)
		if err != nil {
			return nil // on ne bloque pas, mais on loguerait en prod
		}

		// Début et fin de journée basée sur periodStart
		startOfDay := time.Date(
			periodStart.Year(), periodStart.Month(), periodStart.Day(),
			0, 0, 0, 0, periodStart.Location(),
		)
		endOfDay := startOfDay.Add(24*time.Hour - time.Nanosecond)

		filter := fmt.Sprintf(
			"owner_company = '%s' && closure_type = 'daily' && period_start >= '%s' && period_start <= '%s'",
			ownerCompany,
			startOfDay.Format(time.RFC3339),
			endOfDay.Format(time.RFC3339),
		)

		existing, err := app.Dao().FindRecordsByFilter(
			"closures",
			filter,
			"-created",
			1,
			0,
		)
		if err != nil {
			return err
		}

		if len(existing) > 0 {
			return errors.New("une clôture journalière existe déjà pour cette date")
		}

		return nil
	})

	// Déjà présent :
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

func RegisterAuditLogHooks(app *pocketbase.PocketBase) {
	// Chaînage des logs d'audit
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

		hash, err := computeAuditLogHash(record)
		if err != nil {
			return fmt.Errorf("erreur calcul hash audit: %w", err)
		}
		record.Set("hash", hash)

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

func computeInvoiceHash(record *models.Record) (string, error) {
	data := map[string]interface{}{
		"number":          record.GetString("number"),
		"invoice_type":    record.GetString("invoice_type"),
		"customer":        record.GetString("customer"),
		"owner_company":   record.GetString("owner_company"),
		"date":            record.GetString("date"),
		"items":           record.Get("items"),
		"total_ht":        record.GetFloat("total_ht"),
		"total_tva":       record.GetFloat("total_tva"),
		"total_ttc":       record.GetFloat("total_ttc"),
		"currency":        record.GetString("currency"),
		"previous_hash":   record.GetString("previous_hash"),
		"sequence_number": record.GetInt("sequence_number"),
		"fiscal_year":     record.GetInt("fiscal_year"),
	}

	if original := record.GetString("original_invoice_id"); original != "" {
		data["original_invoice_id"] = original
	}

	return computeHashFromMap(data)
}

func computeAuditLogHash(record *models.Record) (string, error) {
	data := map[string]interface{}{
		"action":        record.GetString("action"),
		"entity_type":   record.GetString("entity_type"),
		"entity_id":     record.GetString("entity_id"),
		"owner_company": record.GetString("owner_company"),
		"user_id":       record.GetString("user_id"),
		"details":       record.Get("details"),
		"previous_hash": record.GetString("previous_hash"),
		"created":       record.GetString("created"),
	}

	return computeHashFromMap(data)
}

func computeHashFromMap(data map[string]interface{}) (string, error) {
	jsonData, err := jsonMarshalOrdered(data)
	if err != nil {
		return "", err
	}

	hash := sha256.Sum256(jsonData)
	return hex.EncodeToString(hash[:]), nil
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
		// Collection audit_logs n'existe pas encore, on skip
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
// FONCTION D'INITIALISATION GLOBALE
// ============================================================================

func RegisterAllHooks(app *pocketbase.PocketBase) {
	RegisterInvoiceHooks(app)
	RegisterClosureHooks(app)
	RegisterAuditLogHooks(app)
}