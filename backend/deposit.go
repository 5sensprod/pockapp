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
	"time"

	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend/hash"
	"pocket-react/backend/numbering"
)

// ============================================================================
// TYPES D'ENTRÉE
// ============================================================================

type DepositInput struct {
	OwnerCompany string
	ParentID     string  // ID de la facture parente (invoice_type="invoice")
	Percentage   float64 // Pourcentage de l'acompte (ex: 30 pour 30%) — exclusif avec Amount
	Amount       float64 // Montant TTC fixe — exclusif avec Percentage
	SoldBy       string
}

// Pas de moyen de paiement ici, et c'est délibéré (arbitrage du 30 août 2026,
// 08-creer-un-acompte-n-encaisse-pas.md) : ÉMETTRE un acompte et l'ENCAISSER
// sont deux gestes. L'encaissement a un seul chemin, RecordPayment (pay.go),
// qui pose `is_paid`, `paid_at` ET le mouvement de caisse ensemble. La
// création écrivait le mouvement SANS poser is_paid : le tiroir disait
// « argent entré » quand le document disait « non encaissé », et le Z — qui
// sélectionne sur is_paid/paid_at (cash_reports.go:653) — ne rattrapait pas
// l'écart. Ne pas réintroduire ces champs : un geste unique au comptoir, si
// on le veut un jour, s'écrit en appelant CreateDepositInvoice PUIS
// RecordPayment, pas en dupliquant l'encaissement ici.

type DepositResult struct {
	Deposit       *models.Record // La facture d'acompte créée
	ParentUpdated *models.Record // La facture parente mise à jour
}

