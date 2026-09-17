// backend/hooks/discount_limit_hooks.go
//
// Le plafond de remise du vendeur sur les factures et les devis, qui
// s'écrivent par l'API REST de PocketBase (`invoices.ts`, `quotes.ts`).
// La règle est dans `backend/remise` ; la caisse l'applique dans
// `POST /api/pos/ticket`.
//
// Hooks de REQUÊTE : les écritures internes du Go (tickets, acomptes, soldes,
// avoirs de remboursement) ne passent pas par eux. Un avoir créé par l'API
// n'est pas une remise et n'est pas jugé.
package hooks

import (
	"bytes"
	"encoding/json"

	"pocket-react/backend/remise"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
)

type ligneDocument struct {
	ProductID                  string  `json:"product_id"`
	Name                       string  `json:"name"`
	Quantity                   float64 `json:"quantity"`
	UnitPriceHT                float64 `json:"unit_price_ht"`
	TVARate                    float64 `json:"tva_rate"`
	TotalTTC                   float64 `json:"total_ttc"`
	UnitPriceTTCBeforeDiscount float64 `json:"unit_price_ttc_before_discount"`
}

func RegisterDiscountLimitHooks(app *pocketbase.PocketBase) {
	for _, collection := range []string{"invoices", "quotes"} {
		app.OnRecordBeforeCreateRequest(collection).Add(func(e *core.RecordCreateEvent) error {
			return verifierPlafondDocument(app.Dao(), e.HttpContext, e.Record, false)
		})
		app.OnRecordBeforeUpdateRequest(collection).Add(func(e *core.RecordUpdateEvent) error {
			return verifierPlafondDocument(app.Dao(), e.HttpContext, e.Record, true)
		})
	}
}

func verifierPlafondDocument(dao *daos.Dao, c echo.Context, record *models.Record, miseAJour bool) error {
	plafond, limite := remise.Plafond(apis.RequestInfo(c).AuthRecord)
	if !limite || record.GetString("invoice_type") == "credit_note" {
		return nil
	}

	// Une mise à jour qui ne touche ni les lignes ni le total (statut,
	// paiement, envoi) ne rejuge pas un document déjà accepté.
	if miseAJour {
		avant := record.OriginalCopy()
		if memeJSON(avant.Get("items"), record.Get("items")) &&
			avant.GetFloat("total_ttc") == record.GetFloat("total_ttc") &&
			avant.GetFloat("cart_discount_value") == record.GetFloat("cart_discount_value") {
			return nil
		}
	}

	if err := remise.VerifierRemiseGlobale(record.GetFloat("cart_discount_value")); err != nil {
		return apis.NewForbiddenError(err.Error(), nil)
	}

	var items []ligneDocument
	if err := json.Unmarshal(brut(record.Get("items")), &items); err != nil {
		return nil // forme inconnue : la validation du document s'en charge
	}

	lignes := make([]remise.Ligne, len(items))
	produits := make([]string, len(items))
	for i, it := range items {
		prix := it.UnitPriceTTCBeforeDiscount
		if prix <= 0 && it.TotalTTC > 0 && it.Quantity > 0 {
			// Ligne sans prix d'origine connu : pas de remise mesurable
			// hors fiche, le net sert de référence.
			prix = it.TotalTTC / it.Quantity
		}
		lignes[i] = remise.Ligne{
			Nom:          it.Name,
			Quantite:     it.Quantity,
			PrixSaisiTTC: prix,
			NetTTC:       it.TotalTTC,
		}
		produits[i] = it.ProductID
	}
	remise.ResoudreReferences(dao, lignes, produits)

	if err := remise.Verifier(lignes, record.GetFloat("total_ttc"), plafond); err != nil {
		return apis.NewForbiddenError(err.Error(), nil)
	}
	return nil
}

func memeJSON(a, b any) bool {
	var va, vb any
	_ = json.Unmarshal(brut(a), &va)
	_ = json.Unmarshal(brut(b), &vb)
	ja, _ := json.Marshal(va)
	jb, _ := json.Marshal(vb)
	return bytes.Equal(ja, jb)
}

// brut rend la valeur JSON d'un champ, quelle que soit la forme sous laquelle
// PocketBase la tient (types.JsonRaw, []byte, chaîne ou valeur décodée).
func brut(v any) []byte {
	switch x := v.(type) {
	case nil:
		return []byte("null")
	case []byte:
		return x
	case string:
		return []byte(x)
	default:
		b, _ := json.Marshal(x)
		return b
	}
}
