// backend/refund.go

package backend

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend/hash"
)

// ═══════════════════════════════════════════════════════════════════════════
// DTOs - STRUCTURES DE DONNÉES
// ═══════════════════════════════════════════════════════════════════════════

// RefundInput représente les données d'entrée pour un remboursement
type RefundInput struct {
	OriginalDocumentID string              `json:"original_document_id"` // ID du ticket ou facture
	RefundType         string              `json:"refund_type"`          // "full" ou "partial"
	RefundMethod       string              `json:"refund_method"`        // "especes", "cb", "cheque", "autre"
	RefundedItems      []RefundedItemInput `json:"refunded_items"`       // Items à rembourser (si partial)
	Reason             string              `json:"reason"`               // Motif du remboursement
	IsPosTicket        bool                `json:"is_pos_ticket"`        // true = ticket POS, false = facture B2B
}

// RefundedItemInput représente un item à rembourser
type RefundedItemInput struct {
	OriginalItemIndex int     `json:"original_item_index"` // Index dans le document original
	Quantity          float64 `json:"quantity"`            // Quantité à rembourser
	Reason            string  `json:"reason"`              // Motif spécifique à cet item
}

// RefundResult représente le résultat d'un remboursement
type RefundResult struct {
	CreditNote      *models.Record   `json:"credit_note"`
	OriginalUpdated *models.Record   `json:"original_updated"`
	CashMovement    *models.Record   `json:"cash_movement,omitempty"`
	RefundableItems []map[string]any `json:"refundable_items"`
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE - CRÉATION D'UN AVOIR
// ═══════════════════════════════════════════════════════════════════════════

// CreateCreditNote crée un avoir (remboursement) pour un document existant
// C'est la fonction centrale qui gère à la fois les tickets POS et les factures B2B
func CreateCreditNote(dao *daos.Dao, input RefundInput, soldByUserID string) (*RefundResult, error) {

	// 1) Validation des paramètres
	if input.OriginalDocumentID == "" {
		return nil, fmt.Errorf("original_document_id requis")
	}
	if input.RefundType == "" {
		input.RefundType = "full"
	}
	if input.RefundType != "full" && input.RefundType != "partial" {
		return nil, fmt.Errorf("refund_type invalide (full|partial)")
	}
	if input.RefundMethod == "" {
		input.RefundMethod = "autre"
	}
	if input.Reason == "" {
		return nil, fmt.Errorf("reason requis")
	}

	// 2) Récupérer le document original
	orig, err := dao.FindRecordById("invoices", input.OriginalDocumentID)
	if err != nil || orig == nil {
		return nil, fmt.Errorf("document introuvable: %v", err)
	}

	// Vérifications
	if orig.GetString("invoice_type") != "invoice" {
		return nil, fmt.Errorf("impossible de rembourser un avoir")
	}
	if orig.GetString("status") == "draft" {
		return nil, fmt.Errorf("impossible de rembourser un brouillon")
	}

	// 3) Calculer le montant restant remboursable
	origTotal := roundAmount(absFloat(orig.GetFloat("total_ttc")))
	creditNotesTotal := sumCreditNotesForDocument(dao, orig.Id)
	remaining := roundAmount(origTotal - creditNotesTotal)

	log.Printf("🔍 Document %s: total=%.2f, avoirs=%.2f, remaining=%.2f",
		orig.GetString("number"), origTotal, creditNotesTotal, remaining)

	if remaining <= 0.01 {
		return nil, fmt.Errorf("document déjà totalement remboursé (total: %.2f€, avoirs: %.2f€)",
			origTotal, creditNotesTotal)
	}

	// 4) Construire les items de l'avoir et calculer les totaux
	creditItems, creditTotalHT, creditTotalTVA, creditTotalTTC, err := buildCreditItems(
		dao, orig, input, remaining,
	)
	if err != nil {
		return nil, err
	}

	// 5) Générer le numéro d'avoir et récupérer le chaînage
	ownerCompany := orig.GetString("owner_company")
	fiscalYear := time.Now().Year()

	avoNumber, err := GenerateAvoirNumber(dao, ownerCompany, fiscalYear)
	if err != nil {
		return nil, fmt.Errorf("erreur génération numéro avoir: %v", err)
	}

	previousHash, sequenceNumber := getChainInfo(dao, ownerCompany)

	// 6) Créer le record de l'avoir
	invoicesCol, err := dao.FindCollectionByNameOrId("invoices")
	if err != nil {
		return nil, fmt.Errorf("collection invoices introuvable: %v", err)
	}

	credit := models.NewRecord(invoicesCol)

	// Informations de base
	credit.Set("number", avoNumber)
	credit.Set("owner_company", ownerCompany)
	credit.Set("customer", orig.GetString("customer"))
	credit.Set("invoice_type", "credit_note")
	credit.Set("status", "validated")
	credit.Set("currency", orig.GetString("currency"))
	credit.Set("fiscal_year", fiscalYear)

	// ✅ FIX: Format date ISO (YYYY-MM-DD) cohérent avec hash.normalizeDate()
	credit.Set("date", time.Now().Format("2006-01-02"))

	// Lien vers le document original
	credit.Set("original_invoice_id", orig.Id)

	// Spécifique POS ou B2B
	credit.Set("is_pos_ticket", input.IsPosTicket)
	if input.IsPosTicket {
		credit.Set("session", orig.GetString("session"))
		credit.Set("cash_register", orig.GetString("cash_register"))
	} else {
		credit.Set("session", "")
		credit.Set("cash_register", "")
	}

	// Infos remboursement
	credit.Set("refund_type", input.RefundType)
	credit.Set("refund_method", input.RefundMethod)
	credit.Set("cancellation_reason", input.Reason)

	// Items et montants (NÉGATIFS, ARRONDIS)
	credit.Set("items", creditItems)
	credit.Set("total_ht", roundAmount(-creditTotalHT))
	credit.Set("total_tva", roundAmount(-creditTotalTVA))
	credit.Set("total_ttc", roundAmount(-creditTotalTTC))

	// Chaînage NF525
	credit.Set("previous_hash", previousHash)
	credit.Set("sequence_number", sequenceNumber)
	credit.Set("is_locked", true)

	// Calculer le hash
	hashValue := hash.ComputeDocumentHash(credit)
	credit.Set("hash", hashValue)

	// Utilisateur
	if soldByUserID != "" {
		credit.Set("sold_by", soldByUserID)
	}

	// ✅ FIX: Marquer pour skip le hook (évite recalcul du hash)
	credit.Set("_skip_hook_processing", true)

	// Sauvegarder
	if err := dao.SaveRecord(credit); err != nil {
		return nil, fmt.Errorf("impossible de créer l'avoir: %v", err)
	}

	log.Printf("✅ Avoir %s créé: %.2f€ (document: %s, hash: %s)",
		avoNumber, -creditTotalTTC, orig.GetString("number"), hashValue[:16])

	// 7) Mettre à jour le document original
	newCreditNotesTotal := roundAmount(creditNotesTotal + creditTotalTTC)
	newRemaining := roundAmount(origTotal - newCreditNotesTotal)
	if newRemaining < 0 {
		newRemaining = 0
	}

	orig.Set("has_credit_note", true)
	orig.Set("credit_notes_total", newCreditNotesTotal)
	orig.Set("remaining_amount", newRemaining)

	if err := dao.SaveRecord(orig); err != nil {
		log.Printf("⚠️ Erreur mise à jour document original: %v", err)
	}

	// 8) Recharger le document mis à jour
	origUpdated, _ := dao.FindRecordById("invoices", orig.Id)

	// 9) Calculer les items encore remboursables
	refundableItems := GetRefundableItems(dao, origUpdated)

	return &RefundResult{
		CreditNote:      credit,
		OriginalUpdated: origUpdated,
		RefundableItems: refundableItems,
	}, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCTION DES ITEMS DE L'AVOIR
// ═══════════════════════════════════════════════════════════════════════════

// buildCreditItems construit les items de l'avoir selon le type (full/partial)
func buildCreditItems(dao *daos.Dao, orig *models.Record, input RefundInput, remaining float64) (
	items []map[string]any, totalHT, totalTVA, totalTTC float64, err error,
) {

	origItems, err := ParseItemsFromRecord(orig, "items")
	if err != nil || len(origItems) == 0 {
		return nil, 0, 0, 0, fmt.Errorf("items originaux invalides: %v", err)
	}

	alreadyRefunded := GetRefundedItemsForDocument(dao, orig.Id)

	if input.RefundType == "partial" {
		return buildPartialCreditItems(origItems, alreadyRefunded, input.RefundedItems, remaining)
	}
	return buildFullCreditItems(origItems, alreadyRefunded, input.Reason, remaining)
}

// buildPartialCreditItems construit les items pour un remboursement partiel
func buildPartialCreditItems(
	origItems []map[string]any,
	alreadyRefunded map[int]float64,
	refundedItems []RefundedItemInput,
	remaining float64,
) (items []map[string]any, totalHT, totalTVA, totalTTC float64, err error) {

	if len(refundedItems) == 0 {
		return nil, 0, 0, 0, fmt.Errorf("refunded_items requis si refund_type=partial")
	}

	items = make([]map[string]any, 0, len(refundedItems))

	for i, it := range refundedItems {
		// Validation index
		if it.OriginalItemIndex < 0 || it.OriginalItemIndex >= len(origItems) {
			return nil, 0, 0, 0, fmt.Errorf(
				"refunded_items[%d].original_item_index hors limites (max=%d)",
				i, len(origItems)-1,
			)
		}
		if it.Quantity <= 0 {
			return nil, 0, 0, 0, fmt.Errorf("refunded_items[%d].quantity invalide", i)
		}

		origItem := origItems[it.OriginalItemIndex]
		origQty := GetItemQuantity(origItem)
		refundedQty := alreadyRefunded[it.OriginalItemIndex]
		remainingQty := origQty - refundedQty

		if remainingQty <= 0 {
			return nil, 0, 0, 0, fmt.Errorf(
				"refunded_items[%d]: item déjà totalement remboursé", i,
			)
		}
		if it.Quantity > remainingQty {
			return nil, 0, 0, 0, fmt.Errorf(
				"refunded_items[%d]: quantité (%.2f) > restant remboursable (%.2f)",
				i, it.Quantity, remainingQty,
			)
		}

		// Copier l'item original
		cp := copyMap(origItem)
		cp["quantity"] = it.Quantity
		cp["original_item_index"] = it.OriginalItemIndex
		if it.Reason != "" {
			cp["refund_reason"] = it.Reason
		}

		// ✅ FIX: Calculer les totaux AVEC ARRONDI
		lineHT, lineTVA, lineTTC := ComputeItemTotals(origItem, it.Quantity)
		cp["total_ht"] = lineHT
		cp["total_tva"] = lineTVA
		cp["total_ttc"] = lineTTC

		totalHT += lineHT
		totalTVA += lineTVA
		totalTTC += lineTTC

		items = append(items, cp)
	}

	// Arrondir les totaux finaux
	totalHT = roundAmount(totalHT)
	totalTVA = roundAmount(totalTVA)
	totalTTC = roundAmount(totalTTC)

	// Vérifier qu'on ne dépasse pas le restant
	if totalTTC > remaining+0.01 {
		return nil, 0, 0, 0, fmt.Errorf(
			"montant (%.2f€) dépasse le restant remboursable (%.2f€)",
			totalTTC, remaining,
		)
	}

	return items, totalHT, totalTVA, totalTTC, nil
}

// buildFullCreditItems construit les items pour un remboursement total
func buildFullCreditItems(
	origItems []map[string]any,
	alreadyRefunded map[int]float64,
	reason string,
	remaining float64,
) (items []map[string]any, totalHT, totalTVA, totalTTC float64, err error) {

	items = make([]map[string]any, 0, len(origItems))

	for idx, origItem := range origItems {
		origQty := GetItemQuantity(origItem)
		refundedQty := alreadyRefunded[idx]
		remainingQty := origQty - refundedQty

		if remainingQty <= 0 {
			continue // Item déjà totalement remboursé
		}

		// Copier l'item original
		cp := copyMap(origItem)
		cp["quantity"] = remainingQty
		cp["original_item_index"] = idx
		if reason != "" {
			cp["refund_reason"] = reason
		}

		// ✅ FIX: Calculer les totaux AVEC ARRONDI
		lineHT, lineTVA, lineTTC := ComputeItemTotals(origItem, remainingQty)
		cp["total_ht"] = lineHT
		cp["total_tva"] = lineTVA
		cp["total_ttc"] = lineTTC

		totalHT += lineHT
		totalTVA += lineTVA
		totalTTC += lineTTC

		items = append(items, cp)
	}

	if len(items) == 0 {
		return nil, 0, 0, 0, fmt.Errorf("document déjà totalement remboursé (aucune quantité restante)")
	}

	// Arrondir les totaux finaux
	totalHT = roundAmount(totalHT)
	totalTVA = roundAmount(totalTVA)
	totalTTC = roundAmount(totalTTC)

	// Vérifier qu'on ne dépasse pas le restant
	if totalTTC > remaining+0.01 {
		return nil, 0, 0, 0, fmt.Errorf(
			"montant recalculé (%.2f€) dépasse le restant remboursable (%.2f€)",
			totalTTC, remaining,
		)
	}

	return items, totalHT, totalTVA, totalTTC, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES - CALCUL DES MONTANTS
// ═══════════════════════════════════════════════════════════════════════════

// ComputeItemTotals calcule les totaux (HT, TVA, TTC) d'un item pour une quantité donnée
// ✅ FIX: Les résultats sont ARRONDIS à 2 décimales
func ComputeItemTotals(item map[string]any, qty float64) (ht, tva, ttc float64) {
	origQty := GetItemQuantity(item)
	if origQty <= 0 {
		origQty = 1
	}

	ratio := qty / origQty

	// 1. Calculer les valeurs brutes
	if vTTC, ok := item["total_ttc"].(float64); ok && vTTC != 0 {
		ttc = vTTC * ratio
		if vHT, ok := item["total_ht"].(float64); ok {
			ht = vHT * ratio
		} else {
			// Si pas de HT, on utilise le taux de TVA s'il existe
			vatRate := getVatRate(item)
			ht = ttc / (1 + (vatRate / 100))
		}
	} else {
		// Calcul par le prix unitaire
		unitHT := getUnitHT(item)
		vatRate := getVatRate(item)
		ht = unitHT * qty
		ttc = ht * (1 + (vatRate / 100))
	}

	// 2. ARRONDIR CHAQUE VALEUR INDIVIDUELLEMENT
	ht = roundAmount(ht)
	ttc = roundAmount(ttc)

	// 3. CALCULER LA TVA PAR DIFFÉRENCE (Garantit HT + TVA = TTC)
	tva = roundAmount(ttc - ht)

	return ht, tva, ttc
}

// roundAmount arrondit proprement à 2 décimales pour éviter les .9999999998
func roundAmount(val float64) float64 {
	return math.Round(val*100) / 100
}

// getUnitHT cherche le prix unitaire HT dans l'item
func getUnitHT(item map[string]any) float64 {
	keys := []string{"unit_price", "price_ht", "unit_ht", "amount_ht"}
	for _, k := range keys {
		if v, ok := item[k].(float64); ok {
			return v
		}
	}
	return 0
}

// getVatRate cherche le taux de TVA (ex: 20) dans l'item
func getVatRate(item map[string]any) float64 {
	keys := []string{"vat_rate", "tva_rate", "tax_rate"}
	for _, k := range keys {
		if v, ok := item[k].(float64); ok {
			return v
		}
	}
	return 0
}

// absFloat retourne la valeur absolue d'un float
func absFloat(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES - PARSING DES ITEMS
// ═══════════════════════════════════════════════════════════════════════════

// ParseItemsFromRecord extrait les items d'un record PocketBase (gère tous les formats)
func ParseItemsFromRecord(record *models.Record, fieldName string) ([]map[string]any, error) {
	raw := record.Get(fieldName)
	if raw == nil {
		return nil, fmt.Errorf("champ '%s' absent ou null", fieldName)
	}

	switch v := raw.(type) {
	case []any:
		out := make([]map[string]any, 0, len(v))
		for _, it := range v {
			if m, ok := it.(map[string]any); ok {
				out = append(out, m)
			} else {
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

// GetItemQuantity extrait la quantité d'un item
func GetItemQuantity(item map[string]any) float64 {
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

// copyMap fait une copie superficielle d'une map
func copyMap(src map[string]any) map[string]any {
	cp := make(map[string]any, len(src))
	for k, v := range src {
		cp[k] = v
	}
	return cp
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES - GESTION DES AVOIRS EXISTANTS
// ═══════════════════════════════════════════════════════════════════════════

// sumCreditNotesForDocument calcule la somme des avoirs existants pour un document
func sumCreditNotesForDocument(dao *daos.Dao, documentID string) float64 {
	records, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("invoice_type = 'credit_note' && original_invoice_id = '%s'", documentID),
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
		sum += absFloat(ttc)
	}
	return roundAmount(sum)
}

// GetRefundedItemsForDocument retourne les items déjà remboursés avec leurs quantités
func GetRefundedItemsForDocument(dao *daos.Dao, documentID string) map[int]float64 {
	refunded := make(map[int]float64)

	records, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("invoice_type = 'credit_note' && original_invoice_id = '%s'", documentID),
		"",
		500,
		0,
	)
	if err != nil {
		return refunded
	}

	for _, r := range records {
		items, err := ParseItemsFromRecord(r, "items")
		if err != nil {
			continue
		}

		for _, item := range items {
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
				refunded[idx] += absFloat(GetItemQuantity(item))
			}
		}
	}

	return refunded
}

// GetRefundableItems retourne la liste des items encore remboursables
func GetRefundableItems(dao *daos.Dao, document *models.Record) []map[string]any {
	result := []map[string]any{}
	if document == nil {
		return result
	}

	origItems, err := ParseItemsFromRecord(document, "items")
	if err != nil {
		return result
	}

	alreadyRefunded := GetRefundedItemsForDocument(dao, document.Id)

	for idx, item := range origItems {
		origQty := GetItemQuantity(item)
		refundedQty := alreadyRefunded[idx]
		remainingQty := origQty - refundedQty

		itemName := ""
		for _, key := range []string{"name", "label", "title", "product_name"} {
			if v, ok := item[key].(string); ok && v != "" {
				itemName = v
				break
			}
		}

		result = append(result, map[string]any{
			"index":         idx,
			"name":          itemName,
			"original_qty":  origQty,
			"refunded_qty":  refundedQty,
			"remaining_qty": remainingQty,
			"can_refund":    remainingQty > 0,
		})
	}

	return result
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES - NUMÉROTATION ET CHAÎNAGE
// ═══════════════════════════════════════════════════════════════════════════

// GenerateAvoirNumber génère un numéro d'avoir AVO-YYYY-NNNNNN
func GenerateAvoirNumber(dao *daos.Dao, ownerCompany string, fiscalYear int) (string, error) {
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
		parts := strings.Split(lastNumber, "-")
		if len(parts) == 3 {
			if seq, err := strconv.Atoi(parts[2]); err == nil {
				nextSeq = seq + 1
			}
		}
	}

	return fmt.Sprintf("%s%06d", prefix, nextSeq), nil
}

// getChainInfo récupère le hash précédent et le numéro de séquence pour le chaînage
func getChainInfo(dao *daos.Dao, ownerCompany string) (previousHash string, sequenceNumber int) {
	records, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("owner_company = '%s' && sequence_number > 0", ownerCompany),
		"-sequence_number",
		1,
		0,
	)

	if err != nil || len(records) == 0 {
		return hash.GENESIS_HASH, 1
	}

	lastInvoice := records[0]
	return lastInvoice.GetString("hash"), lastInvoice.GetInt("sequence_number") + 1
}
