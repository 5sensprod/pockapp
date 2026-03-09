// backend/pay.go
// ═══════════════════════════════════════════════════════════════════════════
// LOGIQUE MÉTIER — ENREGISTREMENT D'UN PAIEMENT
// ═══════════════════════════════════════════════════════════════════════════
// Appelé par POST /api/invoices/:id/pay
// Pattern identique à deposit.go et refund.go

package backend

import (
	"fmt"
	"log"
	"math"
	"time"

	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
)

// ============================================================================
// TYPES
// ============================================================================

type PayInvoiceInput struct {
	PaymentMethod      string // "card", "cash", "check", "transfer", "autre"
	PaymentMethodLabel string // Libellé custom si PaymentMethod == "autre"
	PaidAt             string // ISO8601 optionnel — défaut: maintenant
}

type PayInvoiceResult struct {
	Invoice       *models.Record // La facture mise à jour
	ParentUpdated *models.Record // La facture parente si facture de solde (nil sinon)
}

// ============================================================================
// RecordPayment
// Enregistre le paiement d'une facture B2B.
// Ne recalcule PAS le hash — is_paid est hors champ hashé (allowedInvoiceUpdates).
// L'audit log payment_recorded est déclenché automatiquement par OnRecordAfterUpdateRequest.
// ============================================================================

