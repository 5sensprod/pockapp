// backend/deposit.go
// Logique métier pour la gestion des acomptes (factures de type "deposit")
// et des factures de solde.
//
// Deux fonctions principales :
//   - CreateDepositInvoice  → génère une facture d'acompte (ACC-YYYY-XXXXXX)
//   - CreateBalanceInvoice  → génère la facture de solde finale

package backend

import (
	"fmt"
	"log"
	"math"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend/hash"
)

// ============================================================================
// TYPES D'ENTRÉE
// ============================================================================

type DepositInput struct {
	OwnerCompany       string
	ParentID           string  // ID de la facture parente (invoice_type="invoice")
	Percentage         float64 // Pourcentage de l'acompte (ex: 30 pour 30%) — exclusif avec Amount
	Amount             float64 // Montant TTC fixe — exclusif avec Percentage
	PaymentMethod      string
	PaymentMethodLabel string
	SoldBy             string
}

type DepositResult struct {
	Deposit       *models.Record // La facture d'acompte créée
	ParentUpdated *models.Record // La facture parente mise à jour
}

type BalanceInvoiceResult struct {
	BalanceInvoice *models.Record
	ParentUpdated  *models.Record
}

// ============================================================================
// CONSTANTES
// ============================================================================

const depositNumberPadding = 6

// ============================================================================
// CreateDepositInvoice
// Crée une facture d'acompte liée à une facture parente B2B.
// ============================================================================

