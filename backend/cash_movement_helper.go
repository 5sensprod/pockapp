// backend/cash_movement_helper.go
// ═══════════════════════════════════════════════════════════════════════════
// HELPER — CRÉATION DE MOUVEMENTS DE CAISSE POUR LES FLUX B2B
// ═══════════════════════════════════════════════════════════════════════════
// Utilisé par : pay.go, deposit.go, refund.go (avoirs B2B)
//
// Principe : quand un paiement/remboursement B2B est en espèces,
// on crée un cash_movement sur la session active de la company.
// Non-fatal : si aucune session n'est trouvée, on logue et on continue.

package backend

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
)

// CashMovementParams regroupe les paramètres pour créer un mouvement de caisse
type CashMovementParams struct {
	OwnerCompany   string
	MovementType   string // "cash_in" | "refund_out"
	Amount         float64
	Reason         string
	RelatedInvoice string // ID de la facture liée (optionnel)
	CreatedBy      string // ID utilisateur (optionnel)
	Meta           map[string]any
}

// CreateCashMovementIfEspeces crée un cash_movement sur la session active
// si et seulement si le moyen de paiement est "especes".
// Retourne le record créé (nil si non-espèces ou pas de session).
// Non-fatal : les erreurs sont loguées mais ne bloquent pas l'appelant.
func CreateCashMovementIfEspeces(dao *daos.Dao, paymentMethod string, params CashMovementParams) *models.Record {
	if paymentMethod != "especes" {
		return nil
	}

	// Trouver la session ouverte pour cette company
	session := findActiveSessionForCompany(dao, params.OwnerCompany)
	if session == nil {
		log.Printf("⚠️ cash_movement ignoré: aucune session ouverte pour company %s", params.OwnerCompany)
		return nil
	}

	col, err := dao.FindCollectionByNameOrId("cash_movements")
	if err != nil {
		log.Printf("⚠️ cash_movement: collection introuvable: %v", err)
		return nil
	}

	cm := models.NewRecord(col)
	cm.Set("owner_company", params.OwnerCompany)
	cm.Set("session", session.Id)
	cm.Set("movement_type", params.MovementType)
	cm.Set("amount", params.Amount)
	cm.Set("reason", params.Reason)

	if params.RelatedInvoice != "" {
		cm.Set("related_invoice", params.RelatedInvoice)
	}
	if params.CreatedBy != "" {
		cm.Set("created_by", params.CreatedBy)
	}
	if params.Meta != nil {
		cm.Set("meta", params.Meta)
	}

	if err := dao.SaveRecord(cm); err != nil {
		log.Printf("⚠️ Erreur création cash_movement (%s %.2f€): %v",
			params.MovementType, params.Amount, err)
		return nil
	}

	log.Printf("✅ cash_movement créé: %s %.2f€ (session %s)",
		params.MovementType, params.Amount, session.Id)
	return cm
}

// findActiveSessionForCompany trouve la session de caisse ouverte
// pour une company donnée. Retourne nil si aucune session n'est ouverte.
func findActiveSessionForCompany(dao *daos.Dao, ownerCompany string) *models.Record {
	filter := fmt.Sprintf("owner_company = '%s' && status = 'open'", ownerCompany)
	session, err := dao.FindFirstRecordByFilter("cash_sessions", filter)
	if err != nil || session == nil {
		return nil
	}
	return session
}
