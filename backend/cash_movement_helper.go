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

	// La session du jour, créée au besoin (backend/session_du_jour.go, E-1).
	//
	// ⚠️ Jusqu'au 29 août 2026, cette fonction ABANDONNAIT EN SILENCE quand
	// aucune session n'était ouverte : le mouvement n'était pas orphelin, il
	// était PERDU, et l'argent espèces reçu ce jour-là n'entrait dans aucun
	// tiroir (04-refonte-du-z.md §2). C'est la porte que E-1 ferme.
	session, err := SessionDuJour(dao, params.OwnerCompany, "", params.CreatedBy)
	if err != nil {
		log.Printf("⚠️ cash_movement ignoré: session du jour indisponible (%v)", err)
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