func CreateDepositInvoice(dao *daos.Dao, input DepositInput, soldByID string) (*DepositResult, error) {

	// ─────────────────────────────────────────────────────────────────────────
	// 1. Validation des entrées
	// ─────────────────────────────────────────────────────────────────────────
	if input.ParentID == "" {
		return nil, fmt.Errorf("parent_id requis")
	}
	if input.Percentage == 0 && input.Amount == 0 {
		return nil, fmt.Errorf("percentage ou amount requis")
	}
	if input.Percentage != 0 && input.Amount != 0 {
		return nil, fmt.Errorf("percentage et amount sont mutuellement exclusifs")
	}
	if input.Percentage < 0 || input.Percentage > 100 {
		return nil, fmt.Errorf("percentage invalide (doit être entre 1 et 100)")
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 2. Récupérer et valider la facture parente
	// ─────────────────────────────────────────────────────────────────────────
	parent, err := dao.FindRecordById("invoices", input.ParentID)
	if err != nil || parent == nil {
		return nil, fmt.Errorf("facture parente introuvable (id=%s)", input.ParentID)
	}

	// Vérifications métier sur la parente
	if parent.GetBool("is_pos_ticket") {
		return nil, fmt.Errorf("les acomptes ne sont pas disponibles pour les tickets POS")
	}
	if parent.GetString("invoice_type") != "invoice" {
		return nil, fmt.Errorf("les acomptes ne peuvent être créés que sur des factures (pas des avoirs ou d'autres acomptes)")
	}
	parentStatus := parent.GetString("status")
	if parentStatus == "draft" {
		return nil, fmt.Errorf("impossible de créer un acompte sur un brouillon — validez d'abord la facture")
	}

	parentTotal := math.Round(math.Abs(parent.GetFloat("total_ttc"))*100) / 100
	if parentTotal == 0 {
		return nil, fmt.Errorf("la facture parente a un montant nul")
	}

	// Calculer le solde restant disponible
	existingDepositsTotal := math.Round(parent.GetFloat("deposits_total_ttc")*100) / 100
	balanceAvailable := math.Round((parentTotal-existingDepositsTotal)*100) / 100

	if balanceAvailable <= 0.01 {
		return nil, fmt.Errorf("aucun solde disponible pour un acompte (déjà %.2f€ versés sur %.2f€)", existingDepositsTotal, parentTotal)
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 3. Calculer le montant de l'acompte
	// ─────────────────────────────────────────────────────────────────────────
	var depositAmountTTC float64
	var depositPercentage float64

	if input.Percentage > 0 {
		depositPercentage = input.Percentage
		depositAmountTTC = math.Round((parentTotal*input.Percentage/100)*100) / 100
	} else {
		depositAmountTTC = math.Round(input.Amount*100) / 100
		depositPercentage = math.Round((depositAmountTTC/parentTotal*100)*100) / 100
	}

	if depositAmountTTC <= 0 {
		return nil, fmt.Errorf("montant de l'acompte invalide (%.2f€)", depositAmountTTC)
	}
	if depositAmountTTC > balanceAvailable+0.01 {
		return nil, fmt.Errorf("montant de l'acompte (%.2f€) dépasse le solde disponible (%.2f€)", depositAmountTTC, balanceAvailable)
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 4. Calculer HT et TVA depuis les items de la parente
	//    On applique le même ratio que le pourcentage d'acompte
	// ─────────────────────────────────────────────────────────────────────────
	ratio := depositAmountTTC / parentTotal
	depositHT := math.Round((parent.GetFloat("total_ht")*ratio)*100) / 100
	depositTVA := math.Round((depositAmountTTC-depositHT)*100) / 100

	// 🆕 Calculer le taux de TVA effectif depuis la parente
	parentHT := parent.GetFloat("total_ht")
	var effectiveTvaRate float64
	if parentHT > 0 {
		parentTVA := parent.GetFloat("total_tva")
		effectiveTvaRate = math.Round((parentTVA/parentHT*100)*100) / 100
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 5. Construire l'item unique de la facture d'acompte
	// ─────────────────────────────────────────────────────────────────────────
	parentNumber := parent.GetString("number")
	depositItem := map[string]interface{}{
		"name":          fmt.Sprintf("Acompte (%.0f%%) sur facture %s", depositPercentage, parentNumber),
		"quantity":      1,
		"unit_price_ht": depositHT,
		"tva_rate":      effectiveTvaRate, // 🆕 taux réel au lieu de 0
		"total_ht":      depositHT,
		"total_ttc":     depositAmountTTC,
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 6. Générer le numéro et le hash (chaîne ISCA)
	// ─────────────────────────────────────────────────────────────────────────
	ownerCompany := parent.GetString("owner_company")
	fiscalYear := time.Now().Year()

	depositNumber, err := generateDepositNumber(dao, ownerCompany, fiscalYear)
	if err != nil {
		return nil, fmt.Errorf("erreur génération numéro acompte: %w", err)
	}

	// Chaînage ISCA — on prend la dernière facture de la chaîne principale
	lastInvoice, err := getLastInvoiceForDeposit(dao, ownerCompany)
	var previousHash string
	var sequenceNumber int
	if err != nil || lastInvoice == nil {
		previousHash = genesisHashDeposit
		sequenceNumber = 1
	} else {
		previousHash = lastInvoice.GetString("hash")
		if previousHash == "" {
			previousHash = genesisHashDeposit
		}
		sequenceNumber = lastInvoice.GetInt("sequence_number") + 1
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 7. Créer l'enregistrement facture d'acompte
	// ─────────────────────────────────────────────────────────────────────────
	col, err := dao.FindCollectionByNameOrId("invoices")
	if err != nil {
		return nil, fmt.Errorf("collection invoices introuvable: %w", err)
	}

	deposit := models.NewRecord(col)

	now := time.Now()
	deposit.Set("number", depositNumber)
	deposit.Set("invoice_type", "deposit")
	deposit.Set("date", now.Format(time.RFC3339))
	deposit.Set("customer", parent.GetString("customer"))
	deposit.Set("owner_company", ownerCompany)
	deposit.Set("status", "validated")
	deposit.Set("is_paid", false)
	deposit.Set("is_locked", true)
	deposit.Set("is_pos_ticket", false)

	// Montants
	deposit.Set("total_ht", depositHT)
	deposit.Set("total_tva", depositTVA)
	deposit.Set("total_ttc", depositAmountTTC)
	deposit.Set("currency", parent.GetString("currency"))
	deposit.Set("items", []interface{}{depositItem})

	// Champs acompte spécifiques
	deposit.Set("deposit_percentage", depositPercentage)
	deposit.Set("deposit_amount_ttc", depositAmountTTC)
	deposit.Set("original_invoice_id", input.ParentID)

	// Paiement
	if input.PaymentMethod != "" {
		deposit.Set("payment_method", input.PaymentMethod)
	}
	if input.PaymentMethodLabel != "" {
		deposit.Set("payment_method_label", input.PaymentMethodLabel)
	}

	// Vendeur
	if soldByID != "" {
		deposit.Set("sold_by", soldByID)
	}

	// Chaînage ISCA
	deposit.Set("previous_hash", previousHash)
	deposit.Set("sequence_number", sequenceNumber)
	deposit.Set("fiscal_year", fiscalYear)

	// Hash — on le compute APRÈS avoir tout setté
	deposit.Set("_skip_hook_processing", true)
	hashValue := hash.ComputeDocumentHash(deposit)
	deposit.Set("hash", hashValue)

	deposit.Set("notes", fmt.Sprintf("Facture d'acompte (%.0f%%) sur la facture %s", depositPercentage, parentNumber))

	if err := dao.SaveRecord(deposit); err != nil {
		return nil, fmt.Errorf("erreur sauvegarde acompte: %w", err)
	}

	log.Printf("✅ Acompte %s créé: %.2f€ (%.0f%% de %s)",
		depositNumber, depositAmountTTC, depositPercentage, parentNumber)

	// ─────────────────────────────────────────────────────────────────────────
	// 8. Mettre à jour la facture parente
	// ─────────────────────────────────────────────────────────────────────────
	newDepositsTotal := math.Round((existingDepositsTotal+depositAmountTTC)*100) / 100
	newBalanceDue := math.Round((parentTotal-newDepositsTotal)*100) / 100
	if newBalanceDue < 0 {
		newBalanceDue = 0
	}

	parent.Set("deposits_total_ttc", newDepositsTotal)
	parent.Set("balance_due", newBalanceDue)

	if err := dao.SaveRecord(parent); err != nil {
		// Non-fatal : l'acompte est créé, on log l'erreur
		log.Printf("⚠️ Erreur mise à jour facture parente %s: %v", parentNumber, err)
	}

	return &DepositResult{
		Deposit:       deposit,
		ParentUpdated: parent,
	}, nil
}

// ============================================================================
// CreateBalanceInvoice
// Génère la facture de solde après qu'un ou plusieurs acomptes ont été payés.
// ============================================================================

func CreateBalanceInvoice(dao *daos.Dao, parentID string, soldByID string) (*BalanceInvoiceResult, error) {

	// ─────────────────────────────────────────────────────────────────────────
	// 1. Récupérer et valider la facture parente
	// ─────────────────────────────────────────────────────────────────────────
	parent, err := dao.FindRecordById("invoices", parentID)
	if err != nil || parent == nil {
		return nil, fmt.Errorf("facture parente introuvable (id=%s)", parentID)
	}

	if parent.GetString("invoice_type") != "invoice" {
		return nil, fmt.Errorf("la facture de solde ne peut être générée que depuis une facture standard")
	}
	if parent.GetString("status") == "draft" {
		return nil, fmt.Errorf("impossible de générer une facture de solde depuis un brouillon")
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 2. Récupérer tous les acomptes liés
	// ─────────────────────────────────────────────────────────────────────────
	deposits, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("invoice_type = 'deposit' && original_invoice_id = '%s'", parentID),
		"+created",
		0,
		0,
	)
	if err != nil {
		return nil, fmt.Errorf("erreur récupération acomptes: %w", err)
	}
	if len(deposits) == 0 {
		return nil, fmt.Errorf("aucun acompte trouvé pour cette facture")
	}

	// Vérifier que tous les acomptes sont payés
	for _, d := range deposits {
		if !d.GetBool("is_paid") {
			return nil, fmt.Errorf("l'acompte %s n'est pas encore payé — tous les acomptes doivent être réglés avant de générer la facture de solde",
				d.GetString("number"))
		}
	}

	// Vérifier qu'il n'existe pas déjà une facture de solde
	existing, err := dao.FindFirstRecordByFilter(
		"invoices",
		fmt.Sprintf("invoice_type = 'invoice' && original_invoice_id = '%s'", parentID),
	)
	if err == nil && existing != nil {
		return nil, fmt.Errorf("une facture de solde existe déjà pour cette facture (%s)", existing.GetString("number"))
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 3. Calculer le solde dû
	// ─────────────────────────────────────────────────────────────────────────
	parentTotal := math.Round(math.Abs(parent.GetFloat("total_ttc"))*100) / 100
	depositsTotal := math.Round(parent.GetFloat("deposits_total_ttc")*100) / 100
	balanceDue := math.Round((parentTotal-depositsTotal)*100) / 100

	if balanceDue <= 0 {
		return nil, fmt.Errorf("solde déjà intégralement couvert par les acomptes (%.2f€ versés sur %.2f€)", depositsTotal, parentTotal)
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 4. Construire les items : items originaux + lignes déductives
	// ─────────────────────────────────────────────────────────────────────────
	// Récupérer les items de la parente (type-safe via interface{})
	var parentItems []interface{}
	rawItems := parent.Get("items")
	if items, ok := rawItems.([]interface{}); ok {
		parentItems = items
	}

	// Ajouter une ligne déductive par acompte payé
	balanceItems := make([]interface{}, len(parentItems))
	copy(balanceItems, parentItems)

	for _, d := range deposits {
		depositAmountTTC := math.Abs(d.GetFloat("total_ttc"))
		depositHT := math.Abs(d.GetFloat("total_ht"))
		deductionItem := map[string]interface{}{
			"name":          fmt.Sprintf("Déduction acompte %s", d.GetString("number")),
			"quantity":      1,
			"unit_price_ht": -depositHT,
			"tva_rate":      0,
			"total_ht":      -depositHT,
			"total_ttc":     -depositAmountTTC,
		}
		balanceItems = append(balanceItems, deductionItem)
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 5. Calculer HT/TVA du solde
	// ─────────────────────────────────────────────────────────────────────────
	parentHT := parent.GetFloat("total_ht")
	ratio := balanceDue / parentTotal
	balanceHT := math.Round((parentHT*ratio)*100) / 100
	balanceTVA := math.Round((balanceDue-balanceHT)*100) / 100

	// ─────────────────────────────────────────────────────────────────────────
	// 6. Générer le numéro et le hash (chaîne ISCA — numérotation FAC standard)
	// ─────────────────────────────────────────────────────────────────────────
	ownerCompany := parent.GetString("owner_company")
	fiscalYear := time.Now().Year()

	balanceNumber, err := generateBalanceNumber(dao, ownerCompany, fiscalYear)
	if err != nil {
		return nil, fmt.Errorf("erreur génération numéro facture de solde: %w", err)
	}

	lastInvoice, err := getLastInvoiceForDeposit(dao, ownerCompany)
	var previousHash string
	var sequenceNumber int
	if err != nil || lastInvoice == nil {
		previousHash = genesisHashDeposit
		sequenceNumber = 1
	} else {
		previousHash = lastInvoice.GetString("hash")
		if previousHash == "" {
			previousHash = genesisHashDeposit
		}
		sequenceNumber = lastInvoice.GetInt("sequence_number") + 1
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 7. Créer la facture de solde
	// ─────────────────────────────────────────────────────────────────────────
	col, err := dao.FindCollectionByNameOrId("invoices")
	if err != nil {
		return nil, fmt.Errorf("collection invoices introuvable: %w", err)
	}

	balance := models.NewRecord(col)
	now := time.Now()

	balance.Set("number", balanceNumber)
	balance.Set("invoice_type", "invoice")
	balance.Set("date", now.Format(time.RFC3339))
	balance.Set("due_date", parent.GetString("due_date"))
	balance.Set("customer", parent.GetString("customer"))
	balance.Set("owner_company", ownerCompany)
	balance.Set("status", "validated")
	balance.Set("is_paid", false)
	balance.Set("is_locked", true)
	balance.Set("is_pos_ticket", false)

	// Montants (solde uniquement)
	balance.Set("total_ht", balanceHT)
	balance.Set("total_tva", balanceTVA)
	balance.Set("total_ttc", balanceDue)
	balance.Set("currency", parent.GetString("currency"))
	balance.Set("items", balanceItems)

	// Champs acompte
	balance.Set("deposits_total_ttc", depositsTotal)
	balance.Set("balance_due", balanceDue)
	balance.Set("original_invoice_id", parentID)

	if soldByID != "" {
		balance.Set("sold_by", soldByID)
	}

	// Chaînage ISCA
	balance.Set("previous_hash", previousHash)
	balance.Set("sequence_number", sequenceNumber)
	balance.Set("fiscal_year", fiscalYear)

	balance.Set("_skip_hook_processing", true)
	hashValue := hash.ComputeDocumentHash(balance)
	balance.Set("hash", hashValue)

	balance.Set("notes", fmt.Sprintf(
		"Facture de solde — Facture originale %s (total %.2f€ — acomptes versés %.2f€)",
		parent.GetString("number"), parentTotal, depositsTotal,
	))

	if err := dao.SaveRecord(balance); err != nil {
		return nil, fmt.Errorf("erreur sauvegarde facture de solde: %w", err)
	}

	log.Printf("✅ Facture de solde %s créée: %.2f€ (parente: %s)",
		balanceNumber, balanceDue, parent.GetString("number"))

	return &BalanceInvoiceResult{
		BalanceInvoice: balance,
		ParentUpdated:  parent,
	}, nil
}

// ============================================================================
// HELPERS PRIVÉS
// ============================================================================

const genesisHashDeposit = "0000000000000000000000000000000000000000000000000000000000000000"

// getLastInvoiceForDeposit retourne la dernière facture dans la chaîne ISCA
// (tous types confondus) pour assurer le chaînage correct des séquences.
func getLastInvoiceForDeposit(dao *daos.Dao, ownerCompany string) (*models.Record, error) {
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

// generateDepositNumber génère le prochain numéro ACC-YYYY-XXXXXX
func generateDepositNumber(dao *daos.Dao, ownerCompany string, fiscalYear int) (string, error) {
	prefix := fmt.Sprintf("ACC-%d-", fiscalYear)

	records, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf(
			"owner_company = '%s' && invoice_type = 'deposit' && fiscal_year = %d",
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
		nextSeq = extractDepositSeq(lastNumber, prefix) + 1
	}

	return fmt.Sprintf("%s%0*d", prefix, depositNumberPadding, nextSeq), nil
}

// generateBalanceNumber génère le prochain numéro FAC-YYYY-XXXXXX standard
func generateBalanceNumber(dao *daos.Dao, ownerCompany string, fiscalYear int) (string, error) {
	prefix := fmt.Sprintf("FAC-%d-", fiscalYear)

	records, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf(
			"owner_company = '%s' && fiscal_year = %d && invoice_type = 'invoice'",
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
		nextSeq = extractDepositSeq(lastNumber, prefix) + 1
	}

	return fmt.Sprintf("%s%0*d", prefix, depositNumberPadding, nextSeq), nil
}

func extractDepositSeq(number, prefix string) int {
	if !strings.HasPrefix(number, prefix) {
		return 0
	}
	seqStr := strings.TrimPrefix(number, prefix)
	var seq int
	fmt.Sscanf(seqStr, "%d", &seq)
	return seq
}