func RecordPayment(dao *daos.Dao, invoiceID string, input PayInvoiceInput, soldByID string) (*PayInvoiceResult, error) {

	// ─────────────────────────────────────────────────────────────────────────
	// 1. Récupérer et valider la facture
	// ─────────────────────────────────────────────────────────────────────────
	invoice, err := dao.FindRecordById("invoices", invoiceID)
	if err != nil || invoice == nil {
		return nil, fmt.Errorf("facture introuvable (id=%s)", invoiceID)
	}

	// Vérifier que ce n'est pas un ticket POS (route dédiée pour ça)
	if invoice.GetBool("is_pos_ticket") {
		return nil, fmt.Errorf("cette route est réservée aux factures B2B — utilisez la route POS pour les tickets")
	}

	// Vérifier que la facture est validée (pas brouillon, pas un avoir)
	status := invoice.GetString("status")
	if status == "draft" {
		return nil, fmt.Errorf("impossible d'encaisser un brouillon — validez d'abord la facture")
	}

	invoiceType := invoice.GetString("invoice_type")
	if invoiceType == "credit_note" {
		return nil, fmt.Errorf("impossible d'encaisser un avoir")
	}

	// Vérifier que la facture n'est pas déjà payée
	if invoice.GetBool("is_paid") {
		return nil, fmt.Errorf("facture déjà encaissée (payée le %s)", invoice.GetString("paid_at"))
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 2. Déterminer la date de paiement
	// ─────────────────────────────────────────────────────────────────────────
	paidAt := input.PaidAt
	if paidAt == "" {
		paidAt = time.Now().Format(time.RFC3339)
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 3. Enregistrer le paiement sur la facture
	// ─────────────────────────────────────────────────────────────────────────
	invoice.Set("is_paid", true)
	invoice.Set("paid_at", paidAt)

	if input.PaymentMethod != "" {
		invoice.Set("payment_method", input.PaymentMethod)
	}
	if input.PaymentMethodLabel != "" {
		invoice.Set("payment_method_label", input.PaymentMethodLabel)
	}

	if err := dao.SaveRecord(invoice); err != nil {
		return nil, fmt.Errorf("erreur sauvegarde paiement: %w", err)
	}

	log.Printf("✅ Paiement enregistré: facture %s — %.2f€ (%s)",
		invoice.GetString("number"),
		math.Abs(invoice.GetFloat("total_ttc")),
		input.PaymentMethod,
	)

	result := &PayInvoiceResult{
		Invoice: invoice,
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 4. Cas facture de solde → mettre à jour la facture parente
	// Une facture de solde a invoice_type="invoice" ET un original_invoice_id
	// qui pointe vers la facture parente (qui a des acomptes)
	// ─────────────────────────────────────────────────────────────────────────
	if invoiceType == "invoice" {
		originalID := invoice.GetString("original_invoice_id")
		if originalID != "" {
			parent, err := dao.FindRecordById("invoices", originalID)
			if err != nil || parent == nil {
				// Non-fatal : on log mais on ne bloque pas
				log.Printf("⚠️ Facture parente introuvable (original_invoice_id=%s): %v", originalID, err)
			} else if parent.GetString("invoice_type") == "invoice" && !parent.GetBool("is_pos_ticket") {
				// C'est bien une facture parente B2B avec acomptes
				// → marquer la parente comme soldée
				parent.Set("is_paid", true)
				parent.Set("paid_at", paidAt)
				parent.Set("balance_due", 0)

				if err := dao.SaveRecord(parent); err != nil {
					log.Printf("⚠️ Erreur mise à jour facture parente %s: %v",
						parent.GetString("number"), err)
				} else {
					log.Printf("✅ Facture parente %s marquée soldée (balance_due=0)",
						parent.GetString("number"))
					result.ParentUpdated = parent
				}
			}
		}
	}

	return result, nil
}

// ============================================================================
// InvoiceStats
// Calcule les stats globales pour une company, sans pagination.
// Évite le problème du calcul côté frontend sur une liste tronquée à 50 items.
// ============================================================================

type InvoiceStats struct {
	// Compteurs
	InvoiceCount    int `json:"invoice_count"`
	CreditNoteCount int `json:"credit_note_count"`

	// Montants
	TotalTTC       float64 `json:"total_ttc"`        // Somme factures + avoirs (avoirs négatifs)
	CreditNotesTTC float64 `json:"credit_notes_ttc"` // Somme avoirs seuls (négatif)
	Paid           float64 `json:"paid"`             // Somme des factures payées
	Pending        float64 `json:"pending"`          // Somme des factures non payées non en retard
	Overdue        float64 `json:"overdue"`          // Somme des factures en retard
}

// StatsFilter regroupe les paramètres de filtrage pour ComputeInvoiceStats
type StatsFilter struct {
	FiscalYear int    // 0 = pas de filtre année fiscale
	DateFrom   string // "YYYY-MM-DD" — début de période (inclusif), vide = pas de filtre
	DateTo     string // "YYYY-MM-DD" — fin de période (inclusif), vide = pas de filtre
}

// ComputeInvoiceStats calcule les stats sur TOUTES les factures d'une company (sans pagination)
func ComputeInvoiceStats(dao *daos.Dao, companyID string, f StatsFilter) (*InvoiceStats, error) {

	// Construire le filtre
	filter := fmt.Sprintf("owner_company = '%s'", companyID)
	if f.FiscalYear > 0 {
		filter += fmt.Sprintf(" && fiscal_year = %d", f.FiscalYear)
	}
	if f.DateFrom != "" {
		filter += fmt.Sprintf(" && date >= \"%s\"", f.DateFrom)
	}
	if f.DateTo != "" {
		filter += fmt.Sprintf(" && date <= \"%s 23:59:59\"", f.DateTo)
	}

	// Récupérer toutes les factures sans limite de pagination
	records, err := dao.FindRecordsByFilter(
		"invoices",
		filter,
		"-sequence_number",
		0, // 0 = pas de limite
		0,
	)
	if err != nil {
		return nil, fmt.Errorf("erreur récupération factures: %w", err)
	}

	// Calculer la somme des avoirs par facture d'origine (pour le calcul net pending/overdue)
	creditNotesByOriginal := make(map[string]float64)
	for _, r := range records {
		if r.GetString("invoice_type") == "credit_note" {
			origID := r.GetString("original_invoice_id")
			if origID != "" {
				creditNotesByOriginal[origID] += r.GetFloat("total_ttc") // négatif
			}
		}
	}

	stats := &InvoiceStats{}
	now := time.Now()

	for _, inv := range records {
		invType := inv.GetString("invoice_type")
		originalID := inv.GetString("original_invoice_id")

		switch {
		case invType == "invoice" && originalID == "":
			// Factures normales uniquement (pas les factures de solde)
			stats.InvoiceCount++
			ttc := inv.GetFloat("total_ttc")
			stats.TotalTTC += ttc

			creditTotal := creditNotesByOriginal[inv.Id] // négatif ou 0
			netAmount := roundAmount(ttc + creditTotal)

			if inv.GetBool("is_paid") {
				stats.Paid += ttc
			} else if inv.GetString("status") != "draft" {
				if netAmount > 0 {
					stats.Pending += netAmount
					if isInvoiceOverdue(inv, now) {
						stats.Overdue += netAmount
					}
				}
			}

		case invType == "credit_note":
			stats.CreditNoteCount++
			ttc := inv.GetFloat("total_ttc") // déjà négatif
			stats.TotalTTC += ttc
			stats.CreditNotesTTC += ttc

			// deposit et factures de solde (invoice avec originalID) → ignorés comme dans le frontend
		}
	}

	// Arrondir tous les montants finaux
	stats.TotalTTC = roundAmount(stats.TotalTTC)
	stats.CreditNotesTTC = roundAmount(stats.CreditNotesTTC)
	stats.Paid = roundAmount(stats.Paid)
	stats.Pending = roundAmount(stats.Pending)
	stats.Overdue = roundAmount(stats.Overdue)

	return stats, nil
}

// isInvoiceOverdue détermine si une facture est en retard
// Même logique que isOverdue() côté frontend
func isInvoiceOverdue(inv *models.Record, now time.Time) bool {
	dueDateStr := inv.GetString("due_date")
	if dueDateStr == "" {
		return false
	}

	// Essayer les formats courants
	formats := []string{
		"2006-01-02",
		time.RFC3339,
		"2006-01-02 15:04:05.000Z",
	}

	for _, format := range formats {
		if t, err := time.Parse(format, dueDateStr[:min(len(dueDateStr), len(format))]); err == nil {
			return t.Before(now)
		}
	}

	return false
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
