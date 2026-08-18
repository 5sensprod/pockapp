package migrations

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// FixSupplierJsonMaxSize — 13 août 2026.
//
// ═══════════════════════════════════════════════════════════════════════════
// UN CHAMP JSON SANS `MaxSize` EST UN CHAMP QU'ON NE PEUT PLUS ÉCRIRE
// ═══════════════════════════════════════════════════════════════════════════
//
// `catalog_v2.go:493-500` déclare `banking` et `payment_terms` en
// `schema.FieldTypeJson` **sans options**. `MaxSize` vaut alors 0, et
// PocketBase le prend au pied de la lettre : toute valeur non vide est refusée
// avec « The maximum allowed JSON size is 0 bytes. »
//
// Et comme PocketBase valide TOUT l'enregistrement à chaque mise à jour — pas
// seulement les champs envoyés —, la moindre modification d'un fournisseur
// échouait, y compris quand le formulaire ne touchait ni l'un ni l'autre.
//
// Mesuré le 13 août 2026 dans la base installée : les 43 fournisseurs portent
// un `payment_terms` non vide (`{"discount":0}`) et 31 un `banking`
// (`{"bic":"","iban":""}`), écrits par le chargeur — qui, lui, passe par le DAO
// et non par l'API, et n'a donc pas rencontré la validation. Le défaut était
// invisible tant qu'aucun écran n'écrivait dans `suppliers` : il est apparu au
// premier, le 13 août 2026.
//
// 10 Kio : même ordre de grandeur que `ensure_product_events.go:169`. Un IBAN,
// un BIC et des conditions de règlement n'en approcheront jamais ; ce n'est pas
// un plafond à calculer, c'est un garde-fou contre l'absurde.
//
// ⚠️ CE QUI N'EST PAS TRAITÉ ICI, ET QUI EST MESURÉ :
// trois autres champs JSON portent le même `maxSize: 0` —
// `cash_registers.settings`, `cash_sessions.totals_by_method` et
// `cash_movements.meta`. **160 des 179 mouvements de caisse ont un `meta` non
// vide** : toute mise à jour d'un de ces enregistrements est donc refusée de la
// même façon. Ce sont les collections de la caisse, le maillon le moins
// négociable : leur correction se fait dans une session dédiée, avec sa propre
// vérification, pas en passant.
func FixSupplierJsonMaxSize(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("suppliers")
	if err != nil {
		// Base sans catalogue : rien à corriger, et ce n'est pas une erreur.
		log.Println("ℹ️ 'suppliers' absente — FixSupplierJsonMaxSize sans objet")
		return nil
	}

	const maxSize = 10240
	changed := false

	for _, name := range []string{"banking", "payment_terms"} {
		field := collection.Schema.GetFieldByName(name)
		if field == nil {
			continue
		}
		if field.Type != schema.FieldTypeJson {
			continue
		}

		options, ok := field.Options.(*schema.JsonOptions)
		if ok && options != nil && options.MaxSize > 0 {
			continue // déjà corrigé
		}

		field.Options = &schema.JsonOptions{MaxSize: maxSize}
		changed = true
	}

	if !changed {
		return nil
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return fmt.Errorf("suppliers: correction du MaxSize JSON: %w", err)
	}

	log.Println("✅ suppliers : MaxSize JSON porté à 10 Kio (banking, payment_terms)")
	return nil
}
