// backend/hash/hash.go
// ═══════════════════════════════════════════════════════════════════════════
// FONCTION DE HASH CENTRALISÉE - NF525 COMPLIANT
// ═══════════════════════════════════════════════════════════════════════════
// Cette fonction DOIT être utilisée PARTOUT où un hash de document est calculé.
// Elle garantit la cohérence entre :
// - Les hooks (invoice_hooks.go)
// - Les routes API (cash_routes.go, invoice_routes.go)
// - Le frontend (closures.ts)
// ═══════════════════════════════════════════════════════════════════════════

package hash

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/models"
)

// GENESIS_HASH est le hash initial de la chaîne (premier document)
const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

// ═══════════════════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE - À UTILISER PARTOUT
// ═══════════════════════════════════════════════════════════════════════════

// ComputeDocumentHash calcule le hash SHA-256 d'un document (facture, ticket, avoir)
// Cette fonction est la SOURCE DE VÉRITÉ pour le calcul du hash.
//
// Champs inclus dans le hash (ordre alphabétique) :
// - customer, date, fiscal_year, invoice_type, number, owner_company
// - previous_hash, sequence_number
// - total_ht, total_ttc, total_tva
// - original_invoice_id (si présent, pour les avoirs)
//
// Champs EXCLUS (ne pas les ajouter !) :
// - items, currency, vat_breakdown, is_pos_ticket, session, cash_register
// - status, is_paid, payment_method, etc.
func ComputeDocumentHash(record *models.Record) string {
	data := buildHashData(record)
	return computeHashFromData(data)
}

// ComputeDocumentHashFromMap calcule le hash à partir d'une map
// Utile quand on n'a pas encore de record PocketBase
func ComputeDocumentHashFromMap(data map[string]interface{}) string {
	// Normaliser les données
	normalized := normalizeHashData(data)
	return computeHashFromData(normalized)
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTIONS INTERNES
// ═══════════════════════════════════════════════════════════════════════════

// buildHashData extrait les champs nécessaires d'un record PocketBase
func buildHashData(record *models.Record) map[string]interface{} {
	data := map[string]interface{}{
		"customer":        record.GetString("customer"),
		"date":            normalizeDate(record.GetString("date")),
		"fiscal_year":     record.GetInt("fiscal_year"),
		"invoice_type":    record.GetString("invoice_type"),
		"number":          record.GetString("number"),
		"owner_company":   record.GetString("owner_company"),
		"previous_hash":   record.GetString("previous_hash"),
		"sequence_number": record.GetInt("sequence_number"),
		"total_ht":        normalizeAmount(record.GetFloat("total_ht")),
		"total_ttc":       normalizeAmount(record.GetFloat("total_ttc")),
		"total_tva":       normalizeAmount(record.GetFloat("total_tva")),
	}

	// Ajouter original_invoice_id SEULEMENT si présent et non vide
	if original := record.GetString("original_invoice_id"); original != "" {
		data["original_invoice_id"] = original
	}

	return data
}

// normalizeHashData normalise une map de données pour le hash
func normalizeHashData(data map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})

	// Champs obligatoires
	requiredFields := []string{
		"customer", "date", "fiscal_year", "invoice_type", "number",
		"owner_company", "previous_hash", "sequence_number",
		"total_ht", "total_ttc", "total_tva",
	}

	for _, field := range requiredFields {
		if v, ok := data[field]; ok {
			switch field {
			case "date":
				result[field] = normalizeDate(fmt.Sprint(v))
			case "total_ht", "total_ttc", "total_tva":
				result[field] = normalizeAmount(toFloat64(v))
			case "fiscal_year", "sequence_number":
				result[field] = toInt(v)
			default:
				result[field] = fmt.Sprint(v)
			}
		}
	}

	// Champ optionnel
	if v, ok := data["original_invoice_id"]; ok && v != nil && fmt.Sprint(v) != "" {
		result["original_invoice_id"] = fmt.Sprint(v)
	}

	return result
}

// normalizeDate normalise le format de date pour le hash
// PocketBase stocke les dates au format "2025-12-27 13:26:00.000Z"
// Mais time.RFC3339 donne "2025-12-27T13:26:00Z"
// On normalise en gardant uniquement "YYYY-MM-DD" pour éviter les problèmes
func normalizeDate(date string) string {
	date = strings.TrimSpace(date)
	if date == "" {
		return date
	}

	// Extraire uniquement la partie date (YYYY-MM-DD)
	// Cela évite les problèmes de format T vs espace, millisecondes, timezone, etc.
	if len(date) >= 10 {
		return date[:10]
	}
	return date
}

// normalizeAmount normalise un montant pour le hash
// Arrondit à 2 décimales pour éviter les problèmes de précision float
func normalizeAmount(amount float64) float64 {
	return math.Round(amount*100) / 100
}

// computeHashFromData calcule le hash SHA-256 à partir d'une map de données
func computeHashFromData(data map[string]interface{}) string {
	// Trier les clés alphabétiquement pour un hash déterministe
	keys := make([]string, 0, len(data))
	for k := range data {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Construire le JSON manuellement pour garantir l'ordre
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

	// Calculer le hash SHA-256
	hash := sha256.Sum256([]byte(builder.String()))
	return hex.EncodeToString(hash[:])
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

func toFloat64(v interface{}) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case float32:
		return float64(t)
	case int:
		return float64(t)
	case int64:
		return float64(t)
	case json.Number:
		f, _ := t.Float64()
		return f
	case string:
		var f float64
		fmt.Sscanf(t, "%f", &f)
		return f
	default:
		return 0
	}
}

func toInt(v interface{}) int {
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	case float32:
		return int(t)
	case json.Number:
		i, _ := t.Int64()
		return int(i)
	case string:
		var i int
		fmt.Sscanf(t, "%d", &i)
		return i
	default:
		return 0
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTIONS POUR AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════════════

// ComputeAuditLogHash calcule le hash d'un audit log (après SaveRecord)
func ComputeAuditLogHash(record *models.Record) (string, error) {
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

	return ComputeHashFromMap(data)
}

// ComputeAuditLogHashWithParams calcule le hash d'un audit log AVANT SaveRecord
// Utilisé car PocketBase ne remplit "created" qu'après la sauvegarde
func ComputeAuditLogHashWithParams(params AuditLogHashParams) (string, error) {
	data := map[string]interface{}{
		"action":        params.Action,
		"entity_type":   params.EntityType,
		"entity_id":     params.EntityID,
		"owner_company": params.OwnerCompany,
		"user_id":       params.UserID,
		"details":       params.Details,
		"previous_hash": params.PreviousHash,
		"created":       params.Timestamp,
	}

	return ComputeHashFromMap(data)
}

// AuditLogHashParams contient les paramètres pour calculer le hash d'un audit log
type AuditLogHashParams struct {
	Action       string
	EntityType   string
	EntityID     string
	OwnerCompany string
	UserID       string
	Details      interface{}
	PreviousHash string
	Timestamp    string
}

// ComputeHashFromMap calcule un hash SHA-256 à partir d'une map quelconque
// Utilisé pour les audit logs et autres structures non-invoice
func ComputeHashFromMap(data map[string]interface{}) (string, error) {
	jsonData, err := jsonMarshalOrdered(data)
	if err != nil {
		return "", err
	}

	hashBytes := sha256.Sum256(jsonData)
	return hex.EncodeToString(hashBytes[:]), nil
}

// jsonMarshalOrdered sérialise une map en JSON avec les clés triées
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
