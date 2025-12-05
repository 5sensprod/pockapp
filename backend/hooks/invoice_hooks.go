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

// Champs autorisés à être modifiés sur une facture validée
var allowedInvoiceUpdates = map[string]bool{
    "status":         true, // Seulement draft -> validated -> sent -> paid
    "payment_method": true,
    "paid_at":        true,
    "is_locked":      true,
    "closure_id":     true,
}

// Transitions de statut autorisées
var allowedStatusTransitions = map[string][]string{
    "draft":     {"validated"},
    "validated": {"sent", "paid"},
    "sent":      {"paid"},
    "paid":      {}, // Terminal - aucune transition autorisée
}

// ============================================================================
// ENREGISTREMENT DES HOOKS
// ============================================================================

func RegisterInvoiceHooks(app *pocketbase.PocketBase) {
    // -------------------------------------------------------------------------
    // HOOK: Avant création d'une facture
    // → Génère le hash, le chaînage, le numéro de séquence
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

        // Si c'est un brouillon, ne pas verrouiller
        if record.GetString("status") == "draft" {
            record.Set("is_locked", false)
        } else {
            record.Set("is_locked", true)
        }

        return nil
    })

    // -------------------------------------------------------------------------
    // HOOK: Après création d'une facture
    // → Crée l'entrée d'audit
    // -------------------------------------------------------------------------
    app.OnRecordAfterCreateRequest("invoices").Add(func(e *core.RecordCreateEvent) error {
        return createAuditLog(app, e.HttpContext, AuditLogParams{
            Action:       "invoice_created",
            EntityType:   "invoice",
            EntityID:     e.Record.Id,
            EntityNumber: e.Record.GetString("number"),
            OwnerCompany: e.Record.GetString("owner_company"),
            Details: map[string]interface{}{
                "invoice_type": e.Record.GetString("invoice_type"),
                "total_ttc":    e.Record.GetFloat("total_ttc"),
                "customer":     e.Record.GetString("customer"),
            },
        })
    })

    // -------------------------------------------------------------------------
    // HOOK: Avant mise à jour d'une facture
    // → BLOQUE les modifications non autorisées
    // -------------------------------------------------------------------------
    app.OnRecordBeforeUpdateRequest("invoices").Add(func(e *core.RecordUpdateEvent) error {
        // Dans la version Go, on récupère une copie de l’état original
        original := e.Record.OriginalCopy()
        updated := e.Record

        // Si la facture est verrouillée, vérifier les champs modifiés
        if original.GetBool("is_locked") {
            // SchemaData() = données des champs définis dans le schéma
            for key := range updated.SchemaData() {
                originalValue := original.Get(key)
                newValue := updated.Get(key)

                // Ignorer les champs système
                if key == "updated" || key == "id" || key == "created" {
                    continue
                }

                // Vérifier si le champ a changé
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
                    "transition de statut invalide: %s → %s n'est pas autorisé",
                    oldStatus, newStatus,
                )
            }

            // Verrouiller si on passe de draft à validated
            if oldStatus == "draft" && newStatus == "validated" {
                updated.Set("is_locked", true)
            }
        }

        return nil
    })

    // -------------------------------------------------------------------------
    // HOOK: Après mise à jour d'une facture
    // → Crée l'entrée d'audit
    // -------------------------------------------------------------------------
    app.OnRecordAfterUpdateRequest("invoices").Add(func(e *core.RecordUpdateEvent) error {
        original := e.Record.OriginalCopy()
        updated := e.Record

        // Déterminer l'action
        action := "invoice_validated"
        oldStatus := original.GetString("status")
        newStatus := updated.GetString("status")

        if oldStatus != newStatus {
            switch newStatus {
            case "validated":
                action = "invoice_validated"
            case "sent":
                action = "invoice_sent"
            case "paid":
                action = "payment_recorded"
            }
        } else if updated.GetString("payment_method") != original.GetString("payment_method") {
            action = "payment_recorded"
        }

        return createAuditLog(app, e.HttpContext, AuditLogParams{
            Action:       action,
            EntityType:   "invoice",
            EntityID:     updated.Id,
            EntityNumber: updated.GetString("number"),
            OwnerCompany: updated.GetString("owner_company"),
            PreviousValues: map[string]interface{}{
                "status":         oldStatus,
                "payment_method": original.GetString("payment_method"),
                "paid_at":        original.GetString("paid_at"),
            },
            NewValues: map[string]interface{}{
                "status":         newStatus,
                "payment_method": updated.GetString("payment_method"),
                "paid_at":        updated.GetString("paid_at"),
            },
        })
    })

    // -------------------------------------------------------------------------
    // HOOK: Avant suppression d'une facture
    // → BLOQUE TOUJOURS
    // -------------------------------------------------------------------------
    app.OnRecordBeforeDeleteRequest("invoices").Add(func(e *core.RecordDeleteEvent) error {
        return errors.New(
            "suppression interdite: les factures ne peuvent pas être supprimées " +
                "conformément à la législation française. Utilisez un avoir pour annuler une facture.",
        )
    })
}

// ============================================================================
// HOOKS POUR LES CLÔTURES
// ============================================================================

func RegisterClosureHooks(app *pocketbase.PocketBase) {
    app.OnRecordBeforeUpdateRequest("closures").Add(func(e *core.RecordUpdateEvent) error {
        return errors.New("modification interdite: les clôtures sont définitives")
    })

    app.OnRecordBeforeDeleteRequest("closures").Add(func(e *core.RecordDeleteEvent) error {
        return errors.New("suppression interdite: les clôtures doivent être conservées")
    })
}

// ============================================================================
// HOOKS POUR LES AUDIT LOGS
// ============================================================================

func RegisterAuditLogHooks(app *pocketbase.PocketBase) {
    // Les audit logs sont aussi chaînés
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

// computeInvoiceHash génère un hash SHA-256 déterministe pour une facture
func computeInvoiceHash(record *models.Record) (string, error) {
    // Structure de données pour le hash (ordre déterministe)
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

    // Ajouter les champs optionnels s'ils existent
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
    // Sérialisation JSON avec clés ordonnées
    jsonData, err := jsonMarshalOrdered(data)
    if err != nil {
        return "", err
    }

    hash := sha256.Sum256(jsonData)
    return hex.EncodeToString(hash[:]), nil
}

// jsonMarshalOrdered sérialise une map avec les clés ordonnées alphabétiquement
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

// deepEqual compare deux valeurs de manière récursive
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
        return err
    }

    record := models.NewRecord(collection)
    record.Set("action", params.Action)
    record.Set("entity_type", params.EntityType)
    record.Set("entity_id", params.EntityID)
    record.Set("entity_number", params.EntityNumber)
    record.Set("owner_company", params.OwnerCompany)

    // Informations utilisateur depuis le contexte
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

    // Le hash et previous_hash seront calculés par le hook OnRecordBeforeCreateRequest
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