type BalanceInvoiceResult struct {
	BalanceInvoice *models.Record
	ParentUpdated  *models.Record
}

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

	// Une facture déjà réglée ne peut plus recevoir d'acompte : l'argent est
	// encaissé et sa TVA déclarée. Sans ce contrôle, le serveur acceptait un
	// acompte de 100 % sur une facture soldée — le seul rempart était côté
	// client (invoice.types.ts:431), contournable par appel direct à la route.
	// La parente ressortait avec is_paid = true ET balance_due > 0.
	if parent.GetBool("is_paid") {
		return nil, fmt.Errorf("impossible de créer un acompte sur une facture déjà réglée — le montant est encaissé et sa TVA déclarée")
	}

	// Le dossier est clos dès qu'une facture de solde a été émise : y ajouter
	// un acompte fausserait ses lignes déductives, déjà scellées.
	if solde, err := findBalanceInvoice(dao, input.ParentID); err == nil && solde != nil {
		return nil, fmt.Errorf("une facture de solde existe déjà pour cette facture (%s) — aucun acompte ne peut plus s'y ajouter", solde.GetString("number"))
	}

	parentTotal := math.Round(math.Abs(parent.GetFloat("total_ttc"))*100) / 100
	if parentTotal == 0 {
		return nil, fmt.Errorf("la facture parente a un montant nul")
	}

	// Calculer le solde restant disponible.
	//
	// La disponibilité s'assied sur le total NET des acomptes ENCAISSÉS
	// (computeNetDepositsTotal, backend/refund.go) et non sur le champ
	// dénormalisé `deposits_total_ttc`, qui a trois sémantiques divergentes
	// selon le chemin d'écriture. Un acompte remboursé (avoir lié) ne consomme
	// donc pas de solde ; un acompte émis mais non encaissé, si — c'est un
	// document scellé, il engage la facture.
	depositsEngages := computeEngagedDepositsTotal(dao, input.ParentID)
	balanceAvailable := math.Round((parentTotal-depositsEngages)*100) / 100

	if balanceAvailable <= 0.01 {
		return nil, fmt.Errorf("aucun solde disponible pour un acompte (déjà %.2f€ engagés sur %.2f€)", depositsEngages, parentTotal)
	}

	// Le champ dénormalisé reste la base de la mise à jour de la parente (§8),
	// pour ne pas changer ce que lisent les écrans en même temps que ce
	// correctif.
	existingDepositsTotal := math.Round(parent.GetFloat("deposits_total_ttc")*100) / 100

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
		// Arrondir au taux légal le plus proche : 0, 2.1, 5.5, 10, 20
		rawRate := parentTVA / parentHT * 100
		legalRates := []float64{0, 2.1, 5.5, 10, 20}
		closest := 0.0
		minDiff := math.Abs(rawRate - 0)
		for _, r := range legalRates {
			if diff := math.Abs(rawRate - r); diff < minDiff {
				minDiff = diff
				closest = r
			}
		}
		effectiveTvaRate = closest
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

	// Pas de moyen de paiement : l'acompte naît non encaissé (voir DepositInput).

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

	// Aucun mouvement de caisse ici : rien n'est encaissé à l'émission. Le
	// cash_in est posé par RecordPayment (pay.go:122), en même temps que
	// is_paid et paid_at.

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

	// Trois contrôles que seul le client faisait (invoice.types.ts,
	// canCreateBalanceInvoice). Le serveur ne les avait pas, et la route est
	// joignable par tout utilisateur authentifié.
	//
	// Le premier a été constaté en production locale le 30 août 2026 : une
	// facture PAYÉE portant encore `balance_due > 0` — l'état incohérent
	// décrit au §10 Q3 de l'audit — a laissé générer une facture de solde de
	// 20 € sur un dossier déjà réglé. Le document était numéroté, scellé et
	// chaîné ; il a fallu la commande facture-supprimer pour le retirer.
	if parent.GetBool("is_paid") {
		return nil, fmt.Errorf("cette facture est déjà réglée — il n'y a pas de solde à facturer")
	}
	if parent.GetBool("is_pos_ticket") {
		return nil, fmt.Errorf("un ticket de caisse ne porte pas d'acompte, donc pas de facture de solde")
	}
	if parent.GetString("original_invoice_id") != "" {
		return nil, fmt.Errorf("ce document est déjà une facture de solde — un solde ne se resolde pas")
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

	// Un acompte REMBOURSÉ garde is_paid = true : la route d'avoir sur acompte
	// (backend/routes/deposit_routes.go) pose has_credit_note sans toucher
	// is_paid. Le laisser dans la liste lui ferait produire une ligne
	// déductive alors que l'argent est ressorti — et alors que
	// `deposits_total_ttc` a, lui, déjà été décrémenté. Le document ne
	// s'additionnerait plus.
	acomptesRetenus := make([]*models.Record, 0, len(deposits))
	for _, d := range deposits {
		if d.GetBool("has_credit_note") {
			continue
		}
		acomptesRetenus = append(acomptesRetenus, d)
	}
	deposits = acomptesRetenus

	if len(deposits) == 0 {
		return nil, fmt.Errorf("tous les acomptes de cette facture ont été remboursés — il n'y a pas de solde à facturer")
	}

	// Vérifier que tous les acomptes restants sont payés
	for _, d := range deposits {
		if !d.GetBool("is_paid") {
			return nil, fmt.Errorf("l'acompte %s n'est pas encore payé — tous les acomptes doivent être réglés avant de générer la facture de solde",
				d.GetString("number"))
		}
	}

	// Vérifier qu'il n'existe pas déjà une facture de solde
	existing, err := findBalanceInvoice(dao, parentID)
	if err == nil && existing != nil {
		return nil, fmt.Errorf("une facture de solde existe déjà pour cette facture (%s)", existing.GetString("number"))
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 3. Calculer le solde dû
	// ─────────────────────────────────────────────────────────────────────────
	parentTotal := math.Round(math.Abs(parent.GetFloat("total_ttc"))*100) / 100
	// Le solde s'assied sur la MÊME liste que les lignes déductives construites
	// plus bas, et non sur `deposits_total_ttc` : ce champ a trois sémantiques
	// selon le chemin d'écriture emprunté (§10 de l'audit), et un écart entre
	// les deux rendrait un document dont les lignes ne font pas le total.
	depositsTotal := 0.0
	for _, d := range deposits {
		depositsTotal += math.Abs(d.GetFloat("total_ttc"))
	}
	depositsTotal = math.Round(depositsTotal*100) / 100
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

// findBalanceInvoice retourne la facture de solde d'une parente, ou nil.
//
// Une facture de solde est une facture standard (`invoice_type = 'invoice'`)
// qui pointe sa parente par `original_invoice_id` — c'est le seul document de
// ce type à le faire. Un seul chemin de requête, partagé par
// computeEngagedDepositsTotal rend le total des acomptes ENGAGÉS sur une
// facture : encaissés ET émis en attente, nets des avoirs qui les portent.
//
// À ne pas confondre avec computeNetDepositsTotal (backend/refund.go), qui ne
// compte que les acomptes ENCAISSÉS. Les deux règles sont distinctes et le
// restent :
//
//   - encaissé  → ce qui est déduit du reste à payer, et ce que la comptabilité
//     reconnaît (la TVA d'un acompte est exigible à l'encaissement) ;
//   - engagé    → ce qui est déjà promis par un document émis, scellé et
//     numéroté, donc ce qui n'est plus disponible pour un NOUVEL acompte.
//
// Asseoir la disponibilité sur le net encaissé laisserait empiler des acomptes
// impayés dont la somme dépasse la facture — chacun étant un document
// irréversible. C'est le comportement qu'assurait `deposits_total_ttc`,
// incrémenté dès la création, avant que ce champ ne devienne inutilisable.
func computeEngagedDepositsTotal(dao *daos.Dao, parentID string) float64 {
	deposits, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("invoice_type = 'deposit' && original_invoice_id = '%s'", parentID),
		"",
		500,
		0,
	)
	if err != nil {
		return 0
	}

	total := 0.0
	for _, d := range deposits {
		depositTTC := math.Round(math.Abs(d.GetFloat("total_ttc"))*100) / 100
		// Un acompte remboursé libère le solde qu'il retenait.
		creditNotes := sumCreditNotesForDocument(dao, d.Id)
		net := math.Round((depositTTC-creditNotes)*100) / 100
		if net > 0 {
			total += net
		}
	}
	return math.Round(total*100) / 100
}

// CreateBalanceInvoice (qui refuse d'en créer une seconde) et par
// CreateDepositInvoice (qui refuse d'ajouter un acompte à un dossier clos).
func findBalanceInvoice(dao *daos.Dao, parentID string) (*models.Record, error) {
	return dao.FindFirstRecordByFilter(
		"invoices",
		fmt.Sprintf("invoice_type = 'invoice' && original_invoice_id = '%s'", parentID),
	)
}

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

// generateDepositNumber génère le prochain numéro ACC-YYYY-XXXXXX.
//
// Un seul chemin de numérotation : backend/numbering. Filtrait auparavant sur
// `invoice_type = 'deposit'` sans borner la série, triait sur
// `-sequence_number` et retombait sur 1 en silence — mêmes défauts que
// generateBalanceNumber ci-dessous, qui les a payés.
func generateDepositNumber(dao *daos.Dao, ownerCompany string, fiscalYear int) (string, error) {
	serie := numbering.Serie("ACC", fiscalYear)
	return numbering.Suivant(dao, "invoices", numbering.Filtre(ownerCompany, fiscalYear, serie), serie)
}

// generateBalanceNumber génère le prochain numéro FAC-YYYY-XXXXXX standard.
//
// ⚠️ C'est cette fonction qui a produit les 106 factures en double de 2026.
// Elle filtrait sur `invoice_type = 'invoice'` SANS borner la série — or un
// ticket de caisse porte lui aussi `invoice_type = 'invoice'`, il ne s'en
// distingue que par `is_pos_ticket`. Le 3 juin 2026 à 14h50, triant sur
// `-sequence_number`, elle a relu TIK-2026-000547, n'y a pas trouvé le préfixe
// `FAC-2026-`, et est repartie de 000001 alors que la série en était à 000173.
// Ne pas réintroduire de requête maison ici.
func generateBalanceNumber(dao *daos.Dao, ownerCompany string, fiscalYear int) (string, error) {
	serie := numbering.Serie("FAC", fiscalYear)
	return numbering.Suivant(dao, "invoices", numbering.Filtre(ownerCompany, fiscalYear, serie), serie)
}
